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
	"github.com/aws/smithy-go"

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

type uploadVerificationTarget struct {
	Path         string
	Bucket       string
	Key          string
	ExpectedSize *int64
}

type verifiedUploadObject struct {
	Path         string
	Key          string
	Size         int64
	ETag         string
	LastModified string
}

func (e *uploadHTTPError) Error() string {
	return e.message
}

var errUploadIncomplete = errors.New("upload incomplete")

func buildUploadCommitBasePayload(uploadID string, us store.UploadSession, req uploadCommitRequest) map[string]any {
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
	return payload
}

func buildUploadCommitArtifacts(uploadID string, us store.UploadSession, req uploadCommitRequest) uploadCommitArtifacts {
	payload := buildUploadCommitBasePayload(uploadID, us, req)
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

func buildVerifiedUploadCommitArtifacts(uploadID string, us store.UploadSession, req uploadCommitRequest, verified []verifiedUploadObject, includeTotals bool, itemsTruncated bool) uploadCommitArtifacts {
	payload := buildUploadCommitBasePayload(uploadID, us, req)
	if len(verified) > maxCommitItems {
		itemsTruncated = true
	}

	var totalBytes int64
	indexEntries := make([]store.ObjectIndexEntry, 0, len(verified))
	for _, obj := range verified {
		totalBytes += obj.Size
		indexEntries = append(indexEntries, store.ObjectIndexEntry{
			Key:          obj.Key,
			Size:         obj.Size,
			ETag:         obj.ETag,
			LastModified: obj.LastModified,
		})
	}

	items := verified
	if len(items) > maxCommitItems {
		items = items[:maxCommitItems]
	}
	if len(items) > 0 {
		cleaned := make([]map[string]any, 0, len(items))
		for _, obj := range items {
			cleaned = append(cleaned, map[string]any{
				"path": obj.Path,
				"key":  obj.Key,
				"size": obj.Size,
			})
		}
		payload["items"] = cleaned
	}
	if itemsTruncated {
		payload["itemsTruncated"] = true
	}
	if includeTotals {
		payload["totalFiles"] = len(verified)
		payload["totalBytes"] = totalBytes
	}

	return uploadCommitArtifacts{
		payload:      payload,
		indexEntries: indexEntries,
		progress:     buildVerifiedUploadCommitProgress(len(verified), totalBytes, includeTotals),
	}
}

func buildVerifiedUploadCommitProgress(totalFiles int, totalBytes int64, includeTotals bool) *models.JobProgress {
	if !includeTotals {
		return nil
	}

	files := int64(totalFiles)
	bytes := totalBytes
	return &models.JobProgress{
		ObjectsDone:  &files,
		ObjectsTotal: &files,
		BytesDone:    &bytes,
		BytesTotal:   &bytes,
	}
}

func buildUploadVerificationTargetsFromTracked(objects []store.UploadObject) []uploadVerificationTarget {
	targets := make([]uploadVerificationTarget, 0, len(objects))
	for _, obj := range objects {
		if obj.Path == "" || obj.Bucket == "" || obj.ObjectKey == "" {
			continue
		}
		targets = append(targets, uploadVerificationTarget{
			Path:         obj.Path,
			Bucket:       obj.Bucket,
			Key:          obj.ObjectKey,
			ExpectedSize: obj.ExpectedSize,
		})
	}
	return targets
}

func buildUploadVerificationTargetsFromMultipart(multipartUploads []store.MultipartUpload) []uploadVerificationTarget {
	targets := make([]uploadVerificationTarget, 0, len(multipartUploads))
	for _, meta := range multipartUploads {
		if meta.Path == "" || meta.Bucket == "" || meta.ObjectKey == "" {
			continue
		}
		expectedSize := meta.FileSize
		targets = append(targets, uploadVerificationTarget{
			Path:         meta.Path,
			Bucket:       meta.Bucket,
			Key:          meta.ObjectKey,
			ExpectedSize: &expectedSize,
		})
	}
	return targets
}

func buildUploadVerificationTargetsFromRequest(us store.UploadSession, req uploadCommitRequest) []uploadVerificationTarget {
	targets := make([]uploadVerificationTarget, 0, len(req.Items))
	for _, item := range req.Items {
		cleanedPath := sanitizeUploadPath(item.Path)
		if cleanedPath == "" {
			continue
		}

		key := cleanedPath
		if us.Prefix != "" {
			key = path.Join(us.Prefix, cleanedPath)
		}

		var expectedSize *int64
		if item.Size != nil && *item.Size >= 0 {
			size := *item.Size
			expectedSize = &size
		}
		targets = append(targets, uploadVerificationTarget{
			Path:         cleanedPath,
			Bucket:       us.Bucket,
			Key:          key,
			ExpectedSize: expectedSize,
		})
	}
	return targets
}

func mergeUploadVerificationTargets(groups ...[]uploadVerificationTarget) []uploadVerificationTarget {
	merged := make([]uploadVerificationTarget, 0)
	seen := make(map[string]struct{})
	for _, group := range groups {
		for _, target := range group {
			identity := target.Path
			if identity == "" {
				identity = target.Key
			}
			if identity == "" {
				continue
			}
			if _, exists := seen[identity]; exists {
				continue
			}
			seen[identity] = struct{}{}
			merged = append(merged, target)
		}
	}
	return merged
}

func (s *server) prepareImmediateUploadCommit(
	ctx context.Context,
	profileID, uploadID string,
	us store.UploadSession,
	req uploadCommitRequest,
	client *s3.Client,
	multipartUploads []store.MultipartUpload,
) (uploadCommitArtifacts, *uploadHTTPError) {
	trackedObjects, err := s.store.ListUploadObjects(ctx, profileID, uploadID)
	if err != nil {
		return uploadCommitArtifacts{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to load upload objects",
		}
	}

	trustedTargets := mergeUploadVerificationTargets(
		buildUploadVerificationTargetsFromTracked(trackedObjects),
		buildUploadVerificationTargetsFromMultipart(multipartUploads),
	)
	includeTotals := true
	itemsTruncated := false
	targets := trustedTargets
	if len(targets) == 0 {
		targets = buildUploadVerificationTargetsFromRequest(us, req)
		includeTotals = !req.ItemsTruncated
		itemsTruncated = req.ItemsTruncated
	}
	if len(targets) == 0 {
		return uploadCommitArtifacts{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "upload_incomplete",
			message: "no uploaded objects to commit",
		}
	}

	verified, uploadErr := s.verifyImmediateUploadTargets(ctx, client, targets)
	if uploadErr != nil {
		return uploadCommitArtifacts{}, uploadErr
	}
	return buildVerifiedUploadCommitArtifacts(uploadID, us, req, verified, includeTotals, itemsTruncated), nil
}

func (s *server) verifyImmediateUploadTargets(ctx context.Context, client *s3.Client, targets []uploadVerificationTarget) ([]verifiedUploadObject, *uploadHTTPError) {
	verified := make([]verifiedUploadObject, 0, len(targets))
	for _, target := range targets {
		head, err := client.HeadObject(ctx, &s3.HeadObjectInput{
			Bucket: &target.Bucket,
			Key:    &target.Key,
		})
		if err != nil {
			if uploadVerifyObjectNotFound(err) {
				return nil, &uploadHTTPError{
					status:  http.StatusBadRequest,
					code:    "upload_incomplete",
					message: "uploaded object not found",
					details: map[string]any{"path": target.Path},
				}
			}
			return nil, &uploadHTTPError{
				status:  http.StatusBadGateway,
				code:    "upload_failed",
				message: "failed to verify uploaded object",
				details: map[string]any{"path": target.Path},
			}
		}

		var actualSize int64
		if head.ContentLength != nil {
			actualSize = *head.ContentLength
		}
		if target.ExpectedSize != nil && *target.ExpectedSize >= 0 && actualSize != *target.ExpectedSize {
			return nil, &uploadHTTPError{
				status:  http.StatusBadRequest,
				code:    "upload_incomplete",
				message: "uploaded object size mismatch",
				details: map[string]any{
					"path":         target.Path,
					"expectedSize": *target.ExpectedSize,
					"actualSize":   actualSize,
				},
			}
		}

		etag := ""
		if head.ETag != nil {
			etag = strings.TrimSpace(*head.ETag)
		}
		lastModified := ""
		if head.LastModified != nil {
			lastModified = head.LastModified.UTC().Format(time.RFC3339Nano)
		}
		verified = append(verified, verifiedUploadObject{
			Path:         target.Path,
			Key:          target.Key,
			Size:         actualSize,
			ETag:         etag,
			LastModified: lastModified,
		})
	}
	return verified, nil
}

func uploadVerifyObjectNotFound(err error) bool {
	var apiErr smithy.APIError
	if !errors.As(err, &apiErr) {
		return false
	}
	switch strings.TrimSpace(apiErr.ErrorCode()) {
	case "404", "NoSuchKey", "NoSuchObject", "NotFound":
		return true
	default:
		return false
	}
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
	_ = s.store.DeleteUploadObjectsBySession(ctx, profileID, uploadID)
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
