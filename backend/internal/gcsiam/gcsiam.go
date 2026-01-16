package gcsiam

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"s3desk/internal/models"
)

// Response is a minimal HTTP response wrapper for GCS JSON API calls.
// It captures status, headers, and the full response body.
type Response struct {
	Status  int
	Headers http.Header
	Body    []byte
}

// GetBucketIamPolicy fetches bucket IAM policy via the GCS JSON API:
//
//	GET /b/{bucket}/iam
func GetBucketIamPolicy(ctx context.Context, profile models.ProfileSecrets, bucket string) (Response, error) {
	return do(ctx, profile, http.MethodGet, bucket, nil)
}

// PutBucketIamPolicy updates bucket IAM policy via the GCS JSON API:
//
//	PUT /b/{bucket}/iam
func PutBucketIamPolicy(ctx context.Context, profile models.ProfileSecrets, bucket string, policyJSON []byte) (Response, error) {
	return do(ctx, profile, http.MethodPut, bucket, policyJSON)
}

func do(ctx context.Context, profile models.ProfileSecrets, method, bucket string, body []byte) (Response, error) {
	baseURL, err := resolveEndpoint(profile)
	if err != nil {
		return Response{}, err
	}

	u := *baseURL
	u.Path = strings.TrimRight(u.Path, "/") + "/b/" + url.PathEscape(bucket) + "/iam"

	client, err := newHTTPClient(profile)
	if err != nil {
		return Response{}, err
	}

	var payload []byte
	if body != nil {
		payload = body
	}

	req, err := http.NewRequestWithContext(ctx, method, u.String(), bytes.NewReader(payload))
	if err != nil {
		return Response{}, err
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	// Auth: allow anonymous only when explicitly configured, usually for emulator/local endpoints.
	if token, err := resolveBearerToken(ctx, profile); err != nil {
		return Response{}, err
	} else if strings.TrimSpace(token) != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := client.Do(req)
	if err != nil {
		return Response{}, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	return Response{Status: resp.StatusCode, Headers: resp.Header.Clone(), Body: respBody}, nil
}

func resolveEndpoint(profile models.ProfileSecrets) (*url.URL, error) {
	ep := strings.TrimSpace(profile.GcpEndpoint)
	if ep == "" {
		// Default GCS JSON API base.
		return url.Parse("https://storage.googleapis.com/storage/v1")
	}
	// If scheme is missing, infer based on host.
	if !strings.Contains(ep, "://") {
		if looksLikeLocalEndpoint(ep) {
			ep = "http://" + ep
		} else {
			ep = "https://" + ep
		}
	}
	u, err := url.Parse(ep)
	if err != nil {
		return nil, err
	}
	u.Path = strings.TrimRight(u.Path, "/")
	// fake-gcs-server exposes JSON API under /storage/v1.
	if !strings.HasSuffix(u.Path, "/storage/v1") {
		u.Path = u.Path + "/storage/v1"
	}
	return u, nil
}

func newHTTPClient(profile models.ProfileSecrets) (*http.Client, error) {
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.DialContext = (&net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}).DialContext

	tlsCfg, err := buildTLSConfig(profile)
	if err != nil {
		return nil, err
	}
	if tlsCfg != nil {
		tr.TLSClientConfig = tlsCfg
	}

	return &http.Client{Transport: tr, Timeout: 30 * time.Second}, nil
}

func buildTLSConfig(profile models.ProfileSecrets) (*tls.Config, error) {
	if !profile.TLSInsecureSkipVerify && profile.TLSConfig == nil {
		return nil, nil
	}
	cfg := &tls.Config{MinVersion: tls.VersionTLS12}
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

func looksLikeLocalEndpoint(endpoint string) bool {
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

// ---- Service account auth (JWT Bearer) ----

type serviceAccountJSON struct {
	ClientEmail string `json:"client_email"`
	PrivateKey  string `json:"private_key"`
	TokenURI    string `json:"token_uri"`
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int64  `json:"expires_in"`
}

func resolveBearerToken(ctx context.Context, profile models.ProfileSecrets) (string, error) {
	// Allow anonymous access only for custom endpoints (e.g. fake-gcs-server).
	if profile.GcpAnonymous {
		if ep := strings.TrimSpace(profile.GcpEndpoint); ep != "" {
			// If user explicitly configured an endpoint, assume it's a local/emulator endpoint.
			return "", nil
		}
		return "", errors.New("anonymous GCS profile cannot manage IAM policy")
	}

	raw := strings.TrimSpace(profile.GcpServiceAccountJSON)
	if raw == "" {
		return "", errors.New("missing gcp service account json")
	}

	var sa serviceAccountJSON
	if err := json.Unmarshal([]byte(raw), &sa); err != nil {
		return "", fmt.Errorf("invalid gcp service account json: %w", err)
	}
	if strings.TrimSpace(sa.ClientEmail) == "" || strings.TrimSpace(sa.PrivateKey) == "" {
		return "", errors.New("gcp service account json missing client_email/private_key")
	}
	tokenURI := strings.TrimSpace(sa.TokenURI)
	if tokenURI == "" {
		tokenURI = "https://oauth2.googleapis.com/token" // #nosec G101 -- well-known OAuth token URL
	}

	jwt, err := buildSignedJWT(sa.ClientEmail, sa.PrivateKey, tokenURI)
	if err != nil {
		return "", err
	}

	form := url.Values{}
	form.Set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
	form.Set("assertion", jwt)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURI, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return "", fmt.Errorf("failed to fetch gcp access token: %s", strings.TrimSpace(string(body)))
	}

	var tr tokenResponse
	if err := json.Unmarshal(body, &tr); err != nil {
		return "", fmt.Errorf("invalid token response: %w", err)
	}
	if strings.TrimSpace(tr.AccessToken) == "" {
		return "", errors.New("empty access_token")
	}
	return tr.AccessToken, nil
}

func buildSignedJWT(clientEmail, privateKeyPEM, tokenURI string) (string, error) {
	now := time.Now().UTC()
	claims := map[string]any{
		"iss":   clientEmail,
		"scope": "https://www.googleapis.com/auth/devstorage.full_control",
		"aud":   tokenURI,
		"iat":   now.Unix(),
		"exp":   now.Add(55 * time.Minute).Unix(),
	}

	header := map[string]any{"alg": "RS256", "typ": "JWT"}
	headJSON, _ := json.Marshal(header)
	claimsJSON, _ := json.Marshal(claims)

	enc := base64.RawURLEncoding
	unsigned := enc.EncodeToString(headJSON) + "." + enc.EncodeToString(claimsJSON)

	key, err := parseRSAPrivateKey(privateKeyPEM)
	if err != nil {
		return "", err
	}

	h := sha256.Sum256([]byte(unsigned))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, h[:])
	if err != nil {
		return "", err
	}

	return unsigned + "." + enc.EncodeToString(sig), nil
}

func parseRSAPrivateKey(pemText string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemText))
	if block == nil {
		return nil, errors.New("failed to decode private key pem")
	}
	// Most service account keys are PKCS8.
	if k, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		if rk, ok := k.(*rsa.PrivateKey); ok {
			return rk, nil
		}
		return nil, errors.New("private key is not RSA")
	}
	// Fallback: PKCS1.
	if k, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return k, nil
	}
	return nil, errors.New("failed to parse rsa private key")
}
