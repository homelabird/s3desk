package api

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/store"
)

func (s *server) handleListObjects(w http.ResponseWriter, r *http.Request) {
	metric := s.beginStorageMetric("unknown", "list_objects")
	defer metric.Observe()

	secrets, ok := profileFromContext(r.Context())
	if !ok {
		metric.SetStatus("missing_profile")
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}
	metric.SetProvider(string(secrets.Provider))

	bucket := chi.URLParam(r, "bucket")
	if bucket == "" {
		metric.SetStatus("invalid_request")
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return
	}

	prefix := r.URL.Query().Get("prefix")
	delimiter := r.URL.Query().Get("delimiter")
	if delimiter == "" {
		delimiter = "/"
	}

	maxKeys, _ := parseIntQueryClamped(r, "maxKeys", 500, 1, 1000)

	token := r.URL.Query().Get("continuationToken")

	if strings.TrimSpace(token) != "" {
		token = strings.TrimSpace(token)
	}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	args := []string{"lsjson", "--no-mimetype"}
	if delimiter == "" {
		args = append(args, "-R", "--fast-list")
	}
	args = append(args, rcloneRemoteDir(bucket, prefix, secrets.PreserveLeadingSlash))

	proc, err := s.startRclone(ctx, secrets, args, "list-objects")
	if err != nil {
		metric.SetStatus("remote_error")
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

	pag := listPaginator{
		token:           token,
		maxKeys:         maxKeys,
		foundToken:      token == "",
		commonPrefixSet: make(map[string]struct{}, 64),
		cancel:          cancel,
	}

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
			return pag.addPrefix(rcloneTokenForPrefix(prefixKey), prefixKey, &resp)
		}

		objKey := rcloneObjectKey(prefix, key, secrets.PreserveLeadingSlash)
		if objKey == "" {
			return nil
		}
		if isOCIFolderMarkerObject(secrets.Provider, objKey) {
			parentPrefix := ociFolderMarkerParentPrefix(objKey)
			if delimiter == "/" && parentPrefix != "" && parentPrefix != prefix {
				return pag.addPrefix(rcloneTokenForPrefix(parentPrefix), parentPrefix, &resp)
			}
			return nil
		}
		if delimiter == "/" && entry.Size == 0 && strings.HasSuffix(objKey, "/") {
			if objKey == prefix {
				return nil
			}
			return pag.addPrefix(rcloneTokenForPrefix(objKey), objKey, &resp)
		}

		entryToken := rcloneTokenForObject(objKey)
		if !pag.advanceToken(entryToken, objKey) {
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
		return pag.incrementAndCheck(entryToken)
	})

	waitErr := proc.wait()
	if errors.Is(listErr, errRcloneListStop) {
		listErr = nil
	}
	if listErr != nil {
		if waitErr != nil && !pag.stopped {
			metric.SetStatus("remote_error")
			writeRcloneAPIError(w, waitErr, proc.stderr.String(), rcloneAPIErrorContext{
				MissingMessage: "rclone is required to list objects (install it or set RCLONE_PATH)",
				DefaultStatus:  http.StatusBadRequest,
				DefaultCode:    "s3_error",
				DefaultMessage: "failed to list objects",
			}, nil)
			return
		}
		metric.SetStatus("internal_error")
		writeError(w, http.StatusBadRequest, "s3_error", "failed to list objects", map[string]any{"error": listErr.Error()})
		return
	}
	if waitErr != nil && !pag.stopped {
		metric.SetStatus("remote_error")
		writeRcloneAPIError(w, waitErr, proc.stderr.String(), rcloneAPIErrorContext{
			MissingMessage: "rclone is required to list objects (install it or set RCLONE_PATH)",
			DefaultStatus:  http.StatusBadRequest,
			DefaultCode:    "s3_error",
			DefaultMessage: "failed to list objects",
		}, nil)
		return
	}

	resp.IsTruncated = pag.truncated
	if pag.truncated && pag.nextToken != "" {
		resp.NextContinuationToken = &pag.nextToken
	}
	metric.SetStatus("success")
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

	limit, _ := parseIntQueryClamped(r, "limit", 50, 1, 200)

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

	minSizePtr, err := parseSizeQueryParam(r, "minSize")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "minSize is invalid", map[string]any{"minSize": r.URL.Query().Get("minSize")})
		return
	}
	maxSizePtr, err := parseSizeQueryParam(r, "maxSize")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "maxSize is invalid", map[string]any{"maxSize": r.URL.Query().Get("maxSize")})
		return
	}
	if minSizePtr != nil && maxSizePtr != nil && *minSizePtr > *maxSizePtr {
		minSizePtr, maxSizePtr = maxSizePtr, minSizePtr
	}

	modifiedAfter, err := parseTimeQueryParam(r, "modifiedAfter")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "modifiedAfter is invalid", map[string]any{"modifiedAfter": r.URL.Query().Get("modifiedAfter")})
		return
	}
	modifiedBefore, err := parseTimeQueryParam(r, "modifiedBefore")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "modifiedBefore is invalid", map[string]any{"modifiedBefore": r.URL.Query().Get("modifiedBefore")})
		return
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

	sampleLimit, _ := parseIntQueryClamped(r, "sampleLimit", 10, 0, 100)

	resp, err := s.store.SummarizeObjectIndex(r.Context(), profileID, store.SummarizeObjectIndexInput{
		Bucket:      bucket,
		Prefix:      prefix,
		SampleLimit: sampleLimit,
	})
	if err != nil {
		if errors.Is(err, store.ErrObjectIndexNotFound) {
			writeJSON(w, http.StatusOK, models.ObjectIndexSummaryResponse{
				Bucket:      bucket,
				Prefix:      strings.TrimPrefix(prefix, "/"),
				ObjectCount: 0,
				TotalBytes:  0,
				SampleKeys:  []string{},
			})
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to summarize object index", map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleGetObjectMeta(w http.ResponseWriter, r *http.Request) {
	metric := s.beginStorageMetric("unknown", "get_object_meta")
	defer metric.Observe()

	secrets, ok := profileFromContext(r.Context())
	if !ok {
		metric.SetStatus("missing_profile")
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}
	metric.SetProvider(string(secrets.Provider))

	bucket := chi.URLParam(r, "bucket")
	key := r.URL.Query().Get("key")
	if bucket == "" || key == "" {
		metric.SetStatus("invalid_request")
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket and key are required", nil)
		return
	}

	entry, stderr, err := s.rcloneStat(r.Context(), secrets, rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash), true, true, "object-meta")
	if err != nil {
		if rcloneIsNotFound(err, stderr) {
			metric.SetStatus("not_found")
			writeError(w, http.StatusNotFound, "not_found", "object not found", map[string]any{"bucket": bucket, "key": key})
			return
		}
		metric.SetStatus("remote_error")
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
	metric.SetStatus("success")
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

	if rcloneconfig.IsS3LikeProvider(secrets.Provider) {
		client, err := s3ClientFromProfile(secrets)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare S3 client", nil)
			return
		}
		_, err = client.PutObject(r.Context(), &s3.PutObjectInput{
			Bucket: &bucket,
			Key:    &key,
			Body:   bytes.NewReader(nil),
		})
		if err != nil {
			writeError(w, http.StatusBadRequest, "s3_error", "failed to create folder", map[string]any{
				"bucket": bucket,
				"key":    key,
				"error":  err.Error(),
			})
			return
		}
	} else if secrets.Provider == models.ProfileProviderOciObjectStorage {
		markerKey := ociFolderMarkerObjectKey(key)
		stderr, err := s.runRcloneStdin(
			r.Context(),
			secrets,
			[]string{"rcat", rcloneRemoteObject(bucket, markerKey, secrets.PreserveLeadingSlash)},
			"create-folder",
			bytes.NewReader(nil),
		)
		if err != nil {
			writeRcloneAPIError(w, err, stderr, rcloneAPIErrorContext{
				MissingMessage: "rclone is required to create folders (install it or set RCLONE_PATH)",
				DefaultStatus:  http.StatusBadRequest,
				DefaultCode:    "s3_error",
				DefaultMessage: "failed to create folder",
			}, map[string]any{"bucket": bucket, "key": key, "markerKey": markerKey})
			return
		}
	} else if usesVisibleFolderMarker(secrets.Provider) {
		stderr, err := s.runRcloneStdin(
			r.Context(),
			secrets,
			[]string{"rcat", rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash)},
			"create-folder",
			bytes.NewReader(nil),
		)
		if err != nil {
			writeRcloneAPIError(w, err, stderr, rcloneAPIErrorContext{
				MissingMessage: "rclone is required to create folders (install it or set RCLONE_PATH)",
				DefaultStatus:  http.StatusBadRequest,
				DefaultCode:    "s3_error",
				DefaultMessage: "failed to create folder",
			}, map[string]any{"bucket": bucket, "key": key})
			return
		}
	} else {
		_, stderr, err := s.runRcloneCapture(
			r.Context(),
			secrets,
			[]string{"mkdir", rcloneRemoteDir(bucket, key, secrets.PreserveLeadingSlash)},
			"create-folder",
		)
		if err != nil {
			writeRcloneAPIError(w, err, stderr, rcloneAPIErrorContext{
				MissingMessage: "rclone is required to create folders (install it or set RCLONE_PATH)",
				DefaultStatus:  http.StatusBadRequest,
				DefaultCode:    "s3_error",
				DefaultMessage: "failed to create folder",
			}, map[string]any{"bucket": bucket, "key": key})
			return
		}
	}

	writeJSON(w, http.StatusCreated, models.CreateFolderResponse{Key: key})
}

func (s *server) handleGetObjectDownloadURL(w http.ResponseWriter, r *http.Request) {
	metric := s.beginStorageMetric("unknown", "get_download_url")
	defer metric.Observe()

	secrets, ok := profileFromContext(r.Context())
	if !ok {
		metric.SetStatus("missing_profile")
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}
	metric.SetProvider(string(secrets.Provider))

	bucket := chi.URLParam(r, "bucket")
	key := r.URL.Query().Get("key")
	if bucket == "" || key == "" {
		metric.SetStatus("invalid_request")
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket and key are required", nil)
		return
	}

	expiresSeconds, _ := parseIntQueryClamped(r, "expiresSeconds", 900, 60, 3600)
	expires := time.Duration(expiresSeconds) * time.Second

	proxyRaw := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("proxy")))
	useProxy := proxyRaw == "1" || proxyRaw == "true" || proxyRaw == "yes"
	sizeRaw := strings.TrimSpace(r.URL.Query().Get("size"))
	sizeHint, contentType, lastModified, err := parseDownloadProxyMetadataHints(sizeRaw, r.URL.Query().Get("contentType"), r.URL.Query().Get("lastModified"))
	if err != nil {
		metric.SetStatus("invalid_request")
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), map[string]any{"size": sizeRaw})
		return
	}
	if useProxy {
		profileID := strings.TrimSpace(secrets.ID)
		if profileID == "" {
			profileID = strings.TrimSpace(r.Header.Get("X-Profile-Id"))
		}
		if profileID == "" {
			metric.SetStatus("missing_profile")
			writeError(w, http.StatusBadRequest, "missing_profile", "X-Profile-Id header is required", nil)
			return
		}
		expiresAt := time.Now().UTC().Add(expires)
		url := s.buildDownloadProxyURL(r, downloadProxyToken{
			ProfileID:    profileID,
			Bucket:       bucket,
			Key:          key,
			Expires:      expiresAt.Unix(),
			Size:         sizeHint,
			ContentType:  contentType,
			LastModified: lastModified,
		})
		writeJSON(w, http.StatusOK, models.PresignedURLResponse{
			URL:       url,
			ExpiresAt: expiresAt.Format(time.RFC3339Nano),
		})
		metric.SetStatus("proxy_only")
		return
	}

	expireArg := fmt.Sprintf("%ds", expiresSeconds)
	args := []string{"link", "--expire", expireArg, rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash)}
	out, stderr, err := s.runRcloneCapture(r.Context(), secrets, args, "download-url")
	if err != nil {
		if rcloneIsNotFound(err, stderr) {
			metric.SetStatus("not_found")
			writeError(w, http.StatusNotFound, "not_found", "object not found", map[string]any{"bucket": bucket, "key": key})
			return
		}
		metric.SetStatus("remote_error")
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
		metric.SetStatus("internal_error")
		writeError(w, http.StatusBadRequest, "invalid_request", "failed to generate download url", map[string]any{"error": "empty rclone response"})
		return
	}

	metric.SetStatus("success")
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

	s.streamRcloneDownload(w, proc, entry, key, rcloneAPIErrorContext{
		MissingMessage: "rclone is required to download objects (install it or set RCLONE_PATH)",
		DefaultStatus:  http.StatusBadRequest,
		DefaultCode:    "s3_error",
		DefaultMessage: "failed to download object",
	}, map[string]any{"bucket": bucket, "key": key})
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

	tmpPath, err := writeLinesToTempFile("rclone-delete-*.txt", keys)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare delete list", map[string]any{"error": err.Error()})
		return
	}
	defer func() { _ = os.Remove(tmpPath) }()

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

	if rcloneconfig.IsS3LikeProvider(secrets.Provider) {
		client, err := s3ClientFromProfile(secrets)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to prepare S3 client", nil)
			return
		}
		for _, key := range keys {
			if !strings.HasSuffix(key, "/") {
				continue
			}
			if _, err := client.DeleteObject(r.Context(), &s3.DeleteObjectInput{
				Bucket: &bucket,
				Key:    &key,
			}); err != nil {
				writeError(w, http.StatusBadRequest, "s3_error", "failed to delete object", map[string]any{
					"bucket": bucket,
					"key":    key,
					"error":  err.Error(),
				})
				return
			}
		}
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

// parseIntQueryClamped reads an integer query parameter, falling back to
// defaultVal when missing or unparseable, and clamps the result to [min, max].
func parseIntQueryClamped(r *http.Request, name string, defaultVal, min, max int) (int, error) {
	v := defaultVal
	if raw := r.URL.Query().Get(name); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			return defaultVal, err
		}
		v = parsed
	}
	if v < min {
		v = min
	}
	if v > max {
		v = max
	}
	return v, nil
}

// parseSizeQueryParam reads an optional non-negative int64 query parameter.
func parseSizeQueryParam(r *http.Request, name string) (*int64, error) {
	raw := strings.TrimSpace(r.URL.Query().Get(name))
	if raw == "" {
		return nil, nil
	}
	val, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || val < 0 {
		return nil, errors.New(name + " is invalid")
	}
	return &val, nil
}

// parseTimeQueryParam reads an optional time query parameter and returns it as
// an RFC3339Nano string, or "" if absent.
func parseTimeQueryParam(r *http.Request, name string) (string, error) {
	raw := strings.TrimSpace(r.URL.Query().Get(name))
	if raw == "" {
		return "", nil
	}
	tm, err := parseSearchTimeParam(raw)
	if err != nil {
		return "", err
	}
	return tm.UTC().Format(time.RFC3339Nano), nil
}

// writeLinesToTempFile creates a temporary file with each string written on a
// separate line.  The caller is responsible for removing the file.
func writeLinesToTempFile(pattern string, lines []string) (string, error) {
	f, err := os.CreateTemp("", pattern)
	if err != nil {
		return "", err
	}
	tmpPath := f.Name()

	w := bufio.NewWriter(f)
	for _, line := range lines {
		if _, err := w.WriteString(line + "\n"); err != nil {
			_ = f.Close()
			_ = os.Remove(tmpPath)
			return "", err
		}
	}
	if err := w.Flush(); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return "", err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return "", err
	}
	return tmpPath, nil
}
