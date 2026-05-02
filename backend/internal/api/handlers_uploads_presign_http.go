package api

import (
	"net/http"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/store"
)

type uploadPresignPreparedRequest struct {
	profileID string
	uploadID  string
	us        store.UploadSession
	secrets   models.ProfileSecrets
	req       models.UploadPresignRequest
	relPath   string
	key       string
	expires   time.Duration
	expiresAt string
	err       *uploadHTTPError
	decodeErr error
}

type uploadPresignHTTPService struct {
	server *server
}

func newUploadPresignHTTPService(s *server) uploadPresignHTTPService {
	return uploadPresignHTTPService{server: s}
}

func buildUploadPresignHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	resp := models.ErrorResponse{Error: models.APIError{Code: code, Message: message, Details: details}}
	if norm, ok := normalizedErrorFromCode(code); ok {
		resp.Error.NormalizedError = norm
	}
	return resp
}

func (svc uploadPresignHTTPService) preparePresign(r *http.Request) uploadPresignPreparedRequest {
	profileID := r.Header.Get("X-Profile-Id")
	uploadID := uploadIDFromRequest(r)
	if profileID == "" || uploadID == "" {
		return uploadPresignPreparedRequest{err: newUploadBadRequestError("profile and uploadId are required", nil)}
	}

	us, ok, err := svc.server.store.GetUploadSession(r.Context(), profileID, uploadID)
	if err != nil {
		return uploadPresignPreparedRequest{err: newUploadInternalError("failed to load upload session", nil)}
	}
	if !ok {
		return uploadPresignPreparedRequest{err: &uploadHTTPError{
			status:  http.StatusNotFound,
			code:    "not_found",
			message: "upload session not found",
			details: map[string]any{"uploadId": uploadID},
		}}
	}

	mode := normalizeUploadMode(us.Mode)
	if mode != uploadModePresigned {
		return uploadPresignPreparedRequest{err: newUploadNotSupportedError("presign requires a presigned upload session", nil)}
	}
	if expiresAt, err := time.Parse(time.RFC3339Nano, us.ExpiresAt); err == nil && time.Now().UTC().After(expiresAt) {
		return uploadPresignPreparedRequest{err: &uploadHTTPError{status: http.StatusBadRequest, code: "expired", message: "upload session expired"}}
	}

	secrets, ok := profileFromContext(r.Context())
	if !ok {
		return uploadPresignPreparedRequest{err: newUploadInternalError("missing profile secrets", nil)}
	}
	if !rcloneconfig.IsS3LikeProvider(secrets.Provider) {
		return uploadPresignPreparedRequest{err: newUploadNotSupportedError("presigned uploads require an S3-compatible provider", nil)}
	}

	var req models.UploadPresignRequest
	if err := decodeJSON(r, &req); err != nil {
		return uploadPresignPreparedRequest{decodeErr: err}
	}

	relPath := sanitizeUploadPath(req.Path)
	if relPath == "" {
		return uploadPresignPreparedRequest{err: newUploadBadRequestError("path is required", nil)}
	}

	key := relPath
	if us.Prefix != "" {
		key = path.Join(us.Prefix, relPath)
	}

	expiresSeconds := 900
	if req.ExpiresSeconds != nil {
		expiresSeconds = *req.ExpiresSeconds
	}
	if expiresSeconds < 60 {
		expiresSeconds = 60
	}
	if expiresSeconds > 3600 {
		expiresSeconds = 3600
	}
	expires := time.Duration(expiresSeconds) * time.Second

	return uploadPresignPreparedRequest{
		profileID: profileID,
		uploadID:  uploadID,
		us:        us,
		secrets:   secrets,
		req:       req,
		relPath:   relPath,
		key:       key,
		expires:   expires,
		expiresAt: time.Now().UTC().Add(expires).Format(time.RFC3339Nano),
	}
}

func (svc uploadPresignHTTPService) executeSinglePart(r *http.Request, prepared uploadPresignPreparedRequest) (*models.UploadPresignResponse, *uploadHTTPError) {
	if prepared.req.Size != nil {
		if uploadErr := uploadRejectIfTooLarge(svc.server.cfg.UploadMaxBytes, *prepared.req.Size, "upload exceeds maxBytes"); uploadErr != nil {
			return nil, uploadErr
		}
	}

	presigner, err := s3PresignClientFromProfile(prepared.secrets)
	if err != nil {
		return nil, newUploadInternalError("failed to prepare presigner", nil)
	}

	input := &s3.PutObjectInput{
		Bucket: &prepared.us.Bucket,
		Key:    &prepared.key,
	}
	if ct := strings.TrimSpace(prepared.req.ContentType); ct != "" {
		input.ContentType = &ct
	}

	resp, err := presigner.PresignPutObject(r.Context(), input, s3.WithPresignExpires(prepared.expires))
	if err != nil {
		return nil, &uploadHTTPError{
			status:  http.StatusBadGateway,
			code:    "upload_failed",
			message: "failed to presign upload",
			details: map[string]any{"error": err.Error()},
		}
	}

	headers := flattenSignedHeaders(resp.SignedHeader)
	if len(headers) == 0 {
		headers = nil
	}

	var expectedSize *int64
	if prepared.req.Size != nil && *prepared.req.Size >= 0 {
		size := *prepared.req.Size
		expectedSize = &size
	}
	if err := svc.server.store.UpsertUploadObject(r.Context(), store.UploadObject{
		UploadID:     prepared.uploadID,
		ProfileID:    prepared.profileID,
		Path:         prepared.relPath,
		Bucket:       prepared.us.Bucket,
		ObjectKey:    prepared.key,
		ExpectedSize: expectedSize,
	}); err != nil {
		return nil, newUploadInternalError("failed to persist upload object", nil)
	}

	return &models.UploadPresignResponse{
		Mode:      "single",
		Bucket:    prepared.us.Bucket,
		Key:       prepared.key,
		Method:    http.MethodPut,
		URL:       resp.URL,
		Headers:   headers,
		ExpiresAt: prepared.expiresAt,
	}, nil
}

func (svc uploadPresignHTTPService) executeMultipart(r *http.Request, prepared uploadPresignPreparedRequest) (*models.UploadPresignResponse, *uploadHTTPError) {
	if prepared.req.Multipart.FileSize == nil || *prepared.req.Multipart.FileSize <= 0 {
		return nil, newUploadBadRequestError("fileSize is required for multipart presign", nil)
	}
	if prepared.req.Multipart.PartSizeBytes <= 0 {
		return nil, newUploadBadRequestError("partSizeBytes is required for multipart presign", nil)
	}

	partSize := prepared.req.Multipart.PartSizeBytes
	if partSize < 5*1024*1024 {
		return nil, newUploadBadRequestError("partSizeBytes must be at least 5MiB", nil)
	}

	fileSize := *prepared.req.Multipart.FileSize
	partCount, err := expectedMultipartPartCount(fileSize, partSize)
	if err != nil {
		return nil, newUploadBadRequestError(err.Error(), nil)
	}
	if partCount <= 1 {
		return nil, newUploadBadRequestError("multipart upload requires at least 2 parts", nil)
	}

	partNumbers := prepared.req.Multipart.PartNumbers
	if len(partNumbers) == 0 {
		partNumbers = make([]int, 0, partCount)
		for i := 1; i <= partCount; i++ {
			partNumbers = append(partNumbers, i)
		}
	}

	seen := make(map[int]struct{}, len(partNumbers))
	for _, num := range partNumbers {
		if num < 1 || num > partCount {
			return nil, newUploadBadRequestError("invalid part number", map[string]any{"partNumber": num})
		}
		if _, exists := seen[num]; exists {
			return nil, newUploadBadRequestError("duplicate part number", map[string]any{"partNumber": num})
		}
		seen[num] = struct{}{}
	}

	meta, found, err := svc.server.store.GetMultipartUpload(r.Context(), prepared.profileID, prepared.uploadID, prepared.relPath)
	if err != nil {
		return nil, newUploadInternalError("failed to load multipart upload", nil)
	}
	if found && (meta.FileSize != fileSize || meta.ChunkSize != partSize) {
		if client, err := s3ClientFromProfile(prepared.secrets); err == nil {
			_ = svc.server.abortMultipartUpload(r.Context(), client, meta)
		}
		_ = svc.server.store.DeleteMultipartUpload(r.Context(), prepared.profileID, prepared.uploadID, prepared.relPath)
		found = false
	}
	if !found {
		client, err := s3ClientFromProfile(prepared.secrets)
		if err != nil {
			return nil, newUploadInternalError("failed to prepare multipart client", nil)
		}
		input := &s3.CreateMultipartUploadInput{Bucket: &prepared.us.Bucket, Key: &prepared.key}
		if ct := strings.TrimSpace(prepared.req.ContentType); ct != "" {
			input.ContentType = &ct
		}
		resp, err := client.CreateMultipartUpload(r.Context(), input)
		s3UploadID, uploadErr := multipartUploadIDFromCreateResponse(resp, err)
		if uploadErr != nil {
			return nil, uploadErr
		}
		now := time.Now().UTC().Format(time.RFC3339Nano)
		meta = store.MultipartUpload{
			UploadID:   prepared.uploadID,
			ProfileID:  prepared.profileID,
			Path:       prepared.relPath,
			Bucket:     prepared.us.Bucket,
			ObjectKey:  prepared.key,
			S3UploadID: s3UploadID,
			ChunkSize:  partSize,
			FileSize:   fileSize,
			CreatedAt:  now,
			UpdatedAt:  now,
		}
		if err := svc.server.store.UpsertMultipartUpload(r.Context(), meta); err != nil {
			return nil, newUploadInternalError("failed to persist multipart upload", nil)
		}
	}

	if err := svc.server.store.UpsertUploadObject(r.Context(), store.UploadObject{
		UploadID:     prepared.uploadID,
		ProfileID:    prepared.profileID,
		Path:         prepared.relPath,
		Bucket:       prepared.us.Bucket,
		ObjectKey:    prepared.key,
		ExpectedSize: &fileSize,
	}); err != nil {
		return nil, newUploadInternalError("failed to persist upload object", nil)
	}

	presigner, err := s3PresignClientFromProfile(prepared.secrets)
	if err != nil {
		return nil, newUploadInternalError("failed to prepare presigner", nil)
	}

	sort.Ints(partNumbers)
	parts := make([]models.UploadPresignPart, 0, len(partNumbers))
	for _, num := range partNumbers {
		partNumber, err := multipartPartNumber(num)
		if err != nil {
			return nil, newUploadBadRequestError("invalid part number", map[string]any{"partNumber": num})
		}
		resp, err := presigner.PresignUploadPart(r.Context(), &s3.UploadPartInput{
			Bucket:     &prepared.us.Bucket,
			Key:        &prepared.key,
			UploadId:   &meta.S3UploadID,
			PartNumber: &partNumber,
		}, s3.WithPresignExpires(prepared.expires))
		if err != nil {
			return nil, &uploadHTTPError{
				status:  http.StatusBadGateway,
				code:    "upload_failed",
				message: "failed to presign multipart upload",
				details: map[string]any{"error": err.Error()},
			}
		}

		headers := flattenSignedHeaders(resp.SignedHeader)
		if len(headers) == 0 {
			headers = nil
		}
		parts = append(parts, models.UploadPresignPart{
			Number:  num,
			Method:  http.MethodPut,
			URL:     resp.URL,
			Headers: headers,
		})
	}

	return &models.UploadPresignResponse{
		Mode:      "multipart",
		Bucket:    prepared.us.Bucket,
		Key:       prepared.key,
		ExpiresAt: prepared.expiresAt,
		Multipart: &models.UploadPresignMultipart{
			UploadID:      meta.S3UploadID,
			PartSizeBytes: partSize,
			PartCount:     partCount,
			Parts:         parts,
		},
	}, nil
}

func (svc uploadPresignHTTPService) executePrepared(r *http.Request, prepared uploadPresignPreparedRequest) (*models.UploadPresignResponse, *uploadHTTPError, error) {
	if prepared.decodeErr != nil {
		return nil, nil, prepared.decodeErr
	}
	if prepared.err != nil {
		return nil, prepared.err, nil
	}
	if prepared.req.Multipart != nil {
		resp, uploadErr := svc.executeMultipart(r, prepared)
		return resp, uploadErr, nil
	}
	resp, uploadErr := svc.executeSinglePart(r, prepared)
	return resp, uploadErr, nil
}

func (svc uploadPresignHTTPService) executePresign(r *http.Request) (*models.UploadPresignResponse, *uploadHTTPError, error) {
	return svc.executePrepared(r, svc.preparePresign(r))
}

func (svc uploadPresignHTTPService) handlePresignUpload(w http.ResponseWriter, r *http.Request) {
	release, ok := svc.server.acquireUploadSlot(w)
	if !ok {
		return
	}
	defer release()

	resp, uploadErr, decodeErr := svc.executePresign(r)
	if uploadErr != nil {
		errResp := buildUploadPresignHTTPErrorResponse(uploadErr.code, uploadErr.message, uploadErr.details)
		writeJSON(w, uploadErr.status, &errResp)
		return
	}
	if decodeErr != nil {
		writeJSONDecodeError(w, decodeErr, 0)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}
