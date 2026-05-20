package api

import (
	"bufio"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
)

var errDownloadProxyProfileRequired = errors.New("download proxy profile id is required")

func resolveDownloadProxyProfileID(r *http.Request, secrets models.ProfileSecrets) (string, error) {
	profileID := strings.TrimSpace(secrets.ID)
	if profileID == "" {
		profileID = strings.TrimSpace(r.Header.Get("X-Profile-Id"))
	}
	if profileID == "" {
		return "", errDownloadProxyProfileRequired
	}
	return profileID, nil
}

func (s *server) buildProxiedObjectDownloadURL(r *http.Request, secrets models.ProfileSecrets, bucket, key string, expires time.Duration, sizeHint int64, contentType, lastModified string) (models.PresignedURLResponse, error) {
	profileID, err := resolveDownloadProxyProfileID(r, secrets)
	if err != nil {
		return models.PresignedURLResponse{}, err
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
	return models.PresignedURLResponse{
		URL:       url,
		ExpiresAt: expiresAt.Format(time.RFC3339Nano),
	}, nil
}

func listObjectsMetricOperation(delimiter, continuationToken string) string {
	token := strings.TrimSpace(continuationToken)
	if delimiter == "" {
		if token != "" {
			return "list_objects_recursive_continuation"
		}
		return "list_objects_recursive_first"
	}
	if token != "" {
		return "list_objects_continuation"
	}
	return "list_objects_first"
}

func (s *server) handleListObjects(w http.ResponseWriter, r *http.Request) {
	newObjectListHTTPService(s).handleListObjects(w, r)
}

func (s *server) handleSearchObjects(w http.ResponseWriter, r *http.Request) {
	newObjectSearchHTTPService(s).handleSearchObjects(w, r)
}

func (s *server) handleGetObjectIndexSummary(w http.ResponseWriter, r *http.Request) {
	newObjectIndexSummaryHTTPService(s).handleGetObjectIndexSummary(w, r)
}

func (s *server) handleGetObjectMeta(w http.ResponseWriter, r *http.Request) {
	newObjectMetaHTTPService(s).handleGetObjectMeta(w, r)
}

func (s *server) handleCreateObjectFolder(w http.ResponseWriter, r *http.Request) {
	newObjectCreateFolderHTTPService(s).handleCreateObjectFolder(w, r)
}

func (s *server) handleGetObjectDownloadURL(w http.ResponseWriter, r *http.Request) {
	newObjectDownloadURLHTTPService(s).handleGetObjectDownloadURL(w, r)
}

func (s *server) handleDownloadObject(w http.ResponseWriter, r *http.Request) {
	newObjectDownloadHTTPService(s).handleDownloadObject(w, r)
}

func (s *server) handleDeleteObjects(w http.ResponseWriter, r *http.Request) {
	newObjectDeleteHTTPService(s).handleDeleteObjects(w, r)
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
// defaultVal only when missing, and clamps the result to [min, max].
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
	for i, line := range lines {
		if err := rcloneconfig.ValidateSingleLineValue(fmt.Sprintf("line %d", i+1), line); err != nil {
			_ = f.Close()
			_ = os.Remove(tmpPath)
			return "", err
		}
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
