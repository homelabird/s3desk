package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"s3desk/internal/models"
)

type azureProfileConfig struct {
	AccountName    string `json:"accountName"`
	Endpoint       string `json:"endpoint,omitempty"`
	UseEmulator    bool   `json:"useEmulator,omitempty"`
	SubscriptionID string `json:"subscriptionId,omitempty"`
	ResourceGroup  string `json:"resourceGroup,omitempty"`
	TenantID       string `json:"tenantId,omitempty"`
	ClientID       string `json:"clientId,omitempty"`
}

type azureProfileSecrets struct {
	AccountKey   string `json:"accountKey"`
	ClientSecret string `json:"clientSecret,omitempty"`
}

type gcpProfileConfig struct {
	ProjectID     string `json:"projectId,omitempty"`
	ClientEmail   string `json:"clientEmail,omitempty"`
	Endpoint      string `json:"endpoint,omitempty"`
	Anonymous     bool   `json:"anonymous,omitempty"`
	ProjectNumber string `json:"projectNumber,omitempty"`
}

type gcpProfileSecrets struct {
	ServiceAccountJSON string `json:"serviceAccountJson"`
}

type ociObjectStorageProfileConfig struct {
	Namespace     string `json:"namespace"`
	Compartment   string `json:"compartment"`
	Region        string `json:"region"`
	Endpoint      string `json:"endpoint,omitempty"`
	AuthProvider  string `json:"authProvider,omitempty"`
	ConfigFile    string `json:"configFile,omitempty"`
	ConfigProfile string `json:"configProfile,omitempty"`
}

func normalizeOciAuthProvider(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "user_principal_auth"
	}
	return trimmed
}

// extractGcpServiceAccountInfo pulls common display fields from a service account JSON.
// It is best-effort: if parsing fails, it returns empty strings.
func extractGcpServiceAccountInfo(raw string) (projectID, clientEmail string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", ""
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return "", ""
	}
	if v, ok := m["project_id"].(string); ok {
		projectID = v
	}
	if v, ok := m["client_email"].(string); ok {
		clientEmail = v
	}
	return projectID, clientEmail
}

func unmarshalProfileJSON(profileID string, provider models.ProfileProvider, field, raw string, dest any) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	if err := json.Unmarshal([]byte(raw), dest); err != nil {
		return fmt.Errorf("profile %s (%s): invalid %s: %w", profileID, provider, field, err)
	}
	return nil
}

func (s *Store) profileFromRow(row profileRow) (models.Profile, error) {
	provider := normalizeProfileProvider(models.ProfileProvider(row.Provider))
	out := models.Profile{
		ID:                    row.ID,
		Name:                  row.Name,
		Provider:              provider,
		PreserveLeadingSlash:  row.PreserveLeadingSlash != 0,
		TLSInsecureSkipVerify: row.TLSInsecureSkipVerify != 0,
		CreatedAt:             row.CreatedAt,
		UpdatedAt:             row.UpdatedAt,
	}

	switch provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible:
		force := row.ForcePathStyle != 0
		out.ForcePathStyle = &force
		out.Endpoint = strings.TrimSpace(row.Endpoint)
		out.PublicEndpoint = strings.TrimSpace(row.PublicEndpoint)
		out.Region = strings.TrimSpace(row.Region)
	case models.ProfileProviderAzureBlob:
		var cfg azureProfileConfig
		if err := unmarshalProfileJSON(row.ID, provider, "config_json", row.ConfigJSON, &cfg); err != nil {
			return models.Profile{}, err
		}
		out.AccountName = strings.TrimSpace(cfg.AccountName)
		out.SubscriptionID = strings.TrimSpace(cfg.SubscriptionID)
		out.ResourceGroup = strings.TrimSpace(cfg.ResourceGroup)
		out.TenantID = strings.TrimSpace(cfg.TenantID)
		out.ClientID = strings.TrimSpace(cfg.ClientID)
		out.Endpoint = strings.TrimSpace(cfg.Endpoint)
		if cfg.UseEmulator {
			v := true
			out.UseEmulator = &v
		}
	case models.ProfileProviderGcpGcs:
		var cfg gcpProfileConfig
		if err := unmarshalProfileJSON(row.ID, provider, "config_json", row.ConfigJSON, &cfg); err != nil {
			return models.Profile{}, err
		}
		out.ProjectID = strings.TrimSpace(cfg.ProjectID)
		out.ClientEmail = strings.TrimSpace(cfg.ClientEmail)
		out.Endpoint = strings.TrimSpace(cfg.Endpoint)
		if cfg.Anonymous {
			v := true
			out.Anonymous = &v
		}
		out.ProjectNumber = strings.TrimSpace(cfg.ProjectNumber)
	case models.ProfileProviderOciObjectStorage:
		var cfg ociObjectStorageProfileConfig
		if err := unmarshalProfileJSON(row.ID, provider, "config_json", row.ConfigJSON, &cfg); err != nil {
			return models.Profile{}, err
		}
		out.Endpoint = strings.TrimSpace(cfg.Endpoint)
		out.Region = strings.TrimSpace(cfg.Region)
		out.Namespace = strings.TrimSpace(cfg.Namespace)
		out.Compartment = strings.TrimSpace(cfg.Compartment)
		out.AuthProvider = normalizeOciAuthProvider(cfg.AuthProvider)
		out.ConfigFile = strings.TrimSpace(cfg.ConfigFile)
		out.ConfigProfile = strings.TrimSpace(cfg.ConfigProfile)
	default:
	}

	return out, nil
}

func (s *Store) EnsureProfilesEncrypted(ctx context.Context) (updated int, err error) {
	if s.crypto == nil {
		return 0, nil
	}
	var profiles []profileRow
	if err := s.db.WithContext(ctx).
		Select("id", "provider", "access_key_id", "secret_access_key", "session_token", "secrets_json").
		Find(&profiles).Error; err != nil {
		return 0, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for _, profile := range profiles {
		encrypted, changed, err := s.encryptProfileSecrets(profile)
		if err != nil {
			return updated, err
		}
		if !changed {
			continue
		}
		if err := s.db.WithContext(ctx).Model(&profileRow{}).Where("id = ?", profile.ID).Updates(map[string]any{
			"updated_at": now, "access_key_id": encrypted.AccessKeyID,
			"secret_access_key": encrypted.SecretAccessKey, "session_token": encrypted.SessionToken,
			"secrets_json": encrypted.SecretsJSON,
		}).Error; err != nil {
			return updated, err
		}
		updated++
	}
	return updated, nil
}

// Prepare encrypted row values before they reach SQL, including during portable imports.
func (s *Store) encryptProfileSecrets(profile profileRow) (profileRow, bool, error) {
	if s.crypto == nil {
		return profile, false, nil
	}
	changed := false
	encrypt := func(value string) (string, error) {
		if value == "" || strings.HasPrefix(value, encryptedPrefix) {
			return value, nil
		}
		encrypted, err := s.crypto.encryptString(value)
		if err == nil {
			changed = true
		}
		return encrypted, err
	}
	provider := normalizeProfileProvider(models.ProfileProvider(profile.Provider))
	if isS3LikeProvider(provider) {
		var err error
		profile.AccessKeyID, err = encrypt(profile.AccessKeyID)
		if err != nil {
			return profileRow{}, false, err
		}
		profile.SecretAccessKey, err = encrypt(profile.SecretAccessKey)
		if err != nil {
			return profileRow{}, false, err
		}
		if profile.SessionToken != nil {
			session, err := encrypt(*profile.SessionToken)
			if err != nil {
				return profileRow{}, false, err
			}
			profile.SessionToken = &session
		}
	} else {
		var secrets map[string]any
		if err := unmarshalProfileJSON(profile.ID, provider, "secrets_json", profile.SecretsJSON, &secrets); err != nil {
			return profileRow{}, false, err
		}
		var keys []string
		switch provider {
		case models.ProfileProviderAzureBlob:
			keys = []string{"accountKey", "clientSecret"}
		case models.ProfileProviderGcpGcs:
			keys = []string{"serviceAccountJson"}
		}
		for _, key := range keys {
			if value, ok := secrets[key].(string); ok {
				encrypted, err := encrypt(value)
				if err != nil {
					return profileRow{}, false, err
				}
				secrets[key] = encrypted
			}
		}
		if changed {
			raw, err := json.Marshal(secrets)
			if err != nil {
				return profileRow{}, false, err
			}
			profile.SecretsJSON = string(raw)
		}
	}
	return profile, changed, nil
}
