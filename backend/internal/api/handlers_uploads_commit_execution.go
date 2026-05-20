package api

import (
	"context"
	"errors"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/store"
)

type uploadCommitExecutionService struct {
	server *server
}

func newUploadCommitExecutionService(s *server) uploadCommitExecutionService {
	return uploadCommitExecutionService{server: s}
}

func (svc uploadCommitExecutionService) execute(
	ctx context.Context,
	session uploadCommitSession,
	req uploadCommitRequest,
) (models.JobCreatedResponse, *uploadHTTPError) {
	switch session.mode {
	case uploadModePresigned:
		return svc.executePresigned(ctx, session.profileID, session.uploadID, session.us, req)
	case uploadModeDirect:
		return svc.executeDirect(ctx, session.profileID, session.uploadID, session.us, req)
	default:
		if uploadErr := svc.validateStagingReady(session.us.StagingDir, req); uploadErr != nil {
			return models.JobCreatedResponse{}, uploadErr
		}
		return svc.executeStaging(ctx, session.profileID, newUploadCommitArtifactService().buildFromRequest(session.uploadID, session.us, req).payload)
	}
}

var errStagingPendingArtifact = errors.New("staging upload has pending artifacts")

func (svc uploadCommitExecutionService) validateStagingReady(stagingDir string, req uploadCommitRequest) *uploadHTTPError {
	if stagingDir == "" {
		return newUploadBadRequestError("upload session is missing staging directory", nil)
	}
	pendingPath, err := findPendingStagingArtifact(stagingDir)
	if err != nil {
		return newUploadInternalError("failed to inspect staged upload", map[string]any{"error": err.Error()})
	}
	if pendingPath != "" {
		return newUploadBadRequestError("upload has incomplete staged chunks", map[string]any{"path": pendingPath})
	}
	return validateStagingCommitItems(stagingDir, req.Items)
}

func findPendingStagingArtifact(stagingDir string) (string, error) {
	var pendingPath string
	err := filepath.WalkDir(stagingDir, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(stagingDir, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if rel == "." || rel == "" {
			return nil
		}
		if entry.IsDir() {
			return nil
		}
		if rel == ".chunks" || strings.HasPrefix(rel, ".chunks/") || strings.HasSuffix(entry.Name(), ".tmp") {
			pendingPath = rel
			return errStagingPendingArtifact
		}
		return nil
	})
	if errors.Is(err, errStagingPendingArtifact) {
		return pendingPath, nil
	}
	return "", err
}

func validateStagingCommitItems(stagingDir string, items []uploadCommitItem) *uploadHTTPError {
	for _, item := range items {
		cleanedPath := sanitizeUploadPath(item.Path)
		if cleanedPath == "" {
			continue
		}
		finalPath := filepath.Join(stagingDir, filepath.FromSlash(cleanedPath))
		if !isUnderDir(stagingDir, finalPath) {
			return newUploadBadRequestError("invalid upload path", map[string]any{"path": cleanedPath})
		}
		info, err := os.Lstat(finalPath)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return newUploadBadRequestError("upload item is missing from staging", map[string]any{"path": cleanedPath})
			}
			return newUploadInternalError("failed to inspect staged upload item", map[string]any{"path": cleanedPath, "error": err.Error()})
		}
		if !info.Mode().IsRegular() {
			return newUploadBadRequestError("upload item is not a regular file", map[string]any{"path": cleanedPath})
		}
		if item.Size != nil && *item.Size >= 0 && info.Size() != *item.Size {
			return newUploadBadRequestError("upload item size does not match staging", map[string]any{"path": cleanedPath, "expectedSize": *item.Size, "actualSize": info.Size()})
		}
	}
	return nil
}

func (svc uploadCommitExecutionService) executeStaging(
	ctx context.Context,
	profileID string,
	payload map[string]any,
) (models.JobCreatedResponse, *uploadHTTPError) {
	if _, _, err := jobs.EnsureRcloneCompatible(ctx); err != nil {
		return models.JobCreatedResponse{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "transfer_engine_missing",
			message: "rclone is required to commit an upload (install it or set RCLONE_PATH)",
		}
	}

	job, queueErr := svc.server.enqueueStagingUploadCommit(ctx, profileID, payload)
	if queueErr != nil {
		if errors.Is(queueErr, jobs.ErrJobQueueFull) {
			stats := svc.server.jobs.QueueStats()
			return models.JobCreatedResponse{}, &uploadHTTPError{
				status:  http.StatusTooManyRequests,
				code:    "job_queue_full",
				message: "job queue is full; try again later",
				details: map[string]any{"queueDepth": stats.Depth, "queueCapacity": stats.Capacity},
			}
		}
		return models.JobCreatedResponse{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to enqueue job",
		}
	}

	return models.JobCreatedResponse{JobID: job.ID}, nil
}

func (svc uploadCommitExecutionService) executeImmediate(
	ctx context.Context,
	profileID, uploadID string,
	us store.UploadSession,
	req uploadCommitRequest,
	client *s3.Client,
	multipartUploads []store.MultipartUpload,
) (models.JobCreatedResponse, *uploadHTTPError) {
	artifacts, uploadErr := newUploadCommitVerificationService(svc.server).prepareImmediate(ctx, profileID, uploadID, us, req, client, multipartUploads)
	if uploadErr != nil {
		return models.JobCreatedResponse{}, uploadErr
	}

	job, uploadErr := newUploadCommitFinalizeService(svc.server).finalizeImmediate(ctx, profileID, uploadID, us, artifacts.payload, artifacts.progress, artifacts.indexEntries)
	if uploadErr != nil {
		return models.JobCreatedResponse{}, uploadErr
	}

	return models.JobCreatedResponse{JobID: job.ID}, nil
}

func (svc uploadCommitExecutionService) executePresigned(
	ctx context.Context,
	profileID, uploadID string,
	us store.UploadSession,
	req uploadCommitRequest,
) (models.JobCreatedResponse, *uploadHTTPError) {
	multipartUploads, err := svc.server.store.ListMultipartUploads(ctx, profileID, uploadID)
	if err != nil {
		return models.JobCreatedResponse{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to load multipart uploads",
		}
	}
	if len(multipartUploads) > 0 {
		return models.JobCreatedResponse{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "upload_incomplete",
			message: "multipart uploads are not finalized",
		}
	}

	client, uploadErr := svc.server.multipartClientFromContext(ctx, "presigned uploads require an S3-compatible provider")
	if uploadErr != nil {
		return models.JobCreatedResponse{}, uploadErr
	}
	return svc.executeImmediate(ctx, profileID, uploadID, us, req, client, multipartUploads)
}

func (svc uploadCommitExecutionService) executeDirect(
	ctx context.Context,
	profileID, uploadID string,
	us store.UploadSession,
	req uploadCommitRequest,
) (models.JobCreatedResponse, *uploadHTTPError) {
	secrets, ok := profileFromContext(ctx)
	if !ok {
		return models.JobCreatedResponse{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "missing profile secrets",
		}
	}
	if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
		return models.JobCreatedResponse{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "not_supported",
			message: "direct streaming multipart uploads require an S3-compatible provider",
		}
	}
	client, err := s3ClientFromProfile(secrets, svc.server.cfg.AllowRemote)
	if err != nil {
		return models.JobCreatedResponse{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to prepare multipart client",
		}
	}

	multipartUploads, err := svc.server.store.ListMultipartUploads(ctx, profileID, uploadID)
	if err != nil {
		return models.JobCreatedResponse{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to load multipart uploads",
		}
	}

	if len(multipartUploads) > 0 {
		if err := svc.server.completeDirectMultipartUploads(ctx, profileID, client, multipartUploads); err != nil {
			var uploadErr *uploadHTTPError
			if errors.As(err, &uploadErr) {
				return models.JobCreatedResponse{}, uploadErr
			}
			return models.JobCreatedResponse{}, &uploadHTTPError{
				status:  http.StatusInternalServerError,
				code:    "internal_error",
				message: "failed to finalize multipart upload",
			}
		}
	}
	return svc.executeImmediate(ctx, profileID, uploadID, us, req, client, multipartUploads)
}
