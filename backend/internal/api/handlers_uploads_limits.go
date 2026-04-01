package api

import (
	"fmt"
	"net/http"
	"strconv"
)

const maxCommitItems = 200

func uploadMaxBytesConfigured(maxBytes int64) bool {
	return maxBytes > 0
}

func uploadMaxBytesResponse(maxBytes int64) *int64 {
	if !uploadMaxBytesConfigured(maxBytes) {
		return nil
	}
	v := maxBytes
	return &v
}

func uploadRemainingBytes(maxBytes, usedBytes int64) (int64, *uploadHTTPError) {
	if !uploadMaxBytesConfigured(maxBytes) {
		return -1, nil
	}
	remaining := maxBytes - usedBytes
	if remaining <= 0 {
		return 0, newUploadTooLargeError("upload exceeds maxBytes", map[string]any{"maxBytes": maxBytes})
	}
	return remaining, nil
}

func uploadRejectIfTooLarge(maxBytes, size int64, message string) *uploadHTTPError {
	if !uploadMaxBytesConfigured(maxBytes) {
		return nil
	}
	if size <= maxBytes {
		return nil
	}
	return newUploadTooLargeError(message, map[string]any{"maxBytes": maxBytes})
}

func uploadRejectIfChunkMismatch(chunkSize, expectedChunkSize int64) *uploadHTTPError {
	if chunkSize == expectedChunkSize {
		return nil
	}
	return newUploadBadRequestError("chunk size mismatch", map[string]any{"chunkSize": chunkSize})
}

func uploadRejectIfChunkLimitExceeded(chunkTotal int) *uploadHTTPError {
	if chunkTotal <= maxMultipartUploadParts {
		return nil
	}
	return newUploadBadRequestError(fmt.Sprintf("multipart upload exceeds %d parts", maxMultipartUploadParts), nil)
}

func uploadParseMultipartPartCount(totalRaw string) (int, *uploadHTTPError) {
	total, err := strconv.Atoi(totalRaw)
	if err != nil || total <= 0 || total > maxMultipartUploadParts {
		return 0, uploadMultipartInvalidChunkCountError(totalRaw)
	}
	return total, nil
}

func uploadWriteError(w http.ResponseWriter, err *uploadHTTPError) {
	writeError(w, err.status, err.code, err.message, err.details)
}
