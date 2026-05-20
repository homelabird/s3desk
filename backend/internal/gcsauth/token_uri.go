package gcsauth

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
)

const DefaultTokenURI = "https://oauth2.googleapis.com/token" // #nosec G101 -- Public OAuth token endpoint, not a credential.

type serviceAccountTokenURI struct {
	TokenURI string `json:"token_uri"`
}

func ValidateServiceAccountJSON(raw string) error {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil
	}

	var payload serviceAccountTokenURI
	if err := json.Unmarshal([]byte(value), &payload); err != nil {
		return fmt.Errorf("invalid gcp service account json: %w", err)
	}
	_, err := NormalizeTokenURI(payload.TokenURI)
	return err
}

func NormalizeTokenURI(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return DefaultTokenURI, nil
	}

	parsed, err := url.Parse(value)
	if err != nil || !parsed.IsAbs() || parsed.Host == "" {
		return "", errors.New("gcp service account token_uri must be https://oauth2.googleapis.com/token")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("gcp service account token_uri must be https://oauth2.googleapis.com/token")
	}
	if strings.ToLower(parsed.Scheme) != "https" {
		return "", errors.New("gcp service account token_uri must be https://oauth2.googleapis.com/token")
	}
	if strings.ToLower(parsed.Hostname()) != "oauth2.googleapis.com" || parsed.Port() != "" {
		return "", errors.New("gcp service account token_uri must be https://oauth2.googleapis.com/token")
	}
	if parsed.EscapedPath() != "/token" {
		return "", errors.New("gcp service account token_uri must be https://oauth2.googleapis.com/token")
	}
	return DefaultTokenURI, nil
}
