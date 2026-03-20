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
	for _, p := range profiles {
		provider := normalizeProfileProvider(models.ProfileProvider(p.Provider))

		updates := map[string]any{"updated_at": now}
		needsUpdate := false

		if isS3LikeProvider(provider) {
			ak := p.AccessKeyID
			sk := p.SecretAccessKey
			session := p.SessionToken

			if ak != "" && !strings.HasPrefix(ak, encryptedPrefix) {
				enc, err := s.crypto.encryptString(ak)
				if err != nil {
					return updated, err
				}
				ak = enc
				needsUpdate = true
			}
			if sk != "" && !strings.HasPrefix(sk, encryptedPrefix) {
				enc, err := s.crypto.encryptString(sk)
				if err != nil {
					return updated, err
				}
				sk = enc
				needsUpdate = true
			}
			if session != nil && *session != "" && !strings.HasPrefix(*session, encryptedPrefix) {
				enc, err := s.crypto.encryptString(*session)
				if err != nil {
					return updated, err
				}
				*session = enc
				needsUpdate = true
			}

			if needsUpdate {
				updates["access_key_id"] = ak
				updates["secret_access_key"] = sk
				updates["session_token"] = session
			}
		} else {
			raw := strings.TrimSpace(p.SecretsJSON)
			if raw == "" {
				raw = "{}"
			}
			var sec map[string]any
			if err := unmarshalProfileJSON(p.ID, provider, "secrets_json", raw, &sec); err != nil {
				return updated, err
			}

			var key string
			switch provider {
			case models.ProfileProviderAzureBlob:
				key = "accountKey"
			case models.ProfileProviderGcpGcs:
				key = "serviceAccountJson"
			default:
				key = ""
			}
			if key != "" {
				if v, ok := sec[key].(string); ok && v != "" && !strings.HasPrefix(v, encryptedPrefix) {
					enc, err := s.crypto.encryptString(v)
					if err != nil {
						return updated, err
					}
					sec[key] = enc
					needsUpdate = true
				}
			}

			if needsUpdate {
				buf, err := json.Marshal(sec)
				if err != nil {
					return updated, err
				}
				updates["secrets_json"] = string(buf)
			}
		}

		if !needsUpdate {
			continue
		}
		if err := s.db.WithContext(ctx).
			Model(&profileRow{}).
			Where("id = ?", p.ID).
			Updates(updates).Error; err != nil {
			return updated, err
		}
		updated++
	}

	return updated, nil
}
