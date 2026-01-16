package s3policy

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"s3desk/internal/models"
)

// Response is a minimal HTTP response wrapper for S3 control-plane calls.
// It captures status, headers, and the full response body.
type Response struct {
	Status  int
	Headers http.Header
	Body    []byte
}

// GetBucketPolicy fetches bucket policy via S3 API: GET ?policy.
func GetBucketPolicy(ctx context.Context, profile models.ProfileSecrets, bucket string) (Response, error) {
	return do(ctx, profile, http.MethodGet, bucket, nil)
}

// PutBucketPolicy sets bucket policy via S3 API: PUT ?policy.
func PutBucketPolicy(ctx context.Context, profile models.ProfileSecrets, bucket string, policyJSON []byte) (Response, error) {
	return do(ctx, profile, http.MethodPut, bucket, policyJSON)
}

// DeleteBucketPolicy deletes bucket policy via S3 API: DELETE ?policy.
func DeleteBucketPolicy(ctx context.Context, profile models.ProfileSecrets, bucket string) (Response, error) {
	return do(ctx, profile, http.MethodDelete, bucket, nil)
}

func do(ctx context.Context, profile models.ProfileSecrets, method, bucket string, body []byte) (Response, error) {
	baseURL, region, err := resolveEndpoint(profile)
	if err != nil {
		return Response{}, err
	}

	// Build URL: path-style by default for maximum compatibility.
	//   https://endpoint/<bucket>?policy
	// If ForcePathStyle is false and the endpoint looks like AWS, we may use virtual-host style:
	//   https://<bucket>.s3.<region>.amazonaws.com/?policy
	useVirtualHost := false
	if !profile.ForcePathStyle && isAWSHost(baseURL.Hostname()) && isSafeForVirtualHost(bucket) && !isIPAddress(baseURL.Hostname()) {
		useVirtualHost = true
	}

	u := *baseURL
	if useVirtualHost {
		u.Host = bucket + "." + baseURL.Host
		u.Path = "/"
	} else {
		u.Path = joinURLPath(baseURL.Path, bucket)
	}
	// Use a bare key in the actual URL (?policy), but canonicalize to policy= for signing.
	u.RawQuery = "policy"

	var payload []byte
	if body != nil {
		payload = body
	} else {
		payload = nil
	}

	client, err := newHTTPClient(profile)
	if err != nil {
		return Response{}, err
	}

	req, err := http.NewRequestWithContext(ctx, method, u.String(), bytes.NewReader(payload))
	if err != nil {
		return Response{}, err
	}

	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	amzDate := time.Now().UTC()
	payloadHash := sha256Hex(payload)

	req.Header.Set("X-Amz-Date", amzDate.Format("20060102T150405Z"))
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	if profile.SessionToken != nil && strings.TrimSpace(*profile.SessionToken) != "" {
		req.Header.Set("X-Amz-Security-Token", strings.TrimSpace(*profile.SessionToken))
	}

	authorization, err := signV4(req, profile, region, payloadHash)
	if err != nil {
		return Response{}, err
	}
	req.Header.Set("Authorization", authorization)

	resp, err := client.Do(req)
	if err != nil {
		return Response{}, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	return Response{
		Status:  resp.StatusCode,
		Headers: resp.Header.Clone(),
		Body:    respBody,
	}, nil
}

func resolveEndpoint(profile models.ProfileSecrets) (*url.URL, string, error) {
	region := strings.TrimSpace(profile.Region)
	if region == "" {
		region = "us-east-1"
	}

	ep := strings.TrimSpace(profile.Endpoint)
	if ep == "" {
		// AWS default endpoint.
		u, err := url.Parse(fmt.Sprintf("https://s3.%s.amazonaws.com", region))
		if err != nil {
			return nil, "", err
		}
		return u, region, nil
	}

	// If scheme is missing, infer based on host.
	if !strings.Contains(ep, "://") {
		// Heuristic: local/private addresses usually run http.
		if looksLikeLocalEndpoint(ep) {
			ep = "http://" + ep
		} else {
			ep = "https://" + ep
		}
	}

	u, err := url.Parse(ep)
	if err != nil {
		return nil, "", err
	}
	if u.Scheme == "" {
		u.Scheme = "https"
	}
	if u.Host == "" {
		return nil, "", errors.New("invalid endpoint")
	}
	// Ensure no trailing slash weirdness; path-style joins later.
	u.Path = strings.TrimRight(u.Path, "/")
	return u, region, nil
}

func newHTTPClient(profile models.ProfileSecrets) (*http.Client, error) {
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.DialContext = (&net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}).DialContext

	// Only configure TLS if scheme is https; the Transport will ignore TLS settings for http.
	tlsCfg, err := buildTLSConfig(profile)
	if err != nil {
		return nil, err
	}
	if tlsCfg != nil {
		tr.TLSClientConfig = tlsCfg
	}

	return &http.Client{
		Transport: tr,
		Timeout:   30 * time.Second,
	}, nil
}

func buildTLSConfig(profile models.ProfileSecrets) (*tls.Config, error) {
	// Start with a default config only when needed.
	if !profile.TLSInsecureSkipVerify && profile.TLSConfig == nil {
		return nil, nil
	}
	cfg := &tls.Config{
		MinVersion: tls.VersionTLS12,
	}
	if profile.TLSInsecureSkipVerify {
		cfg.InsecureSkipVerify = true //nolint:gosec
	}

	if profile.TLSConfig == nil {
		return cfg, nil
	}

	mode := strings.ToLower(strings.TrimSpace(string(profile.TLSConfig.Mode)))
	if mode == "" || mode == "disabled" {
		return cfg, nil
	}
	if mode != "mtls" {
		return nil, fmt.Errorf("unsupported tls mode: %s", mode)
	}

	certPEM := strings.TrimSpace(profile.TLSConfig.ClientCertPEM)
	keyPEM := strings.TrimSpace(profile.TLSConfig.ClientKeyPEM)
	if certPEM == "" || keyPEM == "" {
		return nil, errors.New("mtls requires client certificate and key")
	}
	cert, err := tls.X509KeyPair([]byte(certPEM), []byte(keyPEM))
	if err != nil {
		return nil, err
	}
	cfg.Certificates = []tls.Certificate{cert}

	if caPEM := strings.TrimSpace(profile.TLSConfig.CACertPEM); caPEM != "" {
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM([]byte(caPEM)) {
			return nil, errors.New("failed to parse ca certificate")
		}
		cfg.RootCAs = pool
	}

	return cfg, nil
}

func joinURLPath(basePath, bucket string) string {
	p := strings.TrimRight(strings.TrimSpace(basePath), "/")
	if p == "" {
		return "/" + bucket
	}
	return p + "/" + bucket
}

func sha256Hex(payload []byte) string {
	h := sha256.Sum256(payload)
	return hex.EncodeToString(h[:])
}

func signV4(req *http.Request, profile models.ProfileSecrets, region, payloadHash string) (string, error) {
	accessKey := strings.TrimSpace(profile.AccessKeyID)
	secretKey := strings.TrimSpace(profile.SecretAccessKey)
	if accessKey == "" || secretKey == "" {
		return "", errors.New("missing access key")
	}

	amzDate := req.Header.Get("X-Amz-Date")
	if amzDate == "" {
		return "", errors.New("missing x-amz-date")
	}
	if len(amzDate) < 8 {
		return "", errors.New("invalid x-amz-date")
	}
	date := amzDate[:8]

	// Canonical request
	canonicalURI := req.URL.EscapedPath()
	if canonicalURI == "" {
		canonicalURI = "/"
	}
	canonicalQuery := canonicalQueryString(req.URL)

	canonicalHeaders, signedHeaders := canonicalHeaders(req)

	canonicalRequest := strings.Join([]string{
		req.Method,
		canonicalURI,
		canonicalQuery,
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	}, "\n")

	scope := fmt.Sprintf("%s/%s/s3/aws4_request", date, region)
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		scope,
		sha256Hex([]byte(canonicalRequest)),
	}, "\n")

	signingKey := deriveSigningKey(secretKey, date, region, "s3")
	signature := hmacHex(signingKey, stringToSign)

	return fmt.Sprintf(
		"AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		accessKey,
		scope,
		signedHeaders,
		signature,
	), nil
}

func canonicalHeaders(req *http.Request) (string, string) {
	// Keep the signed header set intentionally small/stable.
	hdrs := map[string]string{
		"host":                 req.URL.Host,
		"x-amz-content-sha256": req.Header.Get("X-Amz-Content-Sha256"),
		"x-amz-date":           req.Header.Get("X-Amz-Date"),
	}
	if v := req.Header.Get("X-Amz-Security-Token"); v != "" {
		hdrs["x-amz-security-token"] = v
	}

	keys := make([]string, 0, len(hdrs))
	for k := range hdrs {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var b strings.Builder
	for _, k := range keys {
		b.WriteString(k)
		b.WriteString(":")
		b.WriteString(normalizeHeaderValue(hdrs[k]))
		b.WriteString("\n")
	}
	return b.String(), strings.Join(keys, ";")
}

func normalizeHeaderValue(v string) string {
	// Trim and collapse sequential spaces.
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	fields := strings.Fields(v)
	return strings.Join(fields, " ")
}

func canonicalQueryString(u *url.URL) string {
	q, err := url.ParseQuery(u.RawQuery)
	if err != nil || len(q) == 0 {
		return ""
	}

	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		vals := q[k]
		if len(vals) == 0 {
			parts = append(parts, awsQueryEscape(k)+"=")
			continue
		}
		sort.Strings(vals)
		for _, v := range vals {
			parts = append(parts, awsQueryEscape(k)+"="+awsQueryEscape(v))
		}
	}
	return strings.Join(parts, "&")
}

// awsQueryEscape performs AWS SigV4 query escaping (RFC3986 with spaces as %20).
func awsQueryEscape(s string) string {
	// url.QueryEscape uses + for spaces; AWS wants %20.
	esc := url.QueryEscape(s)
	esc = strings.ReplaceAll(esc, "+", "%20")
	esc = strings.ReplaceAll(esc, "%7E", "~")
	return esc
}

func deriveSigningKey(secret, date, region, service string) []byte {
	kDate := hmacBytes([]byte("AWS4"+secret), date)
	kRegion := hmacBytes(kDate, region)
	kService := hmacBytes(kRegion, service)
	return hmacBytes(kService, "aws4_request")
}

func hmacBytes(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	_, _ = h.Write([]byte(data))
	return h.Sum(nil)
}

func hmacHex(key []byte, data string) string {
	return hex.EncodeToString(hmacBytes(key, data))
}

func isAWSHost(host string) bool {
	h := strings.ToLower(strings.TrimSpace(host))
	return strings.HasSuffix(h, ".amazonaws.com") || strings.Contains(h, ".amazonaws.com")
}

func isSafeForVirtualHost(bucket string) bool {
	// Bucket names containing dots complicate TLS validation with virtual-host style.
	return !strings.Contains(bucket, ".")
}

func isIPAddress(host string) bool {
	return net.ParseIP(strings.Trim(host, "[]")) != nil
}

func looksLikeLocalEndpoint(endpoint string) bool {
	// endpoint is without scheme.
	host := endpoint
	if strings.Contains(host, "/") {
		host = strings.SplitN(host, "/", 2)[0]
	}
	h := strings.Trim(host, "[]")
	hostname := h
	if strings.Contains(hostname, ":") {
		hostname, _, _ = strings.Cut(hostname, ":")
	}
	hostname = strings.ToLower(strings.TrimSpace(hostname))
	if hostname == "localhost" {
		return true
	}
	ip := net.ParseIP(hostname)
	if ip == nil {
		return false
	}
	return ip.IsPrivate() || ip.IsLoopback()
}

var ErrNotS3Profile = errors.New("profile is not S3 compatible")

func ValidateS3Profile(profile models.ProfileSecrets) error {
	switch profile.Provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible, models.ProfileProviderOciS3Compat:
		return nil
	default:
		return ErrNotS3Profile
	}
}
