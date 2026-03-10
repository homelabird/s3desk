package api

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

type downloadProxyToken struct {
	ProfileID    string
	Bucket       string
	Key          string
	Expires      int64
	Size         int64
	ContentType  string
	LastModified string
}

func parseDownloadProxyMetadataHints(sizeRaw, contentType, lastModified string) (int64, string, string, error) {
	contentType = strings.TrimSpace(contentType)
	lastModified = strings.TrimSpace(lastModified)
	if sizeRaw == "" {
		return 0, contentType, lastModified, nil
	}
	size, err := strconv.ParseInt(strings.TrimSpace(sizeRaw), 10, 64)
	if err != nil || size < 0 {
		return 0, "", "", errors.New("size is invalid")
	}
	return size, contentType, lastModified, nil
}

func downloadProxyHasEmbeddedMetadata(token downloadProxyToken) bool {
	return token.Size > 0 || token.ContentType != "" || token.LastModified != ""
}

func downloadProxyEntryFromToken(token downloadProxyToken) (rcloneListEntry, bool) {
	if !downloadProxyHasEmbeddedMetadata(token) {
		return rcloneListEntry{}, false
	}
	return rcloneListEntry{
		Size:     token.Size,
		MimeType: token.ContentType,
		ModTime:  token.LastModified,
	}, true
}

func resolveProxySecret(apiToken string) []byte {
	trimmed := strings.TrimSpace(apiToken)
	if trimmed != "" {
		return []byte(trimmed)
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err == nil {
		return secret
	}
	return []byte(time.Now().UTC().Format(time.RFC3339Nano))
}

func (s *server) signDownloadProxy(token downloadProxyToken) string {
	mac := hmac.New(sha256.New, s.proxySecret)
	_, _ = mac.Write([]byte(proxySignatureInput(token)))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *server) verifyDownloadProxy(token downloadProxyToken, sig string) bool {
	expected := s.signDownloadProxy(token)
	if len(sig) != len(expected) {
		return false
	}
	return hmac.Equal([]byte(sig), []byte(expected))
}

func proxySignatureInput(token downloadProxyToken) string {
	return strings.Join([]string{
		strings.TrimSpace(token.ProfileID),
		strings.TrimSpace(token.Bucket),
		token.Key,
		strconv.FormatInt(token.Expires, 10),
		strconv.FormatInt(token.Size, 10),
		strings.TrimSpace(token.ContentType),
		strings.TrimSpace(token.LastModified),
	}, "\n")
}

func (s *server) buildDownloadProxyURL(r *http.Request, token downloadProxyToken) string {
	sig := s.signDownloadProxy(token)
	values := url.Values{}
	values.Set("profileId", token.ProfileID)
	values.Set("bucket", token.Bucket)
	values.Set("key", token.Key)
	values.Set("expires", strconv.FormatInt(token.Expires, 10))
	if token.Size > 0 {
		values.Set("size", strconv.FormatInt(token.Size, 10))
	}
	if strings.TrimSpace(token.ContentType) != "" {
		values.Set("contentType", strings.TrimSpace(token.ContentType))
	}
	if strings.TrimSpace(token.LastModified) != "" {
		values.Set("lastModified", strings.TrimSpace(token.LastModified))
	}
	values.Set("sig", sig)

	if base := s.externalBaseURL(); base != nil {
		resolved := *base
		resolved.Path = strings.TrimRight(resolved.Path, "/") + "/download-proxy"
		resolved.RawQuery = values.Encode()
		resolved.Fragment = ""
		return resolved.String()
	}

	scheme := requestScheme(r)
	return (&url.URL{
		Scheme:   scheme,
		Host:     r.Host,
		Path:     "/download-proxy",
		RawQuery: values.Encode(),
	}).String()
}

func (s *server) externalBaseURL() *url.URL {
	raw := strings.TrimSpace(s.cfg.ExternalBaseURL)
	if raw == "" {
		return nil
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return nil
	}
	switch strings.ToLower(parsed.Scheme) {
	case "http", "https":
	default:
		return nil
	}
	return parsed
}

func requestScheme(r *http.Request) string {
	if forwarded := strings.TrimSpace(r.Header.Get("Forwarded")); forwarded != "" {
		if proto := parseForwardedProto(forwarded); proto != "" {
			return proto
		}
	}
	if xfProto := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")); xfProto != "" {
		if comma := strings.Index(xfProto, ","); comma >= 0 {
			xfProto = xfProto[:comma]
		}
		xfProto = strings.ToLower(strings.TrimSpace(xfProto))
		if xfProto != "" {
			return xfProto
		}
	}
	if r.TLS != nil {
		return "https"
	}
	if r.URL != nil && r.URL.Scheme != "" {
		return r.URL.Scheme
	}
	return "http"
}

func (s *server) resolveDownloadProxyEntry(ctx context.Context, secrets models.ProfileSecrets, token downloadProxyToken, bucket, key string) (rcloneListEntry, bool, string, error) {
	if entry, ok := downloadProxyEntryFromToken(token); ok {
		return entry, true, "", nil
	}
	entry, stderr, err := s.rcloneStat(ctx, secrets, rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash), true, false, "download-proxy-stat")
	if err != nil {
		return rcloneListEntry{}, false, stderr, err
	}
	return entry, false, "", nil
}

func parseForwardedProto(value string) string {
	for _, part := range strings.Split(value, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		for _, kv := range strings.Split(part, ";") {
			kv = strings.TrimSpace(kv)
			if kv == "" {
				continue
			}
			key, val, ok := strings.Cut(kv, "=")
			if !ok {
				continue
			}
			if strings.EqualFold(strings.TrimSpace(key), "proto") {
				val = strings.Trim(strings.TrimSpace(val), "\"")
				val = strings.ToLower(val)
				if val != "" {
					return val
				}
			}
		}
	}
	return ""
}

func (s *server) handleDownloadProxy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	profileID := strings.TrimSpace(r.URL.Query().Get("profileId"))
	bucket := strings.TrimSpace(r.URL.Query().Get("bucket"))
	key := strings.TrimSpace(r.URL.Query().Get("key"))
	expiresRaw := strings.TrimSpace(r.URL.Query().Get("expires"))
	sizeRaw := strings.TrimSpace(r.URL.Query().Get("size"))
	sig := strings.TrimSpace(r.URL.Query().Get("sig"))
	size, contentType, lastModified, err := parseDownloadProxyMetadataHints(sizeRaw, r.URL.Query().Get("contentType"), r.URL.Query().Get("lastModified"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), map[string]any{"size": sizeRaw})
		return
	}

	if profileID == "" || bucket == "" || key == "" || expiresRaw == "" || sig == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profileId, bucket, key, expires, sig are required", nil)
		return
	}
	expiresAt, err := strconv.ParseInt(expiresRaw, 10, 64)
	if err != nil || expiresAt <= 0 {
		writeError(w, http.StatusBadRequest, "invalid_request", "expires is invalid", map[string]any{"expires": expiresRaw})
		return
	}
	if time.Now().UTC().Unix() > expiresAt {
		writeError(w, http.StatusForbidden, "expired", "download link expired", nil)
		return
	}

	token := downloadProxyToken{
		ProfileID:    profileID,
		Bucket:       bucket,
		Key:          key,
		Expires:      expiresAt,
		Size:         size,
		ContentType:  contentType,
		LastModified: lastModified,
	}
	if !s.verifyDownloadProxy(token, sig) {
		writeError(w, http.StatusForbidden, "invalid_signature", "download signature is invalid", nil)
		return
	}

	secrets, ok, err := s.store.GetProfileSecrets(r.Context(), profileID)
	if err != nil {
		if errors.Is(err, store.ErrEncryptedCredentials) {
			writeError(w, http.StatusBadRequest, "encrypted_credentials", err.Error(), nil)
			return
		}
		if errors.Is(err, store.ErrEncryptionKeyRequired) {
			writeError(w, http.StatusBadRequest, "encryption_required", err.Error(), nil)
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load profile", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "profile_not_found", "profile not found", map[string]any{"profileId": profileID})
		return
	}

	entry, hasEmbeddedMetadata, stderr, err := s.resolveDownloadProxyEntry(r.Context(), secrets, token, bucket, key)
	if hasEmbeddedMetadata {
		if s.metrics != nil {
			s.metrics.IncDownloadProxyMode("stat_skipped")
		}
	} else {
		if s.metrics != nil {
			s.metrics.IncDownloadProxyMode("stat_required")
		}
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
	}

	if r.Method == http.MethodHead {
		applyDownloadHeaders(w.Header(), entry, key)
		w.WriteHeader(http.StatusOK)
		return
	}

	args := append(s.rcloneDownloadFlags(), "cat", rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash))
	proc, err := s.startRclone(r.Context(), secrets, args, "download-proxy")
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
