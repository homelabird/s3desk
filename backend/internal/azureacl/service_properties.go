package azureacl

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"io"
	"net/http"
	"strings"
	"time"

	"s3desk/internal/models"
)

type ServiceProperties struct {
	IsVersioningEnabled   bool                   `json:"isVersioningEnabled"`
	DeleteRetentionPolicy *DeleteRetentionPolicy `json:"deleteRetentionPolicy,omitempty"`
}

type DeleteRetentionPolicy struct {
	Enabled bool `json:"enabled"`
	Days    *int `json:"days,omitempty"`
}

type ContainerProperties struct {
	HasImmutabilityPolicy bool `json:"hasImmutabilityPolicy"`
	HasLegalHold          bool `json:"hasLegalHold"`
}

type storageServicePropertiesEnvelope struct {
	XMLName               xml.Name                         `xml:"StorageServiceProperties"`
	DeleteRetentionPolicy *storageDeleteRetentionPolicyXML `xml:"DeleteRetentionPolicy,omitempty"`
	IsVersioningEnabled   bool                             `xml:"IsVersioningEnabled,omitempty"`
}

type storageDeleteRetentionPolicyXML struct {
	Enabled bool `xml:"Enabled"`
	Days    *int `xml:"Days,omitempty"`
}

func GetBlobServiceProperties(ctx context.Context, profile models.ProfileSecrets) (Response, error) {
	resp, err := doServiceProperties(ctx, profile, http.MethodGet, nil)
	if err != nil {
		return Response{}, err
	}
	if resp.Status < 200 || resp.Status > 299 {
		return resp, nil
	}

	var env storageServicePropertiesEnvelope
	if err := xml.Unmarshal(resp.Body, &env); err != nil {
		return Response{}, err
	}

	payload := ServiceProperties{
		IsVersioningEnabled: env.IsVersioningEnabled,
	}
	if env.DeleteRetentionPolicy != nil {
		payload.DeleteRetentionPolicy = &DeleteRetentionPolicy{
			Enabled: env.DeleteRetentionPolicy.Enabled,
			Days:    env.DeleteRetentionPolicy.Days,
		}
	}

	body, _ := json.Marshal(payload)
	return Response{Status: resp.Status, Headers: resp.Headers, Body: body}, nil
}

func PutBlobServiceProperties(ctx context.Context, profile models.ProfileSecrets, propsJSON []byte) (Response, error) {
	var props ServiceProperties
	if err := json.Unmarshal(propsJSON, &props); err != nil {
		return Response{}, err
	}

	env := storageServicePropertiesEnvelope{
		IsVersioningEnabled: props.IsVersioningEnabled,
	}
	if props.DeleteRetentionPolicy != nil {
		env.DeleteRetentionPolicy = &storageDeleteRetentionPolicyXML{
			Enabled: props.DeleteRetentionPolicy.Enabled,
			Days:    props.DeleteRetentionPolicy.Days,
		}
	}
	body, err := xml.Marshal(env)
	if err != nil {
		return Response{}, err
	}
	return doServiceProperties(ctx, profile, http.MethodPut, body)
}

func GetContainerProperties(ctx context.Context, profile models.ProfileSecrets, container string) (Response, error) {
	baseURL, accountName, accountKey, err := resolveEndpoint(profile)
	if err != nil {
		return Response{}, err
	}

	u := *baseURL
	u.Path = strings.TrimRight(u.Path, "/") + "/" + container
	u.RawQuery = "restype=container"

	client, err := newHTTPClient(profile)
	if err != nil {
		return Response{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, u.String(), nil)
	if err != nil {
		return Response{}, err
	}
	req.Header.Set("x-ms-date", time.Now().UTC().Format(http.TimeFormat))
	req.Header.Set("x-ms-version", "2020-10-02")
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

	props := ContainerProperties{
		HasImmutabilityPolicy: strings.EqualFold(strings.TrimSpace(resp.Header.Get("x-ms-has-immutability-policy")), "true"),
		HasLegalHold:          strings.EqualFold(strings.TrimSpace(resp.Header.Get("x-ms-has-legal-hold")), "true"),
	}
	body, _ := json.Marshal(props)
	return Response{Status: resp.StatusCode, Headers: resp.Header.Clone(), Body: body}, nil
}

func doServiceProperties(ctx context.Context, profile models.ProfileSecrets, method string, body []byte) (Response, error) {
	baseURL, accountName, accountKey, err := resolveEndpoint(profile)
	if err != nil {
		return Response{}, err
	}

	u := *baseURL
	u.RawQuery = "restype=service&comp=properties"

	client, err := newHTTPClient(profile)
	if err != nil {
		return Response{}, err
	}

	var payload []byte
	if body != nil {
		payload = append([]byte(`<?xml version="1.0" encoding="utf-8"?>`), body...)
	}

	req, err := http.NewRequestWithContext(ctx, method, u.String(), bytes.NewReader(payload))
	if err != nil {
		return Response{}, err
	}
	req.Header.Set("x-ms-date", time.Now().UTC().Format(http.TimeFormat))
	req.Header.Set("x-ms-version", "2020-10-02")
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
