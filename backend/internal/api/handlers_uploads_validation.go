package api

import (
	"fmt"
	"mime/multipart"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

const (
	uploadModeStaging   = "staging"
	uploadModeDirect    = "direct"
	uploadModePresigned = "presigned"
)

type uploadChunkHeaderValues struct {
	relPath   string
	total     int
	index     int
	chunkSize int64
	fileSize  int64
}

func normalizeUploadMode(raw string) string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	switch raw {
	case uploadModeStaging, uploadModeDirect, uploadModePresigned:
		return raw
	default:
		return ""
	}
}

func flattenSignedHeaders(headers map[string][]string) map[string]string {
	if len(headers) == 0 {
		return nil
	}
	out := make(map[string]string, len(headers))
	for key, values := range headers {
		out[key] = strings.Join(values, ",")
	}
	return out
}

func sanitizeUploadPath(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	name = strings.ReplaceAll(name, "\\", "/")
	name = strings.TrimLeft(name, "/")
	if strings.ContainsRune(name, 0) || containsParentPathSegment(name) {
		return ""
	}

	cleaned := path.Clean(name)
	if cleaned == "." || cleaned == ".." || cleaned == "" {
		return ""
	}
	if strings.HasPrefix(cleaned, "../") {
		return ""
	}
	return cleaned
}

func validateUploadPrefix(prefix string) *uploadHTTPError {
	prefix = strings.ReplaceAll(strings.TrimSpace(prefix), "\\", "/")
	if strings.ContainsRune(prefix, 0) || containsParentPathSegment(prefix) {
		return newUploadBadRequestError("prefix contains invalid path segment", map[string]any{"prefix": prefix})
	}
	return nil
}

func containsParentPathSegment(value string) bool {
	for _, segment := range strings.Split(value, "/") {
		if segment == ".." {
			return true
		}
	}
	return false
}

func safeUploadPath(part *multipart.Part) string {
	if part == nil {
		return ""
	}
	return sanitizeUploadPath(part.FileName())
}

func uniqueFilePath(dir, filename string) (string, error) {
	dst := filepath.Join(dir, filename)
	ext := filepath.Ext(filename)
	base := strings.TrimSuffix(filename, ext)
	for i := 1; i < 10_000; i++ {
		if i > 1 {
			dst = filepath.Join(dir, fmt.Sprintf("%s-%d%s", base, i, ext))
		}
		if _, err := os.Lstat(dst); os.IsNotExist(err) {
			return dst, nil
		} else if err != nil {
			return "", err
		}
	}
	return "", fmt.Errorf("too many files with the same name")
}

func parseUploadChunkHeaders(headers http.Header, chunkIndexRaw string, enforceMaxParts bool) (uploadChunkHeaderValues, *uploadHTTPError) {
	return parseUploadChunkHeadersWithMinimumFileSize(headers, chunkIndexRaw, enforceMaxParts, 1)
}

func parseStagingUploadChunkHeaders(headers http.Header, chunkIndexRaw string, enforceMaxParts bool) (uploadChunkHeaderValues, *uploadHTTPError) {
	return parseUploadChunkHeadersWithMinimumFileSize(headers, chunkIndexRaw, enforceMaxParts, 0)
}

func parseUploadChunkHeadersWithMinimumFileSize(headers http.Header, chunkIndexRaw string, enforceMaxParts bool, minimumFileSize int64) (uploadChunkHeaderValues, *uploadHTTPError) {
	chunkTotalRaw := strings.TrimSpace(headers.Get("X-Upload-Chunk-Total"))
	relPath := sanitizeUploadPath(headers.Get("X-Upload-Relative-Path"))
	if chunkTotalRaw == "" || relPath == "" {
		return uploadChunkHeaderValues{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "chunk uploads require X-Upload-Chunk-Total and X-Upload-Relative-Path",
		}
	}

	chunkIndex, err := strconv.Atoi(chunkIndexRaw)
	if err != nil {
		return uploadChunkHeaderValues{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "invalid X-Upload-Chunk-Index",
			details: map[string]any{"error": err.Error()},
		}
	}

	chunkTotal, err := strconv.Atoi(chunkTotalRaw)
	if err != nil || chunkTotal <= 0 {
		details := map[string]any{"chunkTotal": chunkTotalRaw}
		if err != nil {
			details["error"] = err.Error()
		}
		return uploadChunkHeaderValues{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "invalid X-Upload-Chunk-Total",
			details: details,
		}
	}
	if enforceMaxParts {
		if uploadErr := uploadRejectIfChunkLimitExceeded(chunkTotal); uploadErr != nil {
			return uploadChunkHeaderValues{}, uploadErr
		}
	}
	if chunkIndex < 0 || chunkIndex >= chunkTotal {
		return uploadChunkHeaderValues{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "chunk index out of range",
			details: map[string]any{"index": chunkIndex},
		}
	}

	values := uploadChunkHeaderValues{
		relPath: relPath,
		total:   chunkTotal,
		index:   chunkIndex,
	}
	chunkSizeRaw := strings.TrimSpace(headers.Get("X-Upload-Chunk-Size"))
	chunkSize, err := strconv.ParseInt(chunkSizeRaw, 10, 64)
	if err != nil || chunkSize <= 0 {
		return uploadChunkHeaderValues{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "invalid X-Upload-Chunk-Size",
			details: map[string]any{"chunkSize": chunkSizeRaw},
		}
	}

	fileSizeRaw := strings.TrimSpace(headers.Get("X-Upload-File-Size"))
	fileSize, err := strconv.ParseInt(fileSizeRaw, 10, 64)
	if err != nil || fileSize < minimumFileSize {
		return uploadChunkHeaderValues{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "invalid X-Upload-File-Size",
			details: map[string]any{"fileSize": fileSizeRaw},
		}
	}

	values.chunkSize = chunkSize
	values.fileSize = fileSize
	expectedTotal := 1
	if fileSize > 0 {
		expectedTotal, err = expectedMultipartPartCount(fileSize, chunkSize)
		if err != nil {
			return uploadChunkHeaderValues{}, newUploadBadRequestError(err.Error(), nil)
		}
	}
	if chunkTotal != expectedTotal {
		return uploadChunkHeaderValues{}, newUploadBadRequestError("chunk total mismatch", map[string]any{
			"expectedTotal": expectedTotal,
			"total":         chunkTotal,
		})
	}
	return values, nil
}

func uploadIDFromRequest(r *http.Request) string {
	return chi.URLParam(r, "uploadId")
}
