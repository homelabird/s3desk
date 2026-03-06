package api

import (
	"context"
	"errors"
	"math"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

type uploadCommitArtifacts struct {
	payload      map[string]any
	indexEntries []store.ObjectIndexEntry
	progress     *models.JobProgress
}

type uploadHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

func (e *uploadHTTPError) Error() string {
	return e.message
}

var errUploadIncomplete = errors.New("upload incomplete")

func buildUploadCommitArtifacts(uploadID string, us store.UploadSession, req uploadCommitRequest) uploadCommitArtifacts {
	payload := map[string]any{
		"uploadId": uploadID,
		"bucket":   us.Bucket,
	}
	if us.Prefix != "" {
		payload["prefix"] = us.Prefix
	}

	if label := strings.TrimSpace(req.Label); label != "" {
		payload["label"] = label
	}
	if rootName := strings.TrimSpace(req.RootName); rootName != "" {
		payload["rootName"] = rootName
	}
	switch req.RootKind {
	case "file", "folder", "collection":
		payload["rootKind"] = req.RootKind
	}
	if req.TotalFiles != nil {
		payload["totalFiles"] = *req.TotalFiles
	}
	if req.TotalBytes != nil {
		payload["totalBytes"] = *req.TotalBytes
	}

	items := req.Items
	itemsTruncated := req.ItemsTruncated
	if len(items) > maxCommitItems {
		items = items[:maxCommitItems]
		itemsTruncated = true
	}

	indexEntries := make([]store.ObjectIndexEntry, 0, len(items))
	cleaned := make([]map[string]any, 0, len(items))
	for _, item := range items {
		cleanedPath := sanitizeUploadPath(item.Path)
		if cleanedPath == "" {
			continue
		}
		key := cleanedPath
		if us.Prefix != "" {
			key = path.Join(us.Prefix, cleanedPath)
		}

		entry := map[string]any{
			"path": cleanedPath,
			"key":  key,
		}
		if item.Size != nil && *item.Size >= 0 {
			entry["size"] = *item.Size
			indexEntries = append(indexEntries, store.ObjectIndexEntry{
				Key:  key,
				Size: *item.Size,
			})
		}
		cleaned = append(cleaned, entry)
	}
	if len(cleaned) > 0 {
		payload["items"] = cleaned
	}
	if itemsTruncated {
		payload["itemsTruncated"] = true
	}

	return uploadCommitArtifacts{
		payload:      payload,
		indexEntries: indexEntries,
		progress:     buildUploadCommitProgress(req),
	}
}

func buildUploadCommitProgress(req uploadCommitRequest) *models.JobProgress {
	if req.TotalBytes == nil && req.TotalFiles == nil {
		return nil
	}
	p := models.JobProgress{}
	if req.TotalBytes != nil && *req.TotalBytes >= 0 {
		total := *req.TotalBytes
		p.BytesTotal = &total
		p.BytesDone = &total
	}
	if req.TotalFiles != nil && *req.TotalFiles >= 0 {
		total := int64(*req.TotalFiles)
		p.ObjectsTotal = &total
		p.ObjectsDone = &total
	}
	return &p
}

func (s *server) finalizeImmediateUploadCommit(ctx context.Context, profileID, uploadID string, us store.UploadSession, payload map[string]any, progress *models.JobProgress, indexEntries []store.ObjectIndexEntry) (models.Job, *uploadHTTPError) {
	job, err := s.store.CreateJob(ctx, profileID, store.CreateJobInput{
		Type:    jobs.JobTypeTransferDirectUpload,
		Payload: payload,
	})
	if err != nil {
		return models.Job{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to create job",
		}
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	if err := s.store.UpdateJobStatus(ctx, job.ID, models.JobStatusSucceeded, &now, &now, progress, nil, nil); err != nil {
		return models.Job{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to finalize job",
		}
	}
	if len(indexEntries) > 0 {
		_ = s.store.UpsertObjectIndexBatch(ctx, profileID, us.Bucket, indexEntries, now)
	}

	_ = s.store.DeleteMultipartUploadsBySession(ctx, profileID, uploadID)
	_, _ = s.store.DeleteUploadSession(ctx, profileID, uploadID)

	eventPayload := map[string]any{"status": models.JobStatusSucceeded}
	if progress != nil {
		eventPayload["progress"] = progress
	}
	s.hub.Publish(ws.Event{Type: "job.completed", JobID: job.ID, Payload: eventPayload})
	return job, nil
}

func (s *server) completeDirectMultipartUploads(ctx context.Context, profileID string, client *s3.Client, multipartUploads []store.MultipartUpload) error {
	for _, meta := range multipartUploads {
		if meta.ChunkSize <= 0 || meta.FileSize <= 0 {
			return &uploadHTTPError{
				status:  http.StatusBadRequest,
				code:    "invalid_request",
				message: "multipart metadata missing size",
				details: map[string]any{"path": meta.Path},
			}
		}

		parts, err := s.listMultipartParts(ctx, client, meta)
		if err != nil {
			return &uploadHTTPError{
				status:  http.StatusBadGateway,
				code:    "upload_failed",
				message: "failed to list multipart parts",
				details: map[string]any{"path": meta.Path},
			}
		}

		expectedTotal := int(math.Ceil(float64(meta.FileSize) / float64(meta.ChunkSize)))
		completed, err := buildCompletedMultipartParts(parts, expectedTotal)
		if err != nil {
			return &uploadHTTPError{
				status:  http.StatusBadRequest,
				code:    "upload_incomplete",
				message: "multipart upload is missing parts",
				details: map[string]any{"path": meta.Path},
			}
		}

		_, err = client.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{
			Bucket:   &meta.Bucket,
			Key:      &meta.ObjectKey,
			UploadId: &meta.S3UploadID,
			MultipartUpload: &types.CompletedMultipartUpload{
				Parts: completed,
			},
		})
		if err != nil {
			return &uploadHTTPError{
				status:  http.StatusBadGateway,
				code:    "upload_failed",
				message: "failed to complete multipart upload",
				details: map[string]any{"path": meta.Path},
			}
		}

		_ = s.store.DeleteMultipartUpload(ctx, profileID, meta.UploadID, meta.Path)
	}

	return nil
}

func buildCompletedMultipartParts(parts []types.Part, expectedTotal int) ([]types.CompletedPart, error) {
	partByNumber := make(map[int32]types.Part, len(parts))
	for _, part := range parts {
		if part.PartNumber == nil {
			continue
		}
		partByNumber[*part.PartNumber] = part
	}
	if len(partByNumber) < expectedTotal {
		return nil, errUploadIncomplete
	}

	completed := make([]types.CompletedPart, 0, expectedTotal)
	for i := 1; i <= expectedTotal; i++ {
		part, ok := partByNumber[int32(i)]
		if !ok || part.ETag == nil {
			return nil, errUploadIncomplete
		}
		completed = append(completed, types.CompletedPart{
			ETag:       part.ETag,
			PartNumber: part.PartNumber,
		})
	}
	return completed, nil
}
