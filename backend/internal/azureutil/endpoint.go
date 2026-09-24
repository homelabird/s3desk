package azureutil

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"

	"time"

	"s3desk/internal/models"
	"s3desk/internal/profileendpoint"
	"s3desk/internal/profiletls"
)

// BlobEndpoint returns the configured Azure Blob endpoint or the default endpoint
// derived from the profile. The default emulator endpoint must stay consistent
// across rclone-backed and direct REST-backed code paths.
func BlobEndpoint(profile models.ProfileSecrets) string {
	accountName := strings.TrimSpace(profile.AzureAccountName)
	endpoint := strings.TrimSpace(profile.AzureEndpoint)
	if endpoint != "" {
		return endpoint
	}
	if profile.AzureUseEmulator {
		if accountName == "" {
			return ""
		}
		return fmt.Sprintf("http://azurite:10000/%s", accountName)
	}
	if accountName == "" {
		return ""
	}
	return fmt.Sprintf("https://%s.blob.core.windows.net", accountName)
}

func ResolveBlobCredentials(profile models.ProfileSecrets) (*url.URL, string, string, error) {
	accountName := strings.TrimSpace(profile.AzureAccountName)
	accountKey := strings.TrimSpace(profile.AzureAccountKey)
	if accountName == "" || accountKey == "" {
		return nil, "", "", errors.New("missing azure account credentials")
	}
	ep := strings.TrimSpace(BlobEndpoint(profile))
	if !strings.Contains(ep, "://") {
		if isLocalEndpoint(ep) {
			ep = "http://" + ep
		} else {
			ep = "https://" + ep
		}
	}
	u, err := url.Parse(ep)
	if err != nil {
		return nil, "", "", err
	}
	u.Path = strings.TrimRight(u.Path, "/")
	return u, accountName, accountKey, nil
}

func NewHTTPClient(profile models.ProfileSecrets, allowRemote bool) (*http.Client, error) {
	tlsCfg, err := profiletls.BuildConfig(profile)
	if err != nil {
		return nil, err
	}
	return profileendpoint.NewHTTPClient(profileendpoint.HTTPClientOptions{
		AllowRemote: allowRemote,
		TLSConfig:   tlsCfg,
		Timeout:     30 * time.Second,
	}), nil
}

func BuildSharedKeyAuthorization(req *http.Request, accountName, accountKeyB64 string) (string, error) {
	key, err := base64.StdEncoding.DecodeString(accountKeyB64)
	if err != nil {
		return "", errors.New("invalid azure account key")
	}
	contentLength := req.Header.Get("Content-Length")
	if contentLength == "" && req.ContentLength > 0 {
		contentLength = fmt.Sprint(req.ContentLength)
	}
	if req.Body == nil || req.Method == http.MethodGet || req.Method == http.MethodHead || contentLength == "0" {
		contentLength = ""
	}
	var headers []string
	for k := range req.Header {
		if strings.HasPrefix(strings.ToLower(k), "x-ms-") {
			headers = append(headers, strings.ToLower(k))
		}
	}
	sort.Strings(headers)
	var canonicalHeaders strings.Builder
	for _, k := range headers {
		values := req.Header.Values(k)
		if len(values) == 0 {
			values = req.Header.Values(http.CanonicalHeaderKey(k))
		}
		canonicalHeaders.WriteString(k + ":" + strings.TrimSpace(strings.Join(values, ",")) + "\n")
	}
	resource := "/" + accountName + req.URL.EscapedPath()
	if req.URL.EscapedPath() == "" {
		resource = "/" + accountName + "/"
	}
	query, _ := url.ParseQuery(req.URL.RawQuery)
	var keys []string
	for k := range query {
		keys = append(keys, strings.ToLower(k))
	}
	sort.Strings(keys)
	for _, k := range keys {
		values := query[k]
		sort.Strings(values)
		resource += "\n" + k + ":" + strings.Join(values, ",")
	}
	stringToSign := strings.Join([]string{
		req.Method, "", "", contentLength, "", req.Header.Get("Content-Type"), "", "", "", "", "", "",
		canonicalHeaders.String() + resource,
	}, "\n")
	h := hmac.New(sha256.New, key)
	_, _ = h.Write([]byte(stringToSign))
	return fmt.Sprintf("SharedKey %s:%s", accountName, base64.StdEncoding.EncodeToString(h.Sum(nil))), nil
}

func isLocalEndpoint(endpoint string) bool {
	host := endpoint
	if strings.Contains(host, "/") {
		host = strings.SplitN(host, "/", 2)[0]
	}
	host = strings.Trim(host, "[]")
	if strings.Contains(host, ":") {
		host, _, _ = strings.Cut(host, ":")
	}
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && (ip.IsPrivate() || ip.IsLoopback())
}
