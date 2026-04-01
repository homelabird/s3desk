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

	cleaned := path.Clean(name)
	if cleaned == "." || cleaned == ".." || cleaned == "" {
		return ""
	}
	if strings.HasPrefix(cleaned, "../") {
		return ""
	}
	if strings.ContainsRune(cleaned, 0) {
		return ""
	}
	return cleaned
}

func safeUploadPath(part *multipart.Part) string {
	if part == nil {
		return ""
	}
	return sanitizeUploadPath(part.FileName())
}

func uniqueFilePath(dir, filename string) string {
	dst := filepath.Join(dir, filename)
	if _, err := os.Stat(dst); err != nil {
		return dst
	}
	ext := filepath.Ext(filename)
	base := strings.TrimSuffix(filename, ext)
	for i := 2; i < 10_000; i++ {
		candidate := filepath.Join(dir, fmt.Sprintf("%s-%d%s", base, i, ext))
		if _, err := os.Stat(candidate); err != nil {
			return candidate
		}
	}
	return dst
}

func parseUploadChunkHeaders(headers http.Header, chunkIndexRaw string, enforceMaxParts bool) (uploadChunkHeaderValues, *uploadHTTPError) {
	return parseUploadChunkHeadersWithSizes(headers, chunkIndexRaw, enforceMaxParts, true)
}

func parseUploadChunkHeadersWithoutSizes(headers http.Header, chunkIndexRaw string, enforceMaxParts bool) (uploadChunkHeaderValues, *uploadHTTPError) {
	return parseUploadChunkHeadersWithSizes(headers, chunkIndexRaw, enforceMaxParts, false)
}

func parseUploadChunkHeadersWithSizes(headers http.Header, chunkIndexRaw string, enforceMaxParts, requireSizes bool) (uploadChunkHeaderValues, *uploadHTTPError) {
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
	if !requireSizes {
		return values, nil
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
	if err != nil || fileSize <= 0 {
		return uploadChunkHeaderValues{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "invalid X-Upload-File-Size",
			details: map[string]any{"fileSize": fileSizeRaw},
		}
	}

	values.chunkSize = chunkSize
	values.fileSize = fileSize
	return values, nil
}

func uploadIDFromRequest(r *http.Request) string {
	return chi.URLParam(r, "uploadId")
}
