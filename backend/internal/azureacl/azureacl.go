package azureacl

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
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

// Response is a minimal HTTP response wrapper for Azure Blob control-plane calls.
// It captures status, headers, and the full response body.
type Response struct {
	Status  int
	Headers http.Header
	Body    []byte
}

// Policy is a JSON-friendly representation of container public access + stored access policies.
// It maps to the Get/Set Container ACL REST API.
type Policy struct {
	PublicAccess         string               `json:"publicAccess"`
	StoredAccessPolicies []StoredAccessPolicy `json:"storedAccessPolicies"`
}

type StoredAccessPolicy struct {
	ID         string `json:"id"`
	Start      string `json:"start,omitempty"`
	Expiry     string `json:"expiry,omitempty"`
	Permission string `json:"permission,omitempty"`
}

// GetContainerPolicy fetches public access + stored access policies for a container.
// It returns a Response whose Body is a JSON document (Policy) when the upstream call succeeds.
func GetContainerPolicy(ctx context.Context, profile models.ProfileSecrets, container string) (Response, error) {
	resp, err := do(ctx, profile, http.MethodGet, container, "", nil)
	if err != nil {
		return Response{}, err
	}
	if resp.Status < 200 || resp.Status > 299 {
		return resp, nil
	}

	pol := Policy{PublicAccess: "private", StoredAccessPolicies: []StoredAccessPolicy{}}
	if v := strings.TrimSpace(resp.Headers.Get("x-ms-blob-public-access")); v != "" {
		pol.PublicAccess = v
	}

	if len(resp.Body) > 0 {
		var env signedIdentifiersEnvelope
		if err := xml.Unmarshal(resp.Body, &env); err == nil {
			for _, si := range env.SignedIdentifiers {
				p := StoredAccessPolicy{ID: strings.TrimSpace(si.ID)}
				p.Start = strings.TrimSpace(si.AccessPolicy.Start)
				p.Expiry = strings.TrimSpace(si.AccessPolicy.Expiry)
				p.Permission = strings.TrimSpace(si.AccessPolicy.Permission)
				if p.ID != "" {
					pol.StoredAccessPolicies = append(pol.StoredAccessPolicies, p)
				}
			}
		}
	}

	b, _ := json.Marshal(pol)
	return Response{Status: resp.Status, Headers: resp.Headers, Body: b}, nil
}

// PutContainerPolicy sets public access + stored access policies for a container.
// The input is a JSON document representing Policy.
func PutContainerPolicy(ctx context.Context, profile models.ProfileSecrets, container string, policyJSON []byte) (Response, error) {
	var pol Policy
	if err := json.Unmarshal(policyJSON, &pol); err != nil {
		return Response{}, fmt.Errorf("invalid azure policy json: %w", err)
	}
	pa := strings.ToLower(strings.TrimSpace(pol.PublicAccess))
	if pa == "" {
		pa = "private"
	}
	if pa != "private" && pa != "blob" && pa != "container" {
		return Response{}, errors.New("publicAccess must be one of: private, blob, container")
	}

	// Build XML body for signed identifiers.
	env := signedIdentifiersEnvelope{SignedIdentifiers: []signedIdentifier{}}
	for _, p := range pol.StoredAccessPolicies {
		id := strings.TrimSpace(p.ID)
		if id == "" {
			continue
		}
		env.SignedIdentifiers = append(env.SignedIdentifiers, signedIdentifier{
			ID: id,
			AccessPolicy: accessPolicy{
				Start:      strings.TrimSpace(p.Start),
				Expiry:     strings.TrimSpace(p.Expiry),
				Permission: strings.TrimSpace(p.Permission),
			},
		})
	}

	xmlBody := []byte("<?xml version=\"1.0\" encoding=\"utf-8\"?>")
	if len(env.SignedIdentifiers) > 0 {
		b, _ := xml.Marshal(env)
		xmlBody = append(xmlBody, b...)
	} else {
		// Empty body removes all stored access policies.
		xmlBody = nil
	}

	publicAccessHeader := ""
	if pa != "private" {
		publicAccessHeader = pa
	}

	return do(ctx, profile, http.MethodPut, container, publicAccessHeader, xmlBody)
}

// DeleteContainerPolicy resets container to private and clears all stored access policies.
func DeleteContainerPolicy(ctx context.Context, profile models.ProfileSecrets, container string) (Response, error) {
	return do(ctx, profile, http.MethodPut, container, "", nil)
}

// ---- REST call implementation ----

func do(ctx context.Context, profile models.ProfileSecrets, method, container, publicAccess string, body []byte) (Response, error) {
	baseURL, accountName, accountKey, err := resolveEndpoint(profile)
	if err != nil {
		return Response{}, err
	}

	u := *baseURL
	u.Path = strings.TrimRight(u.Path, "/") + "/" + url.PathEscape(container)
	u.RawQuery = "restype=container&comp=acl"

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

	// Required headers for Shared Key auth.
	msDate := time.Now().UTC().Format(http.TimeFormat)
	req.Header.Set("x-ms-date", msDate)
	req.Header.Set("x-ms-version", "2020-10-02")
	if publicAccess != "" {
		req.Header.Set("x-ms-blob-public-access", publicAccess)
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/xml")
	}

	auth, err := buildSharedKeyAuthorization(req, accountName, accountKey)
	if err != nil {
		return Response{}, err
	}
	req.Header.Set("Authorization", auth)

	resp, err := client.Do(req)
	if err != nil {
		return Response{}, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	return Response{Status: resp.StatusCode, Headers: resp.Header.Clone(), Body: respBody}, nil
}

func resolveEndpoint(profile models.ProfileSecrets) (*url.URL, string, string, error) {
	accountName := strings.TrimSpace(profile.AzureAccountName)
	accountKey := strings.TrimSpace(profile.AzureAccountKey)
	if accountName == "" || accountKey == "" {
		return nil, "", "", errors.New("missing azure account credentials")
	}

	ep := strings.TrimSpace(profile.AzureEndpoint)
	if ep == "" {
		if profile.AzureUseEmulator {
			ep = fmt.Sprintf("http://127.0.0.1:10000/%s", accountName)
		} else {
			ep = fmt.Sprintf("https://%s.blob.core.windows.net", accountName)
		}
	}

	if !strings.Contains(ep, "://") {
		if looksLikeLocalEndpoint(ep) {
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

// ---- Shared Key auth ----

func buildSharedKeyAuthorization(req *http.Request, accountName, accountKeyB64 string) (string, error) {
	key, err := base64.StdEncoding.DecodeString(accountKeyB64)
	if err != nil {
		return "", errors.New("invalid azure account key")
	}

	stringToSign := buildStringToSign(req, accountName)
	h := hmac.New(sha256.New, key)
	_, _ = h.Write([]byte(stringToSign))
	sig := base64.StdEncoding.EncodeToString(h.Sum(nil))
	return fmt.Sprintf("SharedKey %s:%s", accountName, sig), nil
}

func buildStringToSign(req *http.Request, accountName string) string {
	// See: https://learn.microsoft.com/en-us/rest/api/storageservices/authorize-with-shared-key
	// Keep the fields stable; most are empty for our operations.
	contentLength := req.Header.Get("Content-Length")
	if contentLength == "" && req.ContentLength > 0 {
		contentLength = fmt.Sprintf("%d", req.ContentLength)
	}
	if req.Body == nil || req.Method == http.MethodGet || req.Method == http.MethodHead {
		contentLength = ""
	}
	if contentLength == "0" {
		contentLength = ""
	}

	canonicalHeaders := canonicalizeHeaders(req.Header)
	canonicalResource := canonicalizeResource(req.URL, accountName)

	// Date is empty because we always use x-ms-date.
	return strings.Join([]string{
		req.Method,
		"", // Content-Encoding
		"", // Content-Language
		contentLength,
		"", // Content-MD5
		req.Header.Get("Content-Type"),
		"", // Date
		"", // If-Modified-Since
		"", // If-Match
		"", // If-None-Match
		"", // If-Unmodified-Since
		"", // Range
		canonicalHeaders + canonicalResource,
	}, "\n")
}

func canonicalizeHeaders(h http.Header) string {
	var keys []string
	for k := range h {
		lk := strings.ToLower(k)
		if strings.HasPrefix(lk, "x-ms-") {
			keys = append(keys, lk)
		}
	}
	sort.Strings(keys)
	var b strings.Builder
	for _, k := range keys {
		vals := h.Values(k)
		// h.Values is case-sensitive; fallback to canonical lookup.
		if len(vals) == 0 {
			vals = h.Values(http.CanonicalHeaderKey(k))
		}
		v := strings.Join(vals, ",")
		v = strings.TrimSpace(v)
		b.WriteString(k)
		b.WriteString(":")
		b.WriteString(v)
		b.WriteString("\n")
	}
	return b.String()
}

func canonicalizeResource(u *url.URL, accountName string) string {
	// /<account>/<path>
	path := u.EscapedPath()
	if path == "" {
		path = "/"
	}
	res := "/" + accountName + path

	q, _ := url.ParseQuery(u.RawQuery)
	if len(q) == 0 {
		return res
	}
	var keys []string
	for k := range q {
		keys = append(keys, strings.ToLower(k))
	}
	sort.Strings(keys)
	for _, k := range keys {
		vals := q[k]
		sort.Strings(vals)
		res += "\n" + k + ":" + strings.Join(vals, ",")
	}
	return res
}

// ---- XML models ----

type signedIdentifiersEnvelope struct {
	XMLName           xml.Name           `xml:"SignedIdentifiers"`
	SignedIdentifiers []signedIdentifier `xml:"SignedIdentifier"`
}

type signedIdentifier struct {
	ID           string       `xml:"Id"`
	AccessPolicy accessPolicy `xml:"AccessPolicy"`
}

type accessPolicy struct {
	Start      string `xml:"Start"`
	Expiry     string `xml:"Expiry"`
	Permission string `xml:"Permission"`
}
