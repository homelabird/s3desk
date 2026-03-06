package api

import (
	"errors"
	"io"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"s3desk/internal/logging"
)

const downloadStreamProbeBytes = 32 * 1024

func applyDownloadHeaders(h http.Header, entry rcloneListEntry, key string) {
	h.Set("Content-Type", "application/octet-stream")
	h.Set("Cache-Control", "no-store")
	if entry.Size > 0 {
		h.Set("Content-Length", strconv.FormatInt(entry.Size, 10))
	}
	if etag := rcloneETagFromHashes(entry.Hashes); etag != "" {
		h.Set("ETag", etag)
	}
	if lm := rcloneParseTime(entry.ModTime); lm != "" {
		if parsed, err := time.Parse(time.RFC3339Nano, lm); err == nil {
			h.Set("Last-Modified", parsed.UTC().Format(http.TimeFormat))
		}
	}
	if filename := path.Base(key); filename != "" && filename != "." && filename != "/" {
		h.Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	}
}

func cloneDetails(details map[string]any) map[string]any {
	if len(details) == 0 {
		return nil
	}
	out := make(map[string]any, len(details))
	for k, v := range details {
		out[k] = v
	}
	return out
}

func detailsWithError(details map[string]any, err error) map[string]any {
	out := cloneDetails(details)
	if err == nil {
		return out
	}
	if out == nil {
		out = make(map[string]any, 1)
	}
	out["error"] = err.Error()
	return out
}

func (s *server) streamRcloneDownload(
	w http.ResponseWriter,
	proc *rcloneProcess,
	entry rcloneListEntry,
	key string,
	ctx rcloneAPIErrorContext,
	details map[string]any,
) {
	buf := make([]byte, downloadStreamProbeBytes)
	n, readErr := proc.stdout.Read(buf)

	if n == 0 {
		waitErr := proc.wait()
		stderr := strings.TrimSpace(proc.stderr.String())
		switch {
		case waitErr != nil:
			writeRcloneAPIError(w, waitErr, stderr, ctx, details)
			return
		case readErr != nil && !errors.Is(readErr, io.EOF):
			writeError(w, http.StatusBadGateway, ctx.DefaultCode, ctx.DefaultMessage, detailsWithError(details, readErr))
			return
		case entry.Size > 0:
			writeError(w, http.StatusBadGateway, ctx.DefaultCode, ctx.DefaultMessage, detailsWithError(details, errors.New("empty rclone response")))
			return
		default:
			applyDownloadHeaders(w.Header(), entry, key)
			w.WriteHeader(http.StatusOK)
			return
		}
	}

	if errors.Is(readErr, io.EOF) {
		waitErr := proc.wait()
		stderr := strings.TrimSpace(proc.stderr.String())
		if waitErr != nil {
			writeRcloneAPIError(w, waitErr, stderr, ctx, details)
			return
		}
		applyDownloadHeaders(w.Header(), entry, key)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(buf[:n])
		return
	}

	if readErr != nil {
		_ = proc.wait()
		writeError(w, http.StatusBadGateway, ctx.DefaultCode, ctx.DefaultMessage, detailsWithError(details, readErr))
		return
	}

	applyDownloadHeaders(w.Header(), entry, key)
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write(buf[:n]); err != nil {
		_ = proc.wait()
		return
	}

	_, copyErr := io.Copy(w, proc.stdout)
	waitErr := proc.wait()
	stderr := strings.TrimSpace(proc.stderr.String())
	if copyErr == nil && waitErr == nil {
		return
	}

	fields := map[string]any{
		"event": "http.download_stream_truncated",
	}
	for k, v := range details {
		fields[k] = v
	}
	if copyErr != nil {
		fields["copy_error"] = copyErr.Error()
	}
	if waitErr != nil {
		fields["wait_error"] = waitErr.Error()
	}
	if stderr != "" {
		fields["stderr"] = stderr
	}
	logging.WarnFields("download stream ended early", fields)
}
