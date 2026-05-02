package api

import (
	"errors"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
)

func (s *server) handleStagingChunkUpload(
	w http.ResponseWriter,
	r *http.Request,
	profileID, uploadID, stagingDir string,
	bytesTracked int64,
	chunkIndexRaw string,
) {
	newUploadStagingHTTPService(s).handleStagingChunkUpload(w, r, profileID, uploadID, stagingDir, bytesTracked, chunkIndexRaw)
}

func (s *server) stagingChunkWrite(
	r *http.Request,
	profileID, uploadID, stagingDir, relOS string,
	chunkValues uploadChunkHeaderValues,
	chunkPath string,
	prevSize int64,
	remainingBytes *int64,
	maxBytes int64,
	bytesTracked int64,
) *uploadHTTPError {
	defer func() { _ = r.Body.Close() }()
	limitBytes := *remainingBytes
	if uploadMaxBytesConfigured(maxBytes) {
		limitBytes = *remainingBytes + prevSize
	}
	n, err := writeReaderToFile(r.Body, chunkPath, limitBytes)
	if err != nil {
		if errors.Is(err, errUploadTooLarge) {
			return newUploadTooLargeError("upload exceeds maxBytes", map[string]any{"maxBytes": maxBytes})
		}
		return newUploadInternalError("failed to store chunk", map[string]any{"error": err.Error()})
	}

	delta := n - prevSize
	if delta != 0 {
		if err := s.store.AddUploadSessionBytes(r.Context(), profileID, uploadID, delta); err != nil {
			return newUploadInternalError("failed to update upload bytes", map[string]any{"error": err.Error()})
		}
		bytesTracked += delta
	}
	if err := tryAssembleChunkFile(stagingDir, relOS, filepath.Dir(chunkPath), chunkValues.total, func(delta int64) error {
		if delta == 0 {
			return nil
		}
		if err := s.store.AddUploadSessionBytes(r.Context(), profileID, uploadID, delta); err != nil {
			return err
		}
		bytesTracked += delta
		return nil
	}); err != nil {
		return newUploadInternalError("failed to assemble upload", map[string]any{"error": err.Error()})
	}
	return nil
}

func (s *server) handleStagingMultipartFormUpload(
	w http.ResponseWriter,
	r *http.Request,
	profileID, uploadID, stagingDir string,
	bytesTracked int64,
) {
	newUploadStagingHTTPService(s).handleStagingMultipartFormUpload(w, r, profileID, uploadID, stagingDir, bytesTracked)
}

func (s *server) stagingMultipartFormPart(
	r *http.Request,
	profileID, uploadID, stagingDir string,
	part *multipart.Part,
	remainingBytes *int64,
	maxBytes int64,
) (int, int, *uploadHTTPError) {
	_, _, _, dstPath, skipped, uploadErr := stagingMultipartFormPaths(stagingDir, part)
	if skipped {
		return 0, 1, nil
	}
	if uploadErr != nil {
		return 0, 0, uploadErr
	}
	n, uploadErr := s.stagingMultipartFormWritePart(r, part, dstPath, remainingBytes, maxBytes)
	if uploadErr != nil {
		return 0, 0, uploadErr
	}
	if uploadErr := s.stagingMultipartFormPersistPart(r, profileID, uploadID, n, remainingBytes, maxBytes); uploadErr != nil {
		return 0, 0, uploadErr
	}
	return 1, 0, nil
}

func fileSizeIfExists(path string) int64 {
	if info, err := os.Stat(path); err == nil {
		return info.Size()
	}
	return 0
}
