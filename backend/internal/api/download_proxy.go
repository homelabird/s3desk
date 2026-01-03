package api

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"s3desk/internal/store"
)

type downloadProxyToken struct {
	ProfileID string
	Bucket    string
	Key       string
	Expires   int64
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
	}, "\n")
}

func (s *server) buildDownloadProxyURL(r *http.Request, token downloadProxyToken) string {
	sig := s.signDownloadProxy(token)
	values := url.Values{}
	values.Set("profileId", token.ProfileID)
	values.Set("bucket", token.Bucket)
	values.Set("key", token.Key)
	values.Set("expires", strconv.FormatInt(token.Expires, 10))
	values.Set("sig", sig)

	scheme := requestScheme(r)
	return (&url.URL{
		Scheme:   scheme,
		Host:     r.Host,
		Path:     "/download-proxy",
		RawQuery: values.Encode(),
	}).String()
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
	sig := strings.TrimSpace(r.URL.Query().Get("sig"))

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
		ProfileID: profileID,
		Bucket:    bucket,
		Key:       key,
		Expires:   expiresAt,
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

	entry, stderr, err := s.rcloneStat(r.Context(), secrets, rcloneRemoteObject(bucket, key, secrets.PreserveLeadingSlash), true, false, "download-proxy-stat")
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

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "no-store")
	if entry.Size > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(entry.Size, 10))
	}
	if etag := rcloneETagFromHashes(entry.Hashes); etag != "" {
		w.Header().Set("ETag", etag)
	}
	if lm := rcloneParseTime(entry.ModTime); lm != "" {
		if parsed, err := time.Parse(time.RFC3339Nano, lm); err == nil {
			w.Header().Set("Last-Modified", parsed.UTC().Format(http.TimeFormat))
		}
	}
	if filename := path.Base(key); filename != "" && filename != "." && filename != "/" {
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	}

	if r.Method == http.MethodHead {
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

	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, proc.stdout)
	_ = proc.wait()
}
