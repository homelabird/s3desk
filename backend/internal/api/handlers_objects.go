package api

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/store"
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

	if strings.TrimSpace(token) != "" {
		token = strings.TrimSpace(token)
	}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	args := []string{"lsjson", "--no-mimetype"}
	if delimiter == "" {
		args = append(args, "-R")
	}
	args = append(args, rcloneRemoteDir(bucket, prefix, secrets.PreserveLeadingSlash))

	proc, err := s.startRclone(ctx, secrets, args, "list-objects")
	if err != nil {
		writeRcloneAPIError(w, err, "", rcloneAPIErrorContext{
			MissingMessage: "rclone is required to list objects (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to list objects",
		}, nil)
		return
	}

	resp := models.ListObjectsResponse{
		Bucket:         bucket,
		Prefix:         prefix,
		Delimiter:      delimiter,
		CommonPrefixes: make([]string, 0, 16),
		Items:          make([]models.ObjectItem, 0, maxKeys),
	}

	commonPrefixSet := make(map[string]struct{}, 64)
	foundToken := token == ""
	var (
		returned  int
		truncated bool
		nextToken string
		stopped   bool
	)

	listErr := decodeRcloneList(proc.stdout, func(entry rcloneListEntry) error {
		key := entry.Path
		if strings.TrimSpace(key) == "" && strings.TrimSpace(entry.Name) != "" {
			key = entry.Name
		}
		if entry.IsDir {
			if delimiter != "/" {
				return nil
			}
			prefixKey := rcloneObjectKey(prefix, key, secrets.PreserveLeadingSlash)
			if !strings.HasSuffix(prefixKey, "/") {
				prefixKey += "/"
			}
			if prefixKey == prefix && prefixKey != "" {
				return nil
			}
			entryToken := rcloneTokenForPrefix(prefixKey)
			if !foundToken {
				if rcloneMatchToken(token, entryToken, prefixKey) {
					foundToken = true
				}
				return nil
			}
			if _, ok := commonPrefixSet[prefixKey]; ok {
				return nil
			}
			commonPrefixSet[prefixKey] = struct{}{}
			resp.CommonPrefixes = append(resp.CommonPrefixes, prefixKey)
			returned++
			if returned >= maxKeys {
				truncated = true
				nextToken = entryToken
				stopped = true
				cancel()
				return errRcloneListStop
			}
			return nil
		}

		objKey := rcloneObjectKey(prefix, key, secrets.PreserveLeadingSlash)
		if objKey == "" {
			return nil
		}
		if delimiter == "/" && entry.Size == 0 && strings.HasSuffix(objKey, "/") {
			if objKey == prefix {
				return nil
			}
			entryToken := rcloneTokenForPrefix(objKey)
			if !foundToken {
				if rcloneMatchToken(token, entryToken, objKey) {
					foundToken = true
				}
				return nil
			}
			if _, ok := commonPrefixSet[objKey]; ok {
				return nil
			}
			commonPrefixSet[objKey] = struct{}{}
			resp.CommonPrefixes = append(resp.CommonPrefixes, objKey)
			returned++
			if returned >= maxKeys {
				truncated = true
				nextToken = entryToken
				stopped = true
				cancel()
				return errRcloneListStop
			}
			return nil
		}

		entryToken := rcloneTokenForObject(objKey)
		if !foundToken {
			if rcloneMatchToken(token, entryToken, objKey) {
				foundToken = true
			}
			return nil
		}

		item := models.ObjectItem{
			Key:  objKey,
			Size: entry.Size,
		}
		if etag := rcloneETagFromHashes(entry.Hashes); etag != "" {
			item.ETag = etag
		}
		if lm := rcloneParseTime(entry.ModTime); lm != "" {
			item.LastModified = lm
		}
		resp.Items = append(resp.Items, item)
		returned++
		if returned >= maxKeys {
			truncated = true
			nextToken = entryToken
			stopped = true
			cancel()
			return errRcloneListStop
		}
		return nil
	})

	waitErr := proc.wait()
	if errors.Is(listErr, errRcloneListStop) {
		listErr = nil
	}
	if listErr != nil {
		writeError(w, http.StatusBadRequest, "s3_error", "failed to list objects", map[string]any{"error": listErr.Error()})
		return
	}
	if waitErr != nil && !stopped {
		writeRcloneAPIError(w, waitErr, proc.stderr.String(), rcloneAPIErrorContext{
			MissingMessage: "rclone is required to list objects (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to list objects",
		}, nil)
		return
	}

	resp.IsTruncated = truncated
	if truncated && nextToken != "" {
		resp.NextContinuationToken = &nextToken
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

	entry, stderr, err := s.rcloneStat(r.Context(), secrets, rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash), true, true, "object-meta")
	if err != nil {
		if rcloneIsNotFound(err, stderr) {
			writeError(w, http.StatusNotFound, "not_found", "object not found", map[string]any{"bucket": bucket, "key": key})
			return
		}
		writeRcloneAPIError(w, err, stderr, rcloneAPIErrorContext{
			MissingMessage: "rclone is required to fetch object metadata (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to get object metadata",
		}, map[string]any{"bucket": bucket, "key": key})
		return
	}

	meta := models.ObjectMeta{
		Key:         key,
		Size:        entry.Size,
		ETag:        rcloneETagFromHashes(entry.Hashes),
		ContentType: entry.MimeType,
		Metadata:    entry.Metadata,
	}
	if entry.IsDir && meta.ContentType == "" {
		meta.ContentType = "application/x-directory"
	}
	if lm := rcloneParseTime(entry.ModTime); lm != "" {
		meta.LastModified = lm
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

	key := rcloneconfig.NormalizePathInput(req.Key, secrets.PreserveLeadingSlash)
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

	_, stderr, err := s.runRcloneCapture(r.Context(), secrets, []string{"mkdir", rcloneRemoteDir(bucket, key, secrets.PreserveLeadingSlash)}, "create-folder")
	if err != nil {
		writeRcloneAPIError(w, err, stderr, rcloneAPIErrorContext{
			MissingMessage: "rclone is required to create folders (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to create folder",
		}, map[string]any{"bucket": bucket, "key": key})
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

	proxyRaw := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("proxy")))
	useProxy := proxyRaw == "1" || proxyRaw == "true" || proxyRaw == "yes"
	if useProxy {
		profileID := strings.TrimSpace(secrets.ID)
		if profileID == "" {
			profileID = strings.TrimSpace(r.Header.Get("X-Profile-Id"))
		}
		if profileID == "" {
			writeError(w, http.StatusBadRequest, "missing_profile", "X-Profile-Id header is required", nil)
			return
		}
		expiresAt := time.Now().UTC().Add(expires)
		url := s.buildDownloadProxyURL(r, downloadProxyToken{
			ProfileID: profileID,
			Bucket:    bucket,
			Key:       key,
			Expires:   expiresAt.Unix(),
		})
		writeJSON(w, http.StatusOK, models.PresignedURLResponse{
			URL:       url,
			ExpiresAt: expiresAt.Format(time.RFC3339Nano),
		})
		return
	}

	expireArg := fmt.Sprintf("%ds", expiresSeconds)
	args := []string{"link", "--expire", expireArg, rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash)}
	out, stderr, err := s.runRcloneCapture(r.Context(), secrets, args, "download-url")
	if err != nil {
		if rcloneIsNotFound(err, stderr) {
			writeError(w, http.StatusNotFound, "not_found", "object not found", map[string]any{"bucket": bucket, "key": key})
			return
		}
		writeRcloneAPIError(w, err, stderr, rcloneAPIErrorContext{
			MissingMessage: "rclone is required to generate download URLs (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "invalid_request",
			DefaultMessage: "failed to generate download url",
		}, map[string]any{"bucket": bucket, "key": key})
		return
	}

	url := ""
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		url = line
		break
	}
	if url == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "failed to generate download url", map[string]any{"error": "empty rclone response"})
		return
	}

	writeJSON(w, http.StatusOK, models.PresignedURLResponse{
		URL:       url,
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

	entry, stderr, err := s.rcloneStat(r.Context(), secrets, rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash), true, false, "download-stat")
	if err != nil {
		if rcloneIsNotFound(err, stderr) {
			writeError(w, http.StatusNotFound, "not_found", "object not found", map[string]any{"bucket": bucket, "key": key})
			return
		}
		writeRcloneAPIError(w, err, stderr, rcloneAPIErrorContext{
			MissingMessage: "rclone is required to download objects (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to download object",
		}, map[string]any{"bucket": bucket, "key": key})
		return
	}

	args := append(s.rcloneDownloadFlags(), "cat", rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash))
	proc, err := s.startRclone(r.Context(), secrets, args, "download-object")
	if err != nil {
		writeRcloneAPIError(w, err, "", rcloneAPIErrorContext{
			MissingMessage: "rclone is required to download objects (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to download object",
		}, map[string]any{"bucket": bucket, "key": key})
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "no-store")
	if entry.Size > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(entry.Size, 10))
	}
	if etag := rcloneETagFromHashes(entry.Hashes); etag != "" {
		w.Header().Set("ETag", etag)
	}
	if lm := rcloneParseTime(entry.ModTime); lm != "" {
		if parsed, err := time.Parse(time.RFC3339Nano, lm); err == nil {
			w.Header().Set("Last-Modified", parsed.UTC().Format(http.TimeFormat))
		}
	}
	if filename := path.Base(key); filename != "" && filename != "." && filename != "/" {
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	}

	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, proc.stdout)
	_ = proc.wait()
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

	keys := make([]string, 0, len(req.Keys))
	for _, k := range req.Keys {
		if k == "" {
			continue
		}
		keys = append(keys, k)
	}
	if len(keys) == 0 {
		writeError(w, http.StatusBadRequest, "invalid_request", "keys must contain at least one non-empty key", nil)
		return
	}

	tmpFile, err := os.CreateTemp("", "rclone-delete-*.txt")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare delete list", map[string]any{"error": err.Error()})
		return
	}
	tmpPath := tmpFile.Name()
	defer func() { _ = os.Remove(tmpPath) }()

	writer := bufio.NewWriter(tmpFile)
	for _, k := range keys {
		if _, err := writer.WriteString(k + "\n"); err != nil {
			_ = tmpFile.Close()
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare delete list", map[string]any{"error": err.Error()})
			return
		}
	}
	if err := writer.Flush(); err != nil {
		_ = tmpFile.Close()
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare delete list", map[string]any{"error": err.Error()})
		return
	}
	if err := tmpFile.Close(); err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare delete list", map[string]any{"error": err.Error()})
		return
	}

	args := []string{"delete", "--files-from-raw", tmpPath, rcloneRemoteBucket(bucket)}
	_, stderr, err := s.runRcloneCapture(r.Context(), secrets, args, "delete-objects")
	if err != nil {
		writeRcloneAPIError(w, err, stderr, rcloneAPIErrorContext{
			MissingMessage: "rclone is required to delete objects (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to delete objects",
		}, map[string]any{"bucket": bucket})
		return
	}

	writeJSON(w, http.StatusOK, models.DeleteObjectsResponse{Deleted: len(keys)})
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
