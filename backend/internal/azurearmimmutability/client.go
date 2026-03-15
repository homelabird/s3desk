package azurearmimmutability

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"s3desk/internal/models"
)

const (
	apiVersion          = "2024-01-01"
	baseURL             = "https://management.azure.com"
	armScope            = "https://management.azure.com/.default"
	tokenEndpointFormat = "https://login.microsoftonline.com/%s/oauth2/v2.0/token" // #nosec G101 -- Public OAuth endpoint format, not a secret.
)

type Response struct {
	Status  int
	Headers http.Header
	Body    []byte
}

type Policy struct {
	ID         string           `json:"id,omitempty"`
	Name       string           `json:"name,omitempty"`
	Type       string           `json:"type,omitempty"`
	ETag       string           `json:"etag,omitempty"`
	Properties PolicyProperties `json:"properties"`
}

type PolicyProperties struct {
	ImmutabilityPeriodSinceCreationInDays int    `json:"immutabilityPeriodSinceCreationInDays,omitempty"`
	State                                 string `json:"state,omitempty"`
	AllowProtectedAppendWrites            bool   `json:"allowProtectedAppendWrites,omitempty"`
	AllowProtectedAppendWritesAll         bool   `json:"allowProtectedAppendWritesAll,omitempty"`
}

type PutPolicyRequest struct {
	Days                          int
	IfMatch                       string
	AllowProtectedAppendWrites    *bool
	AllowProtectedAppendWritesAll *bool
}

type ExtendPolicyRequest struct {
	Days    int
	IfMatch string
}

type Client struct {
	httpClient *http.Client
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
}

type policyRequestBody struct {
	Properties policyRequestProperties `json:"properties"`
}

type policyRequestProperties struct {
	ImmutabilityPeriodSinceCreationInDays int   `json:"immutabilityPeriodSinceCreationInDays"`
	AllowProtectedAppendWrites            *bool `json:"allowProtectedAppendWrites,omitempty"`
	AllowProtectedAppendWritesAll         *bool `json:"allowProtectedAppendWritesAll,omitempty"`
}

var defaultClient = &Client{
	httpClient: &http.Client{Timeout: 30 * time.Second},
}

func HasConfig(profile models.ProfileSecrets) bool {
	return strings.TrimSpace(profile.AzureSubscriptionID) != "" &&
		strings.TrimSpace(profile.AzureResourceGroup) != "" &&
		strings.TrimSpace(profile.AzureTenantID) != "" &&
		strings.TrimSpace(profile.AzureClientID) != "" &&
		strings.TrimSpace(profile.AzureClientSecret) != ""
}

func GetPolicy(ctx context.Context, profile models.ProfileSecrets, container string) (Response, error) {
	return defaultClient.GetPolicy(ctx, profile, container)
}

func PutPolicy(ctx context.Context, profile models.ProfileSecrets, container string, req PutPolicyRequest) (Response, error) {
	return defaultClient.PutPolicy(ctx, profile, container, req)
}

func DeletePolicy(ctx context.Context, profile models.ProfileSecrets, container string, ifMatch string) (Response, error) {
	return defaultClient.DeletePolicy(ctx, profile, container, ifMatch)
}

func LockPolicy(ctx context.Context, profile models.ProfileSecrets, container string, ifMatch string) (Response, error) {
	return defaultClient.LockPolicy(ctx, profile, container, ifMatch)
}

func ExtendPolicy(ctx context.Context, profile models.ProfileSecrets, container string, req ExtendPolicyRequest) (Response, error) {
	return defaultClient.ExtendPolicy(ctx, profile, container, req)
}

func (c *Client) GetPolicy(ctx context.Context, profile models.ProfileSecrets, container string) (Response, error) {
	token, err := c.getToken(ctx, profile)
	if err != nil {
		return Response{}, err
	}
	return c.do(ctx, http.MethodGet, resourceURL(profile, container), token, "", nil)
}

func (c *Client) PutPolicy(ctx context.Context, profile models.ProfileSecrets, container string, req PutPolicyRequest) (Response, error) {
	token, err := c.getToken(ctx, profile)
	if err != nil {
		return Response{}, err
	}
	body, err := json.Marshal(policyRequestBody{
		Properties: policyRequestProperties{
			ImmutabilityPeriodSinceCreationInDays: req.Days,
			AllowProtectedAppendWrites:            req.AllowProtectedAppendWrites,
			AllowProtectedAppendWritesAll:         req.AllowProtectedAppendWritesAll,
		},
	})
	if err != nil {
		return Response{}, err
	}
	return c.do(ctx, http.MethodPut, resourceURL(profile, container), token, strings.TrimSpace(req.IfMatch), body)
}

func (c *Client) DeletePolicy(ctx context.Context, profile models.ProfileSecrets, container string, ifMatch string) (Response, error) {
	token, err := c.getToken(ctx, profile)
	if err != nil {
		return Response{}, err
	}
	return c.do(ctx, http.MethodDelete, resourceURL(profile, container), token, strings.TrimSpace(ifMatch), nil)
}

func (c *Client) LockPolicy(ctx context.Context, profile models.ProfileSecrets, container string, ifMatch string) (Response, error) {
	token, err := c.getToken(ctx, profile)
	if err != nil {
		return Response{}, err
	}
	return c.do(ctx, http.MethodPost, actionURL(profile, container, "lock"), token, strings.TrimSpace(ifMatch), nil)
}

func (c *Client) ExtendPolicy(ctx context.Context, profile models.ProfileSecrets, container string, req ExtendPolicyRequest) (Response, error) {
	token, err := c.getToken(ctx, profile)
	if err != nil {
		return Response{}, err
	}
	body, err := json.Marshal(policyRequestBody{
		Properties: policyRequestProperties{
			ImmutabilityPeriodSinceCreationInDays: req.Days,
		},
	})
	if err != nil {
		return Response{}, err
	}
	return c.do(ctx, http.MethodPost, actionURL(profile, container, "extend"), token, strings.TrimSpace(req.IfMatch), body)
}

func (c *Client) getToken(ctx context.Context, profile models.ProfileSecrets) (string, error) {
	if !HasConfig(profile) {
		return "", fmt.Errorf("azure arm immutability configuration is incomplete")
	}
	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	form.Set("client_id", strings.TrimSpace(profile.AzureClientID))
	form.Set("client_secret", profile.AzureClientSecret)
	form.Set("scope", armScope)

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		fmt.Sprintf(tokenEndpointFormat, url.PathEscape(strings.TrimSpace(profile.AzureTenantID))),
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("azure oauth returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var payload tokenResponse
	if err := json.Unmarshal(body, &payload); err != nil {
		return "", err
	}
	if strings.TrimSpace(payload.AccessToken) == "" {
		return "", fmt.Errorf("azure oauth token response did not include access_token")
	}
	return payload.AccessToken, nil
}

func (c *Client) do(ctx context.Context, method string, rawURL string, token string, ifMatch string, body []byte) (Response, error) {
	var reader io.Reader
	if len(body) > 0 {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, rawURL, reader)
	if err != nil {
		return Response{}, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	if ifMatch != "" {
		req.Header.Set("If-Match", ifMatch)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return Response{}, err
	}
	defer resp.Body.Close()

	payload, err := io.ReadAll(resp.Body)
	if err != nil {
		return Response{}, err
	}
	return Response{
		Status:  resp.StatusCode,
		Headers: resp.Header.Clone(),
		Body:    payload,
	}, nil
}

func resourceURL(profile models.ProfileSecrets, container string) string {
	return resourceBaseURL(profile, container) + "?api-version=" + apiVersion
}

func actionURL(profile models.ProfileSecrets, container string, action string) string {
	return resourceBaseURL(profile, container) + "/" + strings.TrimSpace(action) + "?api-version=" + apiVersion
}

func resourceBaseURL(profile models.ProfileSecrets, container string) string {
	return fmt.Sprintf(
		"%s/subscriptions/%s/resourceGroups/%s/providers/Microsoft.Storage/storageAccounts/%s/blobServices/default/containers/%s/immutabilityPolicies/default",
		baseURL,
		url.PathEscape(strings.TrimSpace(profile.AzureSubscriptionID)),
		url.PathEscape(strings.TrimSpace(profile.AzureResourceGroup)),
		url.PathEscape(strings.TrimSpace(profile.AzureAccountName)),
		url.PathEscape(strings.TrimSpace(container)),
	)
}
