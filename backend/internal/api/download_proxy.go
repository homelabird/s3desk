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
		xfProto = normalizeRequestScheme(xfProto)
		if xfProto != "" {
			return xfProto
		}
	}
	if r.TLS != nil {
		return "https"
	}
	if r.URL != nil {
		if scheme := normalizeRequestScheme(r.URL.Scheme); scheme != "" {
			return scheme
		}
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
				val = normalizeRequestScheme(val)
				if val != "" {
					return val
				}
			}
		}
	}
	return ""
}

func normalizeRequestScheme(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "http", "https":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func (s *server) handleDownloadProxy(w http.ResponseWriter, r *http.Request) {
	newDownloadProxyHTTPService(s).handleDownloadProxy(w, r)
}
