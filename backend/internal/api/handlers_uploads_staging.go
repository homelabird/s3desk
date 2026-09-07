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
		if tmpPath == "" && errors.Is(err, os.ErrNotExist) {
			// Assembly can remove the directory after the readiness check. Confirm
			// completion under the file lock before acknowledging the duplicate.
			state, uploadErr := buildStagingMultipartChunkState(r.Context(), stagingDir, filepath.ToSlash(relOS), chunkValues.total, chunkValues.chunkSize, chunkValues.fileSize)
			if uploadErr != nil {
				return uploadErr
			}
			if len(state.Present) == chunkValues.total {
				return nil
			}
		}
		if errors.Is(err, errUploadTooLarge) {
			return newUploadTooLargeError("upload exceeds maxBytes", map[string]any{"maxBytes": maxBytes})
		}
		return newUploadInternalError("failed to store chunk", map[string]any{"error": err.Error()})
	}
	defer func() { _ = os.Remove(tmpPath) }()
	expectedSize := expectedUploadChunkSize(chunkValues.index, chunkValues.total, chunkValues.chunkSize, chunkValues.fileSize)
	if n != expectedSize {
		_ = os.Remove(tmpPath)
		return newUploadBadRequestError("chunk size mismatch", map[string]any{
			"actualSize":   n,
			"expectedSize": expectedSize,
		})
	}

	if uploadErr := s.stagingChunkStore(r, profileID, uploadID, stagingDir, relOS, chunkPath, tmpPath, n, chunkValues.fileSize); uploadErr != nil {
		return uploadErr
	}
	_, uploadErr := buildStagingMultipartChunkState(r.Context(), stagingDir, filepath.ToSlash(relOS), chunkValues.total, chunkValues.chunkSize, chunkValues.fileSize)
	return uploadErr
}

func (s *server) stagingChunkStore(
	r *http.Request,
	profileID, uploadID, stagingDir, relOS, chunkPath, tmpPath string,
	n, fileSize int64,
) *uploadHTTPError {
	release, err := lockStagingPath(r.Context(), filepath.Dir(chunkPath))
	if err != nil {
		return newUploadInternalError("failed to store chunk", map[string]any{"error": err.Error()})
	}
	defer release()

	assembled, uploadErr := stagingChunkAlreadyAssembled(stagingDir, relOS, filepath.Dir(chunkPath), fileSize)
	if uploadErr != nil {
		return uploadErr
	}
	if assembled {
		return nil
	}
	if _, uploadErr := s.releaseExistingStagingChunkFinal(r, profileID, uploadID, stagingDir, relOS); uploadErr != nil {
		return uploadErr
	}
	// Another request may have stored this same chunk while its body was arriving.
	prevSize := fileSizeIfExists(chunkPath)
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

// The caller holds the file's staging chunk lock while checking and cleaning up.
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
	// Promotion is complete once the final file is renamed. A crash or a late
	// duplicate body may leave chunks or temporary files behind afterwards.
	if err := os.RemoveAll(chunkDir); err != nil {
		return false, newUploadInternalError("failed to clean up assembled chunks", map[string]any{"error": err.Error()})
	}
	return true, nil
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
	_, _, dstDir, dstPath, skipped, uploadErr := stagingMultipartFormPaths(stagingDir, part)
	if skipped {
		return 0, 1, nil
	}
	if uploadErr != nil {
		return 0, 0, uploadErr
	}
	tmpPath, n, uploadErr := s.stagingMultipartFormWritePart(r, part, dstPath, remainingBytes, maxBytes)
	if uploadErr != nil {
		return 0, 0, uploadErr
	}
	defer func() { _ = os.Remove(tmpPath) }()
	// ponytail: serialize name allocation and promotion per directory; use atomic
	// no-replace promotion if this short section becomes a throughput bottleneck.
	release, err := lockStagingPath(r.Context(), dstDir)
	if err != nil {
		return 0, 0, newUploadInternalError("failed to store file", map[string]any{"error": err.Error()})
	}
	defer release()
	dstPath, err = uniqueFilePath(dstDir, filepath.Base(dstPath))
	if err != nil {
		return 0, 0, newUploadInternalError("failed to choose upload filename", map[string]any{"error": err.Error()})
	}
	if err := os.Rename(tmpPath, dstPath); err != nil {
		return 0, 0, newUploadInternalError("failed to store file", map[string]any{"error": err.Error()})
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
