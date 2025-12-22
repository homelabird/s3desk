package api

import (
	"bytes"
	"errors"
	"io"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
	smithyhttp "github.com/aws/smithy-go/transport/http"
	"github.com/go-chi/chi/v5"

	"object-storage/internal/models"
	"object-storage/internal/s3client"
	"object-storage/internal/store"
)

func (s *server) handleListObjects(w http.ResponseWriter, r *http.Request) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}

	bucket := chi.URLParam(r, "bucket")
	if bucket == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return
	}

	prefix := r.URL.Query().Get("prefix")
	delimiter := r.URL.Query().Get("delimiter")
	if delimiter == "" {
		delimiter = "/"
	}

	maxKeys := 500
	if raw := r.URL.Query().Get("maxKeys"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			maxKeys = parsed
		}
	}
	if maxKeys < 1 {
		maxKeys = 1
	}
	if maxKeys > 1000 {
		maxKeys = 1000
	}

	token := r.URL.Query().Get("continuationToken")

	client, err := s3client.New(r.Context(), secrets)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_profile", "failed to configure s3 client", map[string]any{"error": err.Error()})
		return
	}

	in := &s3.ListObjectsV2Input{
		Bucket:  aws.String(bucket),
		Prefix:  aws.String(prefix),
		MaxKeys: aws.Int32(int32(maxKeys)),
	}
	if delimiter != "" {
		in.Delimiter = aws.String(delimiter)
	}
	if token != "" {
		in.ContinuationToken = aws.String(token)
	}

	out, err := client.ListObjectsV2(r.Context(), in)
	if err != nil {
		writeError(w, http.StatusBadRequest, "s3_error", "failed to list objects", map[string]any{"error": err.Error()})
		return
	}

	resp := models.ListObjectsResponse{
		Bucket:         bucket,
		Prefix:         prefix,
		Delimiter:      delimiter,
		CommonPrefixes: make([]string, 0, len(out.CommonPrefixes)),
		Items:          make([]models.ObjectItem, 0, len(out.Contents)),
		IsTruncated:    aws.ToBool(out.IsTruncated),
	}
	commonPrefixSet := make(map[string]struct{}, len(out.CommonPrefixes))
	for _, cp := range out.CommonPrefixes {
		if cp.Prefix == nil {
			continue
		}
		p := *cp.Prefix
		if p == "" {
			continue
		}
		if _, ok := commonPrefixSet[p]; ok {
			continue
		}
		commonPrefixSet[p] = struct{}{}
		resp.CommonPrefixes = append(resp.CommonPrefixes, p)
	}
	for _, obj := range out.Contents {
		key := aws.ToString(obj.Key)
		size := aws.ToInt64(obj.Size)

		// Treat "folder marker" objects (zero-byte keys ending with "/") as prefixes.
		// This prevents duplicate rows in the UI and makes empty folders visible.
		if delimiter == "/" && size == 0 && strings.HasSuffix(key, "/") {
			if key == prefix {
				continue
			}
			if _, ok := commonPrefixSet[key]; !ok {
				commonPrefixSet[key] = struct{}{}
				resp.CommonPrefixes = append(resp.CommonPrefixes, key)
			}
			continue
		}

		item := models.ObjectItem{
			Key:  key,
			Size: size,
		}
		if obj.ETag != nil {
			item.ETag = *obj.ETag
		}
		if obj.LastModified != nil {
			item.LastModified = obj.LastModified.UTC().Format(time.RFC3339Nano)
		}
		if obj.StorageClass != "" {
			item.StorageClass = string(obj.StorageClass)
		}
		resp.Items = append(resp.Items, item)
	}
	if out.NextContinuationToken != nil {
		resp.NextContinuationToken = out.NextContinuationToken
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleSearchObjects(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "missing_profile", "X-Profile-Id header is required", nil)
		return
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return
	}

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		q = strings.TrimSpace(r.URL.Query().Get("query"))
	}
	if q == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "q is required", nil)
		return
	}

	prefix := strings.TrimSpace(r.URL.Query().Get("prefix"))

	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			limit = parsed
		}
	}
	if limit < 1 {
		limit = 1
	}
	if limit > 200 {
		limit = 200
	}

	var cursor *string
	if raw := strings.TrimSpace(r.URL.Query().Get("cursor")); raw != "" {
		cursor = &raw
	}

	ext := strings.TrimSpace(r.URL.Query().Get("ext"))
	if ext == "" {
		ext = strings.TrimSpace(r.URL.Query().Get("extension"))
	}
	ext = strings.TrimPrefix(ext, ".")
	if strings.ContainsAny(ext, "/\\") {
		writeError(w, http.StatusBadRequest, "invalid_request", "ext is invalid", map[string]any{"ext": ext})
		return
	}

	var minSizePtr *int64
	if raw := strings.TrimSpace(r.URL.Query().Get("minSize")); raw != "" {
		val, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || val < 0 {
			writeError(w, http.StatusBadRequest, "invalid_request", "minSize is invalid", map[string]any{"minSize": raw})
			return
		}
		minSizePtr = &val
	}
	var maxSizePtr *int64
	if raw := strings.TrimSpace(r.URL.Query().Get("maxSize")); raw != "" {
		val, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || val < 0 {
			writeError(w, http.StatusBadRequest, "invalid_request", "maxSize is invalid", map[string]any{"maxSize": raw})
			return
		}
		maxSizePtr = &val
	}
	if minSizePtr != nil && maxSizePtr != nil && *minSizePtr > *maxSizePtr {
		minSizePtr, maxSizePtr = maxSizePtr, minSizePtr
	}

	var modifiedAfter string
	var modifiedBefore string
	if raw := strings.TrimSpace(r.URL.Query().Get("modifiedAfter")); raw != "" {
		tm, err := parseSearchTimeParam(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", "modifiedAfter is invalid", map[string]any{"modifiedAfter": raw})
			return
		}
		modifiedAfter = tm.UTC().Format(time.RFC3339Nano)
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("modifiedBefore")); raw != "" {
		tm, err := parseSearchTimeParam(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", "modifiedBefore is invalid", map[string]any{"modifiedBefore": raw})
			return
		}
		modifiedBefore = tm.UTC().Format(time.RFC3339Nano)
	}
	if modifiedAfter != "" && modifiedBefore != "" && modifiedAfter > modifiedBefore {
		modifiedAfter, modifiedBefore = modifiedBefore, modifiedAfter
	}

	resp, err := s.store.SearchObjectIndex(r.Context(), profileID, store.SearchObjectIndexInput{
		Bucket:         bucket,
		Query:          q,
		Prefix:         prefix,
		Limit:          limit,
		Cursor:         cursor,
		Extension:      ext,
		MinSize:        minSizePtr,
		MaxSize:        maxSizePtr,
		ModifiedAfter:  modifiedAfter,
		ModifiedBefore: modifiedBefore,
	})
	if err != nil {
		if errors.Is(err, store.ErrObjectIndexNotFound) {
			writeError(
				w,
				http.StatusConflict,
				"not_indexed",
				"object index is not available; create an s3_index_objects job first",
				map[string]any{"bucket": bucket},
			)
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to search object index", map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleGetObjectIndexSummary(w http.ResponseWriter, r *http.Request) {
	profileID := r.Header.Get("X-Profile-Id")
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "missing_profile", "X-Profile-Id header is required", nil)
		return
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return
	}

	prefix := strings.TrimSpace(r.URL.Query().Get("prefix"))

	sampleLimit := 10
	if raw := r.URL.Query().Get("sampleLimit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			sampleLimit = parsed
		}
	}
	if sampleLimit < 0 {
		sampleLimit = 0
	}
	if sampleLimit > 100 {
		sampleLimit = 100
	}

	resp, err := s.store.SummarizeObjectIndex(r.Context(), profileID, store.SummarizeObjectIndexInput{
		Bucket:      bucket,
		Prefix:      prefix,
		SampleLimit: sampleLimit,
	})
	if err != nil {
		if errors.Is(err, store.ErrObjectIndexNotFound) {
			writeError(
				w,
				http.StatusConflict,
				"not_indexed",
				"object index is not available; create an s3_index_objects job first",
				map[string]any{"bucket": bucket},
			)
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to summarize object index", map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleGetObjectMeta(w http.ResponseWriter, r *http.Request) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}

	bucket := chi.URLParam(r, "bucket")
	key := r.URL.Query().Get("key")
	if bucket == "" || key == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket and key are required", nil)
		return
	}

	client, err := s3client.New(r.Context(), secrets)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_profile", "failed to configure s3 client", map[string]any{"error": err.Error()})
		return
	}

	out, err := client.HeadObject(r.Context(), &s3.HeadObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "not_found", "object not found", map[string]any{"bucket": bucket, "key": key})
			return
		}
		writeError(w, http.StatusBadRequest, "s3_error", "failed to get object metadata", map[string]any{"error": err.Error()})
		return
	}

	meta := models.ObjectMeta{
		Key:         key,
		Size:        aws.ToInt64(out.ContentLength),
		ETag:        aws.ToString(out.ETag),
		ContentType: aws.ToString(out.ContentType),
		Metadata:    out.Metadata,
	}
	if out.LastModified != nil {
		meta.LastModified = out.LastModified.UTC().Format(time.RFC3339Nano)
	}
	writeJSON(w, http.StatusOK, meta)
}

func (s *server) handleCreateFolder(w http.ResponseWriter, r *http.Request) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return
	}

	var req models.CreateFolderRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}

	key := strings.TrimPrefix(strings.TrimSpace(req.Key), "/")
	if key == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "key is required", nil)
		return
	}
	if strings.ContainsRune(key, 0) {
		writeError(w, http.StatusBadRequest, "invalid_request", "key contains invalid characters", nil)
		return
	}
	if strings.Contains(key, "*") {
		writeError(w, http.StatusBadRequest, "invalid_request", "wildcards are not allowed in key", nil)
		return
	}
	if !strings.HasSuffix(key, "/") {
		writeError(w, http.StatusBadRequest, "invalid_request", "key must end with '/'", map[string]any{"key": key})
		return
	}

	// Reject path-like traversal segments for sanity; S3 does not interpret them,
	// but the UI treats keys as hierarchical paths.
	trimmed := strings.TrimSuffix(key, "/")
	if trimmed == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "key is invalid", map[string]any{"key": key})
		return
	}
	for _, part := range strings.Split(trimmed, "/") {
		if part == "" {
			continue
		}
		if part == "." || part == ".." {
			writeError(w, http.StatusBadRequest, "invalid_request", "key contains invalid path segment", map[string]any{"key": key})
			return
		}
	}

	client, err := s3client.New(r.Context(), secrets)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_profile", "failed to configure s3 client", map[string]any{"error": err.Error()})
		return
	}

	if _, err := client.HeadObject(r.Context(), &s3.HeadObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)}); err == nil {
		writeError(w, http.StatusConflict, "already_exists", "folder already exists", map[string]any{"bucket": bucket, "key": key})
		return
	} else if !isNotFound(err) {
		writeError(w, http.StatusBadRequest, "s3_error", "failed to check folder existence", map[string]any{"error": err.Error()})
		return
	}

	if _, err := client.PutObject(r.Context(), &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(nil),
		ContentType: aws.String("application/x-directory"),
	}); err != nil {
		writeError(w, http.StatusBadRequest, "s3_error", "failed to create folder", map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, models.CreateFolderResponse{Key: key})
}

func (s *server) handleGetObjectDownloadURL(w http.ResponseWriter, r *http.Request) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}

	bucket := chi.URLParam(r, "bucket")
	key := r.URL.Query().Get("key")
	if bucket == "" || key == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket and key are required", nil)
		return
	}

	expiresSeconds := 900
	if raw := r.URL.Query().Get("expiresSeconds"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			expiresSeconds = parsed
		}
	}
	if expiresSeconds < 60 {
		expiresSeconds = 60
	}
	if expiresSeconds > 3600 {
		expiresSeconds = 3600
	}
	expires := time.Duration(expiresSeconds) * time.Second

	client, err := s3client.New(r.Context(), secrets)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_profile", "failed to configure s3 client", map[string]any{"error": err.Error()})
		return
	}

	in := &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}
	if filename := path.Base(key); filename != "" && filename != "." && filename != "/" {
		in.ResponseContentDisposition = aws.String(mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	}

	presigner := s3.NewPresignClient(client)
	out, err := presigner.PresignGetObject(r.Context(), in, func(opts *s3.PresignOptions) {
		opts.Expires = expires
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "failed to presign url", map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, models.PresignedURLResponse{
		URL:       out.URL,
		ExpiresAt: time.Now().UTC().Add(expires).Format(time.RFC3339Nano),
	})
}

func (s *server) handleDownloadObject(w http.ResponseWriter, r *http.Request) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}

	bucket := chi.URLParam(r, "bucket")
	key := r.URL.Query().Get("key")
	if bucket == "" || key == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket and key are required", nil)
		return
	}

	client, err := s3client.New(r.Context(), secrets)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_profile", "failed to configure s3 client", map[string]any{"error": err.Error()})
		return
	}

	out, err := client.GetObject(r.Context(), &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "not_found", "object not found", map[string]any{"bucket": bucket, "key": key})
			return
		}
		writeError(w, http.StatusBadRequest, "s3_error", "failed to download object", map[string]any{"error": err.Error()})
		return
	}
	defer out.Body.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "no-store")
	if out.ContentLength != nil {
		w.Header().Set("Content-Length", strconv.FormatInt(aws.ToInt64(out.ContentLength), 10))
	}
	if out.ETag != nil {
		w.Header().Set("ETag", aws.ToString(out.ETag))
	}
	if out.LastModified != nil {
		w.Header().Set("Last-Modified", out.LastModified.UTC().Format(http.TimeFormat))
	}
	if filename := path.Base(key); filename != "" && filename != "." && filename != "/" {
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	}

	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, out.Body)
}

func (s *server) handleDeleteObjects(w http.ResponseWriter, r *http.Request) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}

	bucket := chi.URLParam(r, "bucket")
	if bucket == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return
	}

	var req models.DeleteObjectsRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}
	if len(req.Keys) < 1 {
		writeError(w, http.StatusBadRequest, "invalid_request", "keys must not be empty", nil)
		return
	}
	if len(req.Keys) > 1000 {
		writeError(w, http.StatusBadRequest, "invalid_request", "too many keys (max 1000)", map[string]any{"count": len(req.Keys)})
		return
	}

	client, err := s3client.New(r.Context(), secrets)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_profile", "failed to configure s3 client", map[string]any{"error": err.Error()})
		return
	}

	objs := make([]types.ObjectIdentifier, 0, len(req.Keys))
	for _, k := range req.Keys {
		if k == "" {
			continue
		}
		objs = append(objs, types.ObjectIdentifier{Key: aws.String(k)})
	}
	if len(objs) == 0 {
		writeError(w, http.StatusBadRequest, "invalid_request", "keys must contain at least one non-empty key", nil)
		return
	}

	out, err := client.DeleteObjects(r.Context(), &s3.DeleteObjectsInput{
		Bucket: aws.String(bucket),
		Delete: &types.Delete{Objects: objs, Quiet: aws.Bool(true)},
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "s3_error", "failed to delete objects", map[string]any{"error": err.Error()})
		return
	}
	if len(out.Errors) > 0 {
		details := make([]map[string]any, 0, len(out.Errors))
		for _, e := range out.Errors {
			details = append(details, map[string]any{
				"key":     aws.ToString(e.Key),
				"code":    aws.ToString(e.Code),
				"message": aws.ToString(e.Message),
			})
			if len(details) >= 20 {
				break
			}
		}
		writeError(w, http.StatusBadRequest, "partial_failure", "some objects failed to delete", map[string]any{"errors": details})
		return
	}

	writeJSON(w, http.StatusOK, models.DeleteObjectsResponse{Deleted: len(objs)})
}

func isNotFound(err error) bool {
	var re *smithyhttp.ResponseError
	if errors.As(err, &re) {
		if re.HTTPStatusCode() == http.StatusNotFound {
			return true
		}
	}

	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		code := apiErr.ErrorCode()
		if code == "NotFound" || code == "NoSuchKey" {
			return true
		}
	}

	return false
}

func parseSearchTimeParam(raw string) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}, errors.New("empty time")
	}
	if t, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return t, nil
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t, nil
	}
	if ms, err := strconv.ParseInt(raw, 10, 64); err == nil {
		if ms < 0 {
			return time.Time{}, errors.New("invalid time")
		}
		return time.Unix(0, ms*int64(time.Millisecond)).UTC(), nil
	}
	return time.Time{}, errors.New("invalid time")
}
