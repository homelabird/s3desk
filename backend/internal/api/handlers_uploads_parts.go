package api

import (
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

func directMultipartFormPath(prefix string, part *multipart.Part) (string, string, bool) {
	relPath := safeUploadPath(part)
	if relPath == "" {
		return "", "", true
	}
	return relPath, directUploadObjectKey(prefix, relPath), false
}

func (s *server) directMultipartFormUploadPart(
	r *http.Request,
	secrets models.ProfileSecrets,
	us store.UploadSession,
	key, relPath string,
	part *multipart.Part,
	remainingBytes *int64,
	maxBytes int64,
) (int64, *uploadHTTPError) {
	source := io.Reader(part)
	if uploadMaxBytesConfigured(maxBytes) {
		source = io.LimitReader(source, *remainingBytes+1)
	}
	return s.directMultipartFormStream(r, secrets, us, key, relPath, source, remainingBytes, maxBytes)
}

func (s *server) directMultipartFormStream(
	r *http.Request,
	secrets models.ProfileSecrets,
	us store.UploadSession,
	key, relPath string,
	source io.Reader,
	remainingBytes *int64,
	maxBytes int64,
) (int64, *uploadHTTPError) {
	counter := &countingReader{r: source}
	target := rcloneRemoteObject(us.Bucket, key, secrets.PreserveLeadingSlash)
	stderr, err := s.runRcloneStdin(r.Context(), secrets, []string{"rcat", target}, "upload-stream", counter)
	if err != nil {
		return 0, newUploadInternalError("failed to stream upload", map[string]any{
			"path":  relPath,
			"error": err.Error(),
		})
	}
	if uploadMaxBytesConfigured(maxBytes) {
		if counter.n > *remainingBytes {
			_, _, _ = s.runRcloneCapture(r.Context(), secrets, []string{"deletefile", target}, "upload-stream-cleanup")
			return 0, newUploadTooLargeError("upload exceeds maxBytes", map[string]any{"maxBytes": maxBytes})
		}
		*remainingBytes -= counter.n
	}
	_ = stderr
	return counter.n, nil
}

func (s *server) directMultipartFormPersistPart(
	r *http.Request,
	profileID, uploadID, relPath, key, bucket string,
	size int64,
) *uploadHTTPError {
	if err := s.store.UpsertUploadObject(r.Context(), store.UploadObject{
		UploadID:     uploadID,
		ProfileID:    profileID,
		Path:         relPath,
		Bucket:       bucket,
		ObjectKey:    key,
		ExpectedSize: &size,
	}); err != nil {
		return newUploadInternalError("failed to persist upload object", map[string]any{"error": err.Error()})
	}
	return nil
}

func stagingMultipartFormPaths(
	stagingDir string,
	part *multipart.Part,
) (relPath, relOS, dstDir, dstPath string, skipped bool, uploadErr *uploadHTTPError) {
	relPath = safeUploadPath(part)
	if relPath == "" {
		return "", "", "", "", true, nil
	}

	relOS = filepath.FromSlash(relPath)
	dstDir = filepath.Join(stagingDir, filepath.Dir(relOS))
	if !isUnderDir(stagingDir, dstDir) {
		return "", "", "", "", false, newUploadBadRequestError("invalid upload path", map[string]any{"path": relPath})
	}
	if err := os.MkdirAll(dstDir, 0o700); err != nil {
		return "", "", "", "", false, newUploadInternalError("failed to create upload directory", map[string]any{"error": err.Error()})
	}

	filename := filepath.Base(relOS)
	dstPath = uniqueFilePath(dstDir, filename)
	return relPath, relOS, dstDir, dstPath, false, nil
}

func (s *server) stagingMultipartFormWritePart(
	r *http.Request,
	part *multipart.Part,
	dstPath string,
	remainingBytes *int64,
	maxBytes int64,
) (int64, *uploadHTTPError) {
	if uploadMaxBytesConfigured(maxBytes) && *remainingBytes <= 0 {
		return 0, newUploadTooLargeError("upload exceeds maxBytes", map[string]any{"maxBytes": maxBytes})
	}
	n, err := writePartToFile(part, dstPath, *remainingBytes)
	if err != nil {
		if errors.Is(err, errUploadTooLarge) {
			return 0, newUploadTooLargeError("upload exceeds maxBytes", map[string]any{"maxBytes": maxBytes})
		}
		return 0, newUploadInternalError("failed to store file", map[string]any{"error": err.Error()})
	}
	_ = r
	return n, nil
}

func (s *server) stagingMultipartFormPersistPart(
	r *http.Request,
	profileID, uploadID string,
	written int64,
	remainingBytes *int64,
	maxBytes int64,
) *uploadHTTPError {
	if err := s.store.AddUploadSessionBytes(r.Context(), profileID, uploadID, written); err != nil {
		return newUploadInternalError("failed to update upload bytes", map[string]any{"error": err.Error()})
	}
	if uploadMaxBytesConfigured(maxBytes) {
		*remainingBytes -= written
	}
	return nil
}
