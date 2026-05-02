package api

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

type objectListHTTPError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type objectListHTTPService struct {
	server *server
}

func (e *objectListHTTPError) Error() string {
	return e.message
}

func newObjectListHTTPService(s *server) objectListHTTPService {
	return objectListHTTPService{server: s}
}

func newObjectListHTTPError(status int, code, message string, details map[string]any) *objectListHTTPError {
	return &objectListHTTPError{status: status, code: code, message: message, details: details}
}

func buildObjectListHTTPErrorResponse(code, message string, details map[string]any) models.ErrorResponse {
	resp := models.ErrorResponse{Error: models.APIError{Code: code, Message: message, Details: details}}
	if norm, ok := normalizedErrorFromCode(code); ok {
		resp.Error.NormalizedError = norm
	}
	return resp
}

func buildObjectListRcloneErrorContext() rcloneAPIErrorContext {
	return rcloneAPIErrorContext{
		MissingMessage: "rclone is required to list objects (install it or set RCLONE_PATH)",
		DefaultStatus:  http.StatusBadRequest,
		DefaultCode:    "s3_error",
		DefaultMessage: "failed to list objects",
	}
}

func (svc objectListHTTPService) prepareListObjects(metric *storageMetric, r *http.Request) (models.ProfileSecrets, string, string, string, string, int, error) {
	delimiter := r.URL.Query().Get("delimiter")
	if delimiter == "" {
		delimiter = "/"
	}
	token := strings.TrimSpace(r.URL.Query().Get("continuationToken"))

	secrets, ok := profileFromContext(r.Context())
	if !ok {
		metric.SetStatus("missing_profile")
		return models.ProfileSecrets{}, "", "", "", "", 0, newObjectListHTTPError(http.StatusBadRequest, "missing_profile", "profile is required", nil)
	}
	metric.SetProvider(string(secrets.Provider))

	bucket := chi.URLParam(r, "bucket")
	if bucket == "" {
		metric.SetStatus("invalid_request")
		return models.ProfileSecrets{}, "", "", "", "", 0, newObjectListHTTPError(http.StatusBadRequest, "invalid_request", "bucket is required", nil)
	}

	maxKeys, _ := parseIntQueryClamped(r, "maxKeys", 500, 1, 1000)

	return secrets, bucket, r.URL.Query().Get("prefix"), delimiter, token, maxKeys, nil
}

func (svc objectListHTTPService) executePrepared(metric *storageMetric, r *http.Request, secrets models.ProfileSecrets, bucket string, prefix string, delimiter string, token string, maxKeys int) (*models.ListObjectsResponse, error, string, rcloneAPIErrorContext, map[string]any, error) {
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	args := []string{"lsjson", "--no-mimetype"}
	if delimiter == "" {
		args = append(args, "-R", "--fast-list")
	}
	args = append(args, rcloneRemoteDir(bucket, prefix, secrets.PreserveLeadingSlash))

	proc, err := svc.server.startRclone(ctx, secrets, args, "list-objects")
	if err != nil {
		metric.SetStatus("remote_error")
		return nil, err, "", buildObjectListRcloneErrorContext(), nil, nil
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

		item := models.ObjectItem{Key: objKey, Size: entry.Size}
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
			return nil, waitErr, proc.stderr.String(), buildObjectListRcloneErrorContext(), nil, nil
		}
		metric.SetStatus("internal_error")
		return nil, nil, "", rcloneAPIErrorContext{}, nil, newObjectListHTTPError(http.StatusBadRequest, "s3_error", "failed to list objects", map[string]any{"error": listErr.Error()})
	}
	if waitErr != nil && !pag.stopped {
		metric.SetStatus("remote_error")
		return nil, waitErr, proc.stderr.String(), buildObjectListRcloneErrorContext(), nil, nil
	}

	resp.IsTruncated = pag.truncated
	if pag.truncated && pag.nextToken != "" {
		resp.NextContinuationToken = &pag.nextToken
	}
	metric.SetStatus("success")
	return &resp, nil, "", rcloneAPIErrorContext{}, nil, nil
}

func (svc objectListHTTPService) executeGet(metric *storageMetric, r *http.Request) (*models.ListObjectsResponse, error, string, rcloneAPIErrorContext, map[string]any, error) {
	secrets, bucket, prefix, delimiter, token, maxKeys, err := svc.prepareListObjects(metric, r)
	if err != nil {
		return nil, nil, "", rcloneAPIErrorContext{}, nil, err
	}
	return svc.executePrepared(metric, r, secrets, bucket, prefix, delimiter, token, maxKeys)
}

func (svc objectListHTTPService) handleListObjects(w http.ResponseWriter, r *http.Request) {
	delimiter := r.URL.Query().Get("delimiter")
	if delimiter == "" {
		delimiter = "/"
	}
	token := strings.TrimSpace(r.URL.Query().Get("continuationToken"))
	metric := svc.server.beginStorageMetric("unknown", listObjectsMetricOperation(delimiter, token))
	defer metric.Observe()

	resp, rcloneErr, stderr, rcloneCtx, rcloneDetails, err := svc.executeGet(metric, r)
	if rcloneErr != nil {
		writeRcloneAPIError(w, rcloneErr, stderr, rcloneCtx, rcloneDetails)
		return
	}
	if err == nil {
		writeJSON(w, http.StatusOK, resp)
		return
	}
	if httpErr, ok := err.(*objectListHTTPError); ok {
		respErr := buildObjectListHTTPErrorResponse(httpErr.code, httpErr.message, httpErr.details)
		writeJSON(w, httpErr.status, respErr)
		return
	}
	respErr := buildObjectListHTTPErrorResponse("internal_error", "failed to list objects", nil)
	writeJSON(w, http.StatusInternalServerError, respErr)
}
