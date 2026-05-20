package api

import (
	"errors"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
)

const (
	defaultJobLogReadBytes = int64(64 * 1024)
	maxJobLogReadBytes     = int64(1024 * 1024)
)

type jobReadHTTPService struct {
	server *server
}

type jobReadError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type jobLogReadOptions struct {
	tailBytes   int64
	maxBytes    int64
	afterOffset *int64
}

func (e *jobReadError) Error() string {
	return e.message
}

func newJobReadHTTPService(s *server) jobReadHTTPService {
	return jobReadHTTPService{server: s}
}

func newJobReadError(status int, code, message string, details map[string]any) *jobReadError {
	return &jobReadError{
		status:  status,
		code:    code,
		message: message,
		details: details,
	}
}

func writeJobReadFailure(w http.ResponseWriter, err error) bool {
	var readErr *jobReadError
	if !errors.As(err, &readErr) {
		return false
	}
	writeError(w, readErr.status, readErr.code, readErr.message, readErr.details)
	return true
}

func writeJobReadServiceFailure(w http.ResponseWriter, err error) {
	if writeJobRequestPreparationFailure(w, err) || writeJobReadFailure(w, err) {
		return
	}
	writeError(w, http.StatusInternalServerError, "internal_error", "failed to read job resource", nil)
}

func (svc jobReadHTTPService) handleGetJob(w http.ResponseWriter, r *http.Request) {
	job, err := svc.executeGet(r)
	if err != nil {
		writeJobReadServiceFailure(w, err)
		return
	}
	if job == nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to read job resource", nil)
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (svc jobReadHTTPService) handleGetJobArtifact(w http.ResponseWriter, r *http.Request) {
	filename, size, modTime, file, err := svc.executeArtifact(r)
	if err != nil {
		writeJobReadServiceFailure(w, err)
		return
	}
	defer func() { _ = file.Close() }()
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	http.ServeContent(w, r, filename, modTime, file)
}

func (svc jobReadHTTPService) handleGetJobLogs(w http.ResponseWriter, r *http.Request) {
	body, nextOffset, err := svc.executeLogs(r)
	if err != nil {
		writeJobReadServiceFailure(w, err)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("X-Log-Next-Offset", strconv.FormatInt(nextOffset, 10))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func (svc jobReadHTTPService) executeGet(r *http.Request) (*models.Job, error) {
	request, err := svc.server.prepareJobRequest(r.Context(), r)
	if err != nil {
		return nil, err
	}
	return &request.job, nil
}

func (svc jobReadHTTPService) executeArtifact(r *http.Request) (string, int64, time.Time, *os.File, error) {
	request, err := svc.server.prepareJobRequest(r.Context(), r)
	if err != nil {
		return "", 0, time.Time{}, nil, err
	}
	return buildJobArtifactReadResult(svc.server.cfg.DataDir, request)
}

func (svc jobReadHTTPService) executeLogs(r *http.Request) ([]byte, int64, error) {
	request, err := svc.server.prepareJobRequest(r.Context(), r)
	if err != nil {
		return nil, 0, err
	}
	options, err := parseJobLogReadOptions(r)
	if err != nil {
		return nil, 0, err
	}
	return buildJobLogReadResult(svc.server.cfg.DataDir, request.jobID, options)
}

func parseJobLogReadOptions(r *http.Request) (jobLogReadOptions, error) {
	options := jobLogReadOptions{
		tailBytes: defaultJobLogReadBytes,
		maxBytes:  defaultJobLogReadBytes,
	}

	if raw := r.URL.Query().Get("tailBytes"); raw != "" {
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil {
			options.tailBytes = parsed
		} else {
			return jobLogReadOptions{}, newJobReadError(
				http.StatusBadRequest,
				"invalid_request",
				"invalid tailBytes",
				map[string]any{"tailBytes": raw},
			)
		}
	}
	if options.tailBytes < 1 {
		options.tailBytes = 1
	}
	if options.tailBytes > maxJobLogReadBytes {
		options.tailBytes = maxJobLogReadBytes
	}

	rawAfterOffset := r.URL.Query().Get("afterOffset")
	if rawAfterOffset == "" {
		return options, nil
	}

	afterOffset, err := strconv.ParseInt(rawAfterOffset, 10, 64)
	if err != nil || afterOffset < 0 {
		return jobLogReadOptions{}, newJobReadError(
			http.StatusBadRequest,
			"invalid_request",
			"invalid afterOffset",
			map[string]any{"afterOffset": rawAfterOffset},
		)
	}
	options.afterOffset = &afterOffset

	if rawMax := r.URL.Query().Get("maxBytes"); rawMax != "" {
		if parsed, err := strconv.ParseInt(rawMax, 10, 64); err == nil {
			options.maxBytes = parsed
		} else {
			return jobLogReadOptions{}, newJobReadError(
				http.StatusBadRequest,
				"invalid_request",
				"invalid maxBytes",
				map[string]any{"maxBytes": rawMax},
			)
		}
	}
	if options.maxBytes < 1 {
		options.maxBytes = 1
	}
	if options.maxBytes > maxJobLogReadBytes {
		options.maxBytes = maxJobLogReadBytes
	}

	return options, nil
}

func buildJobArtifactReadResult(dataDir string, request jobRequest) (string, int64, time.Time, *os.File, error) {
	switch request.job.Type {
	case jobs.JobTypeS3ZipPrefix, jobs.JobTypeS3ZipObjects:
		// ok
	default:
		return "", 0, time.Time{}, nil, newJobReadError(
			http.StatusNotFound,
			"not_found",
			"job artifact not available for this job type",
			map[string]any{"type": request.job.Type},
		)
	}

	if request.job.Status != models.JobStatusSucceeded {
		return "", 0, time.Time{}, nil, newJobReadError(
			http.StatusConflict,
			"conflict",
			"job artifact is only available after the job succeeds",
			map[string]any{"status": request.job.Status},
		)
	}

	artifactPath, err := jobResourcePath(dataDir, "artifacts", "jobs", request.jobID, ".zip")
	if err != nil {
		return "", 0, time.Time{}, nil, err
	}
	// #nosec G304 -- artifactPath is derived from the configured data directory.
	f, err := os.Open(artifactPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", 0, time.Time{}, nil, newJobReadError(
				http.StatusNotFound,
				"not_found",
				"job artifact not found",
				map[string]any{"jobId": request.jobID},
			)
		}
		return "", 0, time.Time{}, nil, newJobReadError(
			http.StatusInternalServerError,
			"internal_error",
			"failed to open job artifact",
			nil,
		)
	}

	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return "", 0, time.Time{}, nil, newJobReadError(
			http.StatusInternalServerError,
			"internal_error",
			"failed to stat job artifact",
			nil,
		)
	}

	return jobArtifactFilename(request.job), info.Size(), info.ModTime(), f, nil
}

func buildJobLogReadResult(dataDir, jobID string, options jobLogReadOptions) ([]byte, int64, error) {
	logPath, err := jobResourcePath(dataDir, "logs", "jobs", jobID, ".log")
	if err != nil {
		return nil, 0, err
	}
	// #nosec G304 -- logPath is derived from the configured data directory.
	f, err := os.Open(logPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, 0, nil
		}
		return nil, 0, newJobReadError(
			http.StatusInternalServerError,
			"internal_error",
			"failed to open log file",
			nil,
		)
	}
	defer func() { _ = f.Close() }()

	info, err := f.Stat()
	if err != nil {
		return nil, 0, newJobReadError(
			http.StatusInternalServerError,
			"internal_error",
			"failed to stat log file",
			nil,
		)
	}

	size := info.Size()
	if options.afterOffset != nil {
		afterOffset := *options.afterOffset
		if afterOffset > size {
			if size > options.maxBytes {
				afterOffset = size - options.maxBytes
			} else {
				afterOffset = 0
			}
		}
		if _, err := f.Seek(afterOffset, io.SeekStart); err != nil {
			return nil, 0, newJobReadError(
				http.StatusInternalServerError,
				"internal_error",
				"failed to read log file",
				nil,
			)
		}

		body, err := io.ReadAll(io.LimitReader(f, options.maxBytes))
		if err != nil {
			return nil, 0, newJobReadError(
				http.StatusInternalServerError,
				"internal_error",
				"failed to read log file",
				nil,
			)
		}
		return body, afterOffset + int64(len(body)), nil
	}

	start := int64(0)
	if size > options.tailBytes {
		start = size - options.tailBytes
	}
	if _, err := f.Seek(start, io.SeekStart); err != nil {
		return nil, 0, newJobReadError(
			http.StatusInternalServerError,
			"internal_error",
			"failed to read log file",
			nil,
		)
	}
	body, err := io.ReadAll(f)
	if err != nil {
		return nil, 0, newJobReadError(
			http.StatusInternalServerError,
			"internal_error",
			"failed to read log file",
			nil,
		)
	}
	return body, size, nil
}

func jobResourcePath(dataDir, kind, subdir, jobID, suffix string) (string, error) {
	if !isSafeJobResourceID(jobID) {
		return "", newJobReadError(
			http.StatusBadRequest,
			"invalid_request",
			"invalid jobId",
			map[string]any{"jobId": jobID},
		)
	}
	return filepath.Join(dataDir, kind, subdir, jobID+suffix), nil
}

func isSafeJobResourceID(jobID string) bool {
	if jobID == "" || jobID == "." || jobID == ".." {
		return false
	}
	if strings.Contains(jobID, "/") || strings.Contains(jobID, `\`) {
		return false
	}
	return !strings.Contains(jobID, "..")
}
