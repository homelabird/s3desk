package azureacl

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"s3desk/internal/azureutil"
	"s3desk/internal/models"
	"s3desk/internal/responsebody"
)

// Response is a minimal HTTP response wrapper for Azure Blob control-plane calls.
// It captures status, headers, and the full response body.
type Response struct {
	Status  int
	Headers http.Header
	Body    []byte
}

type ClientOptions struct {
	AllowRemote bool
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
	return GetContainerPolicyWithOptions(ctx, profile, container, ClientOptions{})
}

func GetContainerPolicyWithOptions(ctx context.Context, profile models.ProfileSecrets, container string, opts ClientOptions) (Response, error) {
	resp, err := do(ctx, profile, http.MethodGet, container, "", nil, opts)
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
	return PutContainerPolicyWithOptions(ctx, profile, container, policyJSON, ClientOptions{})
}

func PutContainerPolicyWithOptions(ctx context.Context, profile models.ProfileSecrets, container string, policyJSON []byte, opts ClientOptions) (Response, error) {
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

	return do(ctx, profile, http.MethodPut, container, publicAccessHeader, xmlBody, opts)
}

// DeleteContainerPolicy resets container to private and clears all stored access policies.
func DeleteContainerPolicy(ctx context.Context, profile models.ProfileSecrets, container string) (Response, error) {
	return DeleteContainerPolicyWithOptions(ctx, profile, container, ClientOptions{})
}

func DeleteContainerPolicyWithOptions(ctx context.Context, profile models.ProfileSecrets, container string, opts ClientOptions) (Response, error) {
	return do(ctx, profile, http.MethodPut, container, "", nil, opts)
}

// ---- REST call implementation ----

func do(ctx context.Context, profile models.ProfileSecrets, method, container, publicAccess string, body []byte, opts ClientOptions) (Response, error) {
	baseURL, accountName, accountKey, err := resolveEndpoint(profile)
	if err != nil {
		return Response{}, err
	}

	u := *baseURL
	u.Path = strings.TrimRight(u.Path, "/") + "/" + url.PathEscape(container)
	u.RawQuery = "restype=container&comp=acl"

	client, err := newHTTPClient(profile, opts)
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

	respBody, err := responsebody.ReadAll(resp.Body, responsebody.ControlPlaneMaxBytes)
	if err != nil {
		return Response{}, err
	}
	return Response{Status: resp.StatusCode, Headers: resp.Header.Clone(), Body: respBody}, nil
}

func resolveEndpoint(profile models.ProfileSecrets) (*url.URL, string, string, error) {
	return azureutil.ResolveBlobCredentials(profile)
}

func newHTTPClient(profile models.ProfileSecrets, opts ClientOptions) (*http.Client, error) {
	return azureutil.NewHTTPClient(profile, opts.AllowRemote)
}

// ---- Shared Key auth ----

func buildSharedKeyAuthorization(req *http.Request, accountName, accountKeyB64 string) (string, error) {
	return azureutil.BuildSharedKeyAuthorization(req, accountName, accountKeyB64)
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
