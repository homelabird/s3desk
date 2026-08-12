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
) *uploadHTTPError {
	defer func() { _ = r.Body.Close() }()
	limitBytes := *remainingBytes
	if uploadMaxBytesConfigured(maxBytes) {
		limitBytes = *remainingBytes + prevSize
	}
	tmpPath, n, err := writeReaderToTempFile(r.Body, chunkPath, limitBytes)
	if err != nil {
		if errors.Is(err, errUploadTooLarge) {
			return newUploadTooLargeError("upload exceeds maxBytes", map[string]any{"maxBytes": maxBytes})
		}
		return newUploadInternalError("failed to store chunk", map[string]any{"error": err.Error()})
	}

	delta := n - prevSize
	if delta != 0 {
		if uploadErr := s.addUploadSessionBytesWithReservation(r.Context(), profileID, uploadID, delta); uploadErr != nil {
			if cleanupErr := os.Remove(tmpPath); cleanupErr != nil {
				if uploadErr.details == nil {
					uploadErr.details = map[string]any{}
				}
				uploadErr.details["cleanupError"] = cleanupErr.Error()
			}
			return uploadErr
		}
	}
	if err := os.Rename(tmpPath, chunkPath); err != nil {
		details := map[string]any{"error": err.Error()}
		if delta != 0 {
			if rollbackErr := s.store.AddUploadSessionBytes(r.Context(), profileID, uploadID, -delta); rollbackErr != nil {
				details["rollbackError"] = rollbackErr.Error()
			}
		}
		if cleanupErr := os.Remove(tmpPath); cleanupErr != nil {
			details["cleanupError"] = cleanupErr.Error()
		}
		return newUploadInternalError("failed to store chunk", details)
	}
	if err := tryAssembleChunkFile(stagingDir, relOS, filepath.Dir(chunkPath), chunkValues.total); err != nil {
		return newUploadInternalError("failed to assemble upload", map[string]any{"error": err.Error()})
	}
	return nil
}

func (s *server) releaseExistingStagingChunkFinal(
	r *http.Request,
	profileID, uploadID, stagingDir, relOS string,
) (int64, *uploadHTTPError) {
	finalPath := filepath.Join(stagingDir, relOS)
	if !isUnderDir(stagingDir, finalPath) {
		return 0, newUploadBadRequestError("invalid upload path", map[string]any{"path": filepath.ToSlash(relOS)})
	}
	info, err := os.Lstat(finalPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return 0, nil
		}
		return 0, newUploadInternalError("failed to inspect existing staged file", map[string]any{"error": err.Error()})
	}
	if !info.Mode().IsRegular() {
		return 0, newUploadBadRequestError("upload path conflicts with an existing non-file entry", map[string]any{"path": filepath.ToSlash(relOS)})
	}

	size := info.Size()
	if size != 0 {
		if err := s.store.AddUploadSessionBytesWithinLimit(r.Context(), profileID, uploadID, -size, s.cfg.UploadMaxBytes); err != nil {
			return 0, newUploadInternalError("failed to release existing staged file bytes", map[string]any{"error": err.Error()})
		}
	}
	if err := os.Remove(finalPath); err != nil {
		details := map[string]any{"error": err.Error()}
		if size != 0 {
			if rollbackErr := s.store.AddUploadSessionBytes(r.Context(), profileID, uploadID, size); rollbackErr != nil {
				details["rollbackError"] = rollbackErr.Error()
			}
		}
		return 0, newUploadInternalError("failed to replace existing staged file", details)
	}
	return size, nil
}

func stagingChunkAlreadyAssembled(stagingDir, relOS, chunkDir string, expectedSize int64) (bool, *uploadHTTPError) {
	finalPath := filepath.Join(stagingDir, relOS)
	if !isUnderDir(stagingDir, finalPath) {
		return false, newUploadBadRequestError("invalid upload path", map[string]any{"path": filepath.ToSlash(relOS)})
	}
	info, err := os.Lstat(finalPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, nil
		}
		return false, newUploadInternalError("failed to inspect existing staged file", map[string]any{"error": err.Error()})
	}
	if !info.Mode().IsRegular() {
		return false, newUploadBadRequestError("upload path conflicts with an existing non-file entry", map[string]any{"path": filepath.ToSlash(relOS)})
	}
	if info.Size() != expectedSize {
		return false, nil
	}
	if stagingChunkDirHasParts(chunkDir) {
		return false, nil
	}
	return true, nil
}

func stagingChunkDirHasParts(chunkDir string) bool {
	entries, err := os.ReadDir(chunkDir)
	if err != nil {
		return false
	}
	for _, entry := range entries {
		if entry.IsDir() {
			return true
		}
		if entry.Type().IsRegular() {
			return true
		}
	}
	return false
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
		if cleanupErr := os.Remove(dstPath); cleanupErr != nil {
			if uploadErr.details == nil {
				uploadErr.details = map[string]any{}
			}
			uploadErr.details["cleanupError"] = cleanupErr.Error()
		}
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
