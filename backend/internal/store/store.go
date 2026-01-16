package store

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"s3desk/internal/models"
)

type Store struct {
	db     *gorm.DB
	crypto *profileCrypto
}

type Options struct {
	EncryptionKey string
}

func New(sqlDB *gorm.DB, opts Options) (*Store, error) {
	pc, err := newProfileCrypto(opts.EncryptionKey)
	if err != nil {
		return nil, err
	}
	return &Store{db: sqlDB, crypto: pc}, nil
}

func (s *Store) Ping(ctx context.Context) error {
	sqlDB, err := s.db.DB()
	if err != nil {
		return err
	}
	return sqlDB.PingContext(ctx)
}

func normalizeProfileProvider(p models.ProfileProvider) models.ProfileProvider {
	value := strings.TrimSpace(string(p))
	if value == "" {
		return models.ProfileProviderS3Compatible
	}
	switch models.ProfileProvider(value) {
	case models.ProfileProviderAwsS3,
		models.ProfileProviderS3Compatible,
		models.ProfileProviderOciS3Compat,
		models.ProfileProviderAzureBlob,
		models.ProfileProviderGcpGcs,
		models.ProfileProviderOciObjectStorage:
		return models.ProfileProvider(value)
	default:
		return models.ProfileProvider(value)
	}
}

func isS3LikeProvider(p models.ProfileProvider) bool {
	switch p {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible, models.ProfileProviderOciS3Compat:
		return true
	default:
		return false
	}
}

type azureProfileConfig struct {
	AccountName string `json:"accountName"`
	Endpoint    string `json:"endpoint,omitempty"`
	UseEmulator bool   `json:"useEmulator,omitempty"`
}

type azureProfileSecrets struct {
	AccountKey string `json:"accountKey"`
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
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible, models.ProfileProviderOciS3Compat:
		// For S3-style providers, these fields are always present in the response.
		force := row.ForcePathStyle != 0
		out.ForcePathStyle = &force
		out.Endpoint = strings.TrimSpace(row.Endpoint)
		out.Region = strings.TrimSpace(row.Region)
	case models.ProfileProviderAzureBlob:
		var cfg azureProfileConfig
		if strings.TrimSpace(row.ConfigJSON) != "" {
			_ = json.Unmarshal([]byte(row.ConfigJSON), &cfg)
		}
		out.AccountName = strings.TrimSpace(cfg.AccountName)
		out.Endpoint = strings.TrimSpace(cfg.Endpoint)
		if cfg.UseEmulator {
			v := true
			out.UseEmulator = &v
		}
	case models.ProfileProviderGcpGcs:
		var cfg gcpProfileConfig
		if strings.TrimSpace(row.ConfigJSON) != "" {
			_ = json.Unmarshal([]byte(row.ConfigJSON), &cfg)
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
		if strings.TrimSpace(row.ConfigJSON) != "" {
			_ = json.Unmarshal([]byte(row.ConfigJSON), &cfg)
		}
		out.Endpoint = strings.TrimSpace(cfg.Endpoint)
		out.Region = strings.TrimSpace(cfg.Region)
		out.Namespace = strings.TrimSpace(cfg.Namespace)
		out.Compartment = strings.TrimSpace(cfg.Compartment)
		out.AuthProvider = strings.TrimSpace(cfg.AuthProvider)
		out.ConfigFile = strings.TrimSpace(cfg.ConfigFile)
		out.ConfigProfile = strings.TrimSpace(cfg.ConfigProfile)
	default:
		// Unknown providers are stored, but we won't crash the API.
	}

	return out, nil
}

func (s *Store) CreateProfile(ctx context.Context, req models.ProfileCreateRequest) (models.Profile, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	id := ulid.Make().String()

	provider := normalizeProfileProvider(req.Provider)
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return models.Profile{}, errors.New("name is required")
	}

	row := profileRow{
		ID:                    id,
		Name:                  name,
		Provider:              string(provider),
		ConfigJSON:            "{}",
		SecretsJSON:           "{}",
		Endpoint:              "",
		Region:                "",
		ForcePathStyle:        0,
		PreserveLeadingSlash:  boolToInt(req.PreserveLeadingSlash),
		TLSInsecureSkipVerify: boolToInt(req.TLSInsecureSkipVerify),
		AccessKeyID:           "",
		SecretAccessKey:       "",
		SessionToken:          nil,
		CreatedAt:             now,
		UpdatedAt:             now,
	}

	switch provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible, models.ProfileProviderOciS3Compat:
		endpoint := ""
		if req.Endpoint != nil {
			endpoint = strings.TrimSpace(*req.Endpoint)
		}
		region := ""
		if req.Region != nil {
			region = strings.TrimSpace(*req.Region)
		}
		ak := ""
		if req.AccessKeyID != nil {
			ak = strings.TrimSpace(*req.AccessKeyID)
		}
		sk := ""
		if req.SecretAccessKey != nil {
			sk = strings.TrimSpace(*req.SecretAccessKey)
		}
		force := false
		if req.ForcePathStyle != nil {
			force = *req.ForcePathStyle
		}
		var sessionToken *string
		if req.SessionToken != nil {
			v := strings.TrimSpace(*req.SessionToken)
			if v != "" {
				sessionToken = &v
			}
		}

		if region == "" || ak == "" || sk == "" {
			return models.Profile{}, errors.New("missing required s3 fields")
		}
		if provider != models.ProfileProviderAwsS3 && endpoint == "" {
			return models.Profile{}, errors.New("endpoint is required for this provider")
		}

		if s.crypto != nil {
			var err error
			ak, err = s.crypto.encryptString(ak)
			if err != nil {
				return models.Profile{}, err
			}
			sk, err = s.crypto.encryptString(sk)
			if err != nil {
				return models.Profile{}, err
			}
			if sessionToken != nil {
				enc, err := s.crypto.encryptString(*sessionToken)
				if err != nil {
					return models.Profile{}, err
				}
				*sessionToken = enc
			}
		}

		row.Endpoint = endpoint
		row.Region = region
		row.ForcePathStyle = boolToInt(force)
		row.AccessKeyID = ak
		row.SecretAccessKey = sk
		row.SessionToken = sessionToken

	case models.ProfileProviderAzureBlob:
		if req.Region != nil || req.AccessKeyID != nil || req.SecretAccessKey != nil || req.SessionToken != nil || req.ForcePathStyle != nil || req.ServiceAccountJSON != nil || req.Anonymous != nil || req.ProjectNumber != nil || req.Namespace != nil || req.Compartment != nil || req.AuthProvider != nil || req.ConfigFile != nil || req.ConfigProfile != nil {
			return models.Profile{}, errors.New("invalid fields for azure_blob")
		}
		accountName := ""
		if req.AccountName != nil {
			accountName = strings.TrimSpace(*req.AccountName)
		}
		accountKey := ""
		if req.AccountKey != nil {
			accountKey = strings.TrimSpace(*req.AccountKey)
		}
		endpoint := ""
		if req.Endpoint != nil {
			endpoint = strings.TrimSpace(*req.Endpoint)
		}
		useEmulator := false
		if req.UseEmulator != nil {
			useEmulator = *req.UseEmulator
		}
		if accountName == "" || accountKey == "" {
			return models.Profile{}, errors.New("missing required azure fields")
		}

		cfg, _ := json.Marshal(azureProfileConfig{AccountName: accountName, Endpoint: endpoint, UseEmulator: useEmulator})
		secretVal := accountKey
		if s.crypto != nil {
			enc, err := s.crypto.encryptString(secretVal)
			if err != nil {
				return models.Profile{}, err
			}
			secretVal = enc
		}
		sec, _ := json.Marshal(azureProfileSecrets{AccountKey: secretVal})
		row.ConfigJSON = string(cfg)
		row.SecretsJSON = string(sec)

	case models.ProfileProviderGcpGcs:
		if req.Region != nil || req.AccessKeyID != nil || req.SecretAccessKey != nil || req.SessionToken != nil || req.ForcePathStyle != nil || req.AccountName != nil || req.AccountKey != nil || req.UseEmulator != nil || req.Namespace != nil || req.Compartment != nil || req.AuthProvider != nil || req.ConfigFile != nil || req.ConfigProfile != nil {
			return models.Profile{}, errors.New("invalid fields for gcp_gcs")
		}
		endpoint := ""
		if req.Endpoint != nil {
			endpoint = strings.TrimSpace(*req.Endpoint)
		}
		anonymous := false
		if req.Anonymous != nil {
			anonymous = *req.Anonymous
		}
		projectNumber := ""
		if req.ProjectNumber != nil {
			projectNumber = strings.TrimSpace(*req.ProjectNumber)
		}
		sa := ""
		if req.ServiceAccountJSON != nil {
			sa = strings.TrimSpace(*req.ServiceAccountJSON)
		}
		if !anonymous && sa == "" {
			return models.Profile{}, errors.New("serviceAccountJson is required unless anonymous=true")
		}

		projectID, clientEmail := extractGcpServiceAccountInfo(sa)
		cfg, _ := json.Marshal(gcpProfileConfig{ProjectID: projectID, ClientEmail: clientEmail, Endpoint: endpoint, Anonymous: anonymous, ProjectNumber: projectNumber})
		row.ConfigJSON = string(cfg)

		if sa == "" {
			row.SecretsJSON = "{}"
			break
		}
		secretVal := sa
		if s.crypto != nil {
			enc, err := s.crypto.encryptString(secretVal)
			if err != nil {
				return models.Profile{}, err
			}
			secretVal = enc
		}
		sec, _ := json.Marshal(gcpProfileSecrets{ServiceAccountJSON: secretVal})
		row.SecretsJSON = string(sec)

	case models.ProfileProviderOciObjectStorage:
		if req.AccessKeyID != nil || req.SecretAccessKey != nil || req.SessionToken != nil || req.ForcePathStyle != nil || req.AccountName != nil || req.AccountKey != nil || req.UseEmulator != nil || req.ServiceAccountJSON != nil || req.Anonymous != nil || req.ProjectNumber != nil {
			return models.Profile{}, errors.New("invalid fields for oci_object_storage")
		}
		region := ""
		if req.Region != nil {
			region = strings.TrimSpace(*req.Region)
		}
		namespace := ""
		if req.Namespace != nil {
			namespace = strings.TrimSpace(*req.Namespace)
		}
		compartment := ""
		if req.Compartment != nil {
			compartment = strings.TrimSpace(*req.Compartment)
		}
		endpoint := ""
		if req.Endpoint != nil {
			endpoint = strings.TrimSpace(*req.Endpoint)
		}
		authProvider := ""
		if req.AuthProvider != nil {
			authProvider = strings.TrimSpace(*req.AuthProvider)
		}
		configFile := ""
		if req.ConfigFile != nil {
			configFile = strings.TrimSpace(*req.ConfigFile)
		}
		configProfile := ""
		if req.ConfigProfile != nil {
			configProfile = strings.TrimSpace(*req.ConfigProfile)
		}
		if region == "" || namespace == "" || compartment == "" {
			return models.Profile{}, errors.New("region, namespace, and compartment are required")
		}

		cfg, _ := json.Marshal(ociObjectStorageProfileConfig{
			Namespace:     namespace,
			Compartment:   compartment,
			Region:        region,
			Endpoint:      endpoint,
			AuthProvider:  authProvider,
			ConfigFile:    configFile,
			ConfigProfile: configProfile,
		})
		row.ConfigJSON = string(cfg)
		row.SecretsJSON = "{}"
	default:
		return models.Profile{}, errors.New("unsupported provider")
	}

	if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
		return models.Profile{}, err
	}

	return s.profileFromRow(row)
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
			if err := json.Unmarshal([]byte(raw), &sec); err != nil {
				// If secrets_json is corrupted, skip encryption for this row.
				continue
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

func (s *Store) ListProfiles(ctx context.Context) ([]models.Profile, error) {
	var rows []profileRow
	if err := s.db.WithContext(ctx).
		Select("id", "name", "provider", "config_json", "endpoint", "region", "force_path_style", "preserve_leading_slash", "tls_insecure_skip_verify", "created_at", "updated_at").
		Order("created_at DESC").
		Find(&rows).Error; err != nil {
		return nil, err
	}

	out := make([]models.Profile, 0, len(rows))
	for _, row := range rows {
		p, err := s.profileFromRow(row)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, nil
}

func (s *Store) GetProfile(ctx context.Context, profileID string) (models.Profile, bool, error) {
	var row profileRow
	if err := s.db.WithContext(ctx).
		Select("id", "name", "provider", "config_json", "endpoint", "region", "force_path_style", "preserve_leading_slash", "tls_insecure_skip_verify", "created_at", "updated_at").
		Where("id = ?", profileID).
		Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.Profile{}, false, nil
		}
		return models.Profile{}, false, err
	}
	p, err := s.profileFromRow(row)
	if err != nil {
		return models.Profile{}, false, err
	}
	return p, true, nil
}

func (s *Store) GetProfileSecrets(ctx context.Context, profileID string) (models.ProfileSecrets, bool, error) {
	var row profileRow
	if err := s.db.WithContext(ctx).
		Select("id", "name", "provider", "config_json", "secrets_json", "endpoint", "region", "force_path_style", "preserve_leading_slash", "tls_insecure_skip_verify", "access_key_id", "secret_access_key", "session_token").
		Where("id = ?", profileID).
		Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.ProfileSecrets{}, false, nil
		}
		return models.ProfileSecrets{}, false, err
	}

	provider := normalizeProfileProvider(models.ProfileProvider(row.Provider))
	profile := models.ProfileSecrets{
		ID:                    row.ID,
		Name:                  row.Name,
		Provider:              provider,
		PreserveLeadingSlash:  row.PreserveLeadingSlash != 0,
		TLSInsecureSkipVerify: row.TLSInsecureSkipVerify != 0,
	}

	switch provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible, models.ProfileProviderOciS3Compat:
		profile.Endpoint = strings.TrimSpace(row.Endpoint)
		profile.Region = strings.TrimSpace(row.Region)
		profile.ForcePathStyle = row.ForcePathStyle != 0
		profile.AccessKeyID = row.AccessKeyID
		profile.SecretAccessKey = row.SecretAccessKey
		profile.SessionToken = row.SessionToken

		if strings.HasPrefix(profile.AccessKeyID, encryptedPrefix) ||
			strings.HasPrefix(profile.SecretAccessKey, encryptedPrefix) ||
			(row.SessionToken != nil && strings.HasPrefix(*row.SessionToken, encryptedPrefix)) {
			if s.crypto == nil {
				return models.ProfileSecrets{}, false, ErrEncryptedCredentials
			}
			var err error
			profile.AccessKeyID, err = s.crypto.decryptString(profile.AccessKeyID)
			if err != nil {
				return models.ProfileSecrets{}, false, err
			}
			profile.SecretAccessKey, err = s.crypto.decryptString(profile.SecretAccessKey)
			if err != nil {
				return models.ProfileSecrets{}, false, err
			}
			if row.SessionToken != nil {
				dec, err := s.crypto.decryptString(*row.SessionToken)
				if err != nil {
					return models.ProfileSecrets{}, false, err
				}
				row.SessionToken = &dec
			}
		}
		if row.SessionToken != nil {
			profile.SessionToken = row.SessionToken
		}

	case models.ProfileProviderAzureBlob:
		var cfg azureProfileConfig
		if strings.TrimSpace(row.ConfigJSON) != "" {
			_ = json.Unmarshal([]byte(row.ConfigJSON), &cfg)
		}
		profile.AzureAccountName = strings.TrimSpace(cfg.AccountName)
		profile.AzureEndpoint = strings.TrimSpace(cfg.Endpoint)
		profile.AzureUseEmulator = cfg.UseEmulator
		var sec azureProfileSecrets
		if strings.TrimSpace(row.SecretsJSON) != "" {
			_ = json.Unmarshal([]byte(row.SecretsJSON), &sec)
		}
		key := strings.TrimSpace(sec.AccountKey)
		if strings.HasPrefix(key, encryptedPrefix) {
			if s.crypto == nil {
				return models.ProfileSecrets{}, false, ErrEncryptedCredentials
			}
			dec, err := s.crypto.decryptString(key)
			if err != nil {
				return models.ProfileSecrets{}, false, err
			}
			key = dec
		}
		profile.AzureAccountKey = key

	case models.ProfileProviderGcpGcs:
		var cfg gcpProfileConfig
		if strings.TrimSpace(row.ConfigJSON) != "" {
			_ = json.Unmarshal([]byte(row.ConfigJSON), &cfg)
		}
		profile.GcpEndpoint = strings.TrimSpace(cfg.Endpoint)
		profile.GcpAnonymous = cfg.Anonymous
		profile.GcpProjectNumber = strings.TrimSpace(cfg.ProjectNumber)

		var sec gcpProfileSecrets
		if strings.TrimSpace(row.SecretsJSON) != "" {
			_ = json.Unmarshal([]byte(row.SecretsJSON), &sec)
		}
		sa := strings.TrimSpace(sec.ServiceAccountJSON)
		if strings.HasPrefix(sa, encryptedPrefix) {
			if s.crypto == nil {
				return models.ProfileSecrets{}, false, ErrEncryptedCredentials
			}
			dec, err := s.crypto.decryptString(sa)
			if err != nil {
				return models.ProfileSecrets{}, false, err
			}
			sa = dec
		}
		profile.GcpServiceAccountJSON = sa

	case models.ProfileProviderOciObjectStorage:
		var cfg ociObjectStorageProfileConfig
		if strings.TrimSpace(row.ConfigJSON) != "" {
			_ = json.Unmarshal([]byte(row.ConfigJSON), &cfg)
		}
		profile.OciNamespace = strings.TrimSpace(cfg.Namespace)
		profile.OciCompartment = strings.TrimSpace(cfg.Compartment)
		profile.Region = strings.TrimSpace(cfg.Region)
		profile.OciEndpoint = strings.TrimSpace(cfg.Endpoint)
		profile.OciAuthProvider = strings.TrimSpace(cfg.AuthProvider)
		profile.OciConfigFile = strings.TrimSpace(cfg.ConfigFile)
		profile.OciConfigProfile = strings.TrimSpace(cfg.ConfigProfile)
	default:
		return models.ProfileSecrets{}, false, errors.New("unsupported provider")
	}

	tlsCfg, updatedAt, found, err := s.GetProfileTLSConfig(ctx, profileID)
	if err != nil {
		return models.ProfileSecrets{}, false, err
	}
	if found {
		profile.TLSConfig = &tlsCfg
		profile.TLSConfigUpdatedAt = updatedAt
	}
	return profile, true, nil
}

func (s *Store) UpdateProfile(ctx context.Context, profileID string, req models.ProfileUpdateRequest) (models.Profile, bool, error) {
	currentSecrets, ok, err := s.GetProfileSecrets(ctx, profileID)
	if err != nil || !ok {
		return models.Profile{}, ok, err
	}

	provider := currentSecrets.Provider
	if strings.TrimSpace(string(req.Provider)) != "" && normalizeProfileProvider(req.Provider) != provider {
		return models.Profile{}, true, errors.New("provider mismatch")
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	updates := map[string]any{"updated_at": now}

	if req.Name != nil {
		v := strings.TrimSpace(*req.Name)
		if v == "" {
			return models.Profile{}, true, errors.New("name must not be empty")
		}
		updates["name"] = v
	}
	if req.PreserveLeadingSlash != nil {
		updates["preserve_leading_slash"] = boolToInt(*req.PreserveLeadingSlash)
	}
	if req.TLSInsecureSkipVerify != nil {
		updates["tls_insecure_skip_verify"] = boolToInt(*req.TLSInsecureSkipVerify)
	}

	switch provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible, models.ProfileProviderOciS3Compat:
		endpoint := currentSecrets.Endpoint
		region := currentSecrets.Region
		ak := currentSecrets.AccessKeyID
		sk := currentSecrets.SecretAccessKey
		sessionToken := currentSecrets.SessionToken
		forcePathStyle := currentSecrets.ForcePathStyle

		if req.Endpoint != nil {
			endpoint = strings.TrimSpace(*req.Endpoint)
			// Allow clearing endpoint for aws_s3 (falls back to rclone/AWS default resolution).
			if provider != models.ProfileProviderAwsS3 && endpoint == "" {
				return models.Profile{}, true, errors.New("endpoint must not be empty")
			}
			updates["endpoint"] = endpoint
		}
		if req.Region != nil {
			region = strings.TrimSpace(*req.Region)
			if region == "" {
				return models.Profile{}, true, errors.New("region must not be empty")
			}
			updates["region"] = region
		}
		if req.AccessKeyID != nil {
			ak = strings.TrimSpace(*req.AccessKeyID)
			if ak == "" {
				return models.Profile{}, true, errors.New("accessKeyId must not be empty")
			}
		}
		if req.SecretAccessKey != nil {
			sk = strings.TrimSpace(*req.SecretAccessKey)
			if sk == "" {
				return models.Profile{}, true, errors.New("secretAccessKey must not be empty")
			}
		}
		if req.SessionToken != nil {
			v := strings.TrimSpace(*req.SessionToken)
			if v == "" {
				sessionToken = nil
			} else {
				sessionToken = &v
			}
		}
		if req.ForcePathStyle != nil {
			forcePathStyle = *req.ForcePathStyle
			updates["force_path_style"] = boolToInt(forcePathStyle)
		}

		if ak == "" || sk == "" {
			return models.Profile{}, true, errors.New("credentials must not be empty")
		}

		if s.crypto != nil {
			var err error
			ak, err = s.crypto.encryptString(ak)
			if err != nil {
				return models.Profile{}, true, err
			}
			sk, err = s.crypto.encryptString(sk)
			if err != nil {
				return models.Profile{}, true, err
			}
			if sessionToken != nil {
				enc, err := s.crypto.encryptString(*sessionToken)
				if err != nil {
					return models.Profile{}, true, err
				}
				*sessionToken = enc
			}
		}

		updates["endpoint"] = endpoint
		updates["region"] = region
		updates["force_path_style"] = boolToInt(forcePathStyle)
		updates["access_key_id"] = ak
		updates["secret_access_key"] = sk
		updates["session_token"] = sessionToken

	case models.ProfileProviderAzureBlob:
		if req.Region != nil || req.AccessKeyID != nil || req.SecretAccessKey != nil || req.SessionToken != nil || req.ForcePathStyle != nil || req.ServiceAccountJSON != nil || req.Anonymous != nil || req.ProjectNumber != nil || req.Namespace != nil || req.Compartment != nil || req.AuthProvider != nil || req.ConfigFile != nil || req.ConfigProfile != nil {
			return models.Profile{}, true, errors.New("invalid fields for azure_blob")
		}
		accountName := strings.TrimSpace(currentSecrets.AzureAccountName)
		accountKey := strings.TrimSpace(currentSecrets.AzureAccountKey)
		endpoint := strings.TrimSpace(currentSecrets.AzureEndpoint)
		useEmulator := currentSecrets.AzureUseEmulator
		if req.AccountName != nil {
			accountName = strings.TrimSpace(*req.AccountName)
			if accountName == "" {
				return models.Profile{}, true, errors.New("accountName must not be empty")
			}
		}
		if req.AccountKey != nil {
			accountKey = strings.TrimSpace(*req.AccountKey)
			if accountKey == "" {
				return models.Profile{}, true, errors.New("accountKey must not be empty")
			}
		}
		if req.Endpoint != nil {
			endpoint = strings.TrimSpace(*req.Endpoint)
		}
		if req.UseEmulator != nil {
			useEmulator = *req.UseEmulator
		}
		cfg, _ := json.Marshal(azureProfileConfig{AccountName: accountName, Endpoint: endpoint, UseEmulator: useEmulator})
		secretVal := accountKey
		if s.crypto != nil {
			enc, err := s.crypto.encryptString(secretVal)
			if err != nil {
				return models.Profile{}, true, err
			}
			secretVal = enc
		}
		sec, _ := json.Marshal(azureProfileSecrets{AccountKey: secretVal})
		updates["config_json"] = string(cfg)
		updates["secrets_json"] = string(sec)

	case models.ProfileProviderGcpGcs:
		if req.Region != nil || req.AccessKeyID != nil || req.SecretAccessKey != nil || req.SessionToken != nil || req.ForcePathStyle != nil || req.AccountName != nil || req.AccountKey != nil || req.UseEmulator != nil || req.Namespace != nil || req.Compartment != nil || req.AuthProvider != nil || req.ConfigFile != nil || req.ConfigProfile != nil {
			return models.Profile{}, true, errors.New("invalid fields for gcp_gcs")
		}
		endpoint := strings.TrimSpace(currentSecrets.GcpEndpoint)
		anonymous := currentSecrets.GcpAnonymous
		projectNumber := strings.TrimSpace(currentSecrets.GcpProjectNumber)
		sa := strings.TrimSpace(currentSecrets.GcpServiceAccountJSON)
		if req.Endpoint != nil {
			endpoint = strings.TrimSpace(*req.Endpoint)
		}
		if req.Anonymous != nil {
			anonymous = *req.Anonymous
		}
		if req.ProjectNumber != nil {
			projectNumber = strings.TrimSpace(*req.ProjectNumber)
		}
		if req.ServiceAccountJSON != nil {
			sa = strings.TrimSpace(*req.ServiceAccountJSON)
		}
		if !anonymous && sa == "" {
			return models.Profile{}, true, errors.New("serviceAccountJson is required unless anonymous=true")
		}

		projectID, clientEmail := extractGcpServiceAccountInfo(sa)
		cfg, _ := json.Marshal(gcpProfileConfig{ProjectID: projectID, ClientEmail: clientEmail, Endpoint: endpoint, Anonymous: anonymous, ProjectNumber: projectNumber})
		updates["config_json"] = string(cfg)

		if sa == "" {
			updates["secrets_json"] = "{}"
			break
		}

		secretVal := sa
		if s.crypto != nil {
			enc, err := s.crypto.encryptString(secretVal)
			if err != nil {
				return models.Profile{}, true, err
			}
			secretVal = enc
		}
		sec, _ := json.Marshal(gcpProfileSecrets{ServiceAccountJSON: secretVal})
		updates["secrets_json"] = string(sec)

	case models.ProfileProviderOciObjectStorage:
		if req.AccessKeyID != nil || req.SecretAccessKey != nil || req.SessionToken != nil || req.ForcePathStyle != nil || req.AccountName != nil || req.AccountKey != nil || req.UseEmulator != nil || req.ServiceAccountJSON != nil || req.Anonymous != nil || req.ProjectNumber != nil {
			return models.Profile{}, true, errors.New("invalid fields for oci_object_storage")
		}
		region := strings.TrimSpace(currentSecrets.Region)
		namespace := strings.TrimSpace(currentSecrets.OciNamespace)
		compartment := strings.TrimSpace(currentSecrets.OciCompartment)
		endpoint := strings.TrimSpace(currentSecrets.OciEndpoint)
		authProvider := strings.TrimSpace(currentSecrets.OciAuthProvider)
		configFile := strings.TrimSpace(currentSecrets.OciConfigFile)
		configProfile := strings.TrimSpace(currentSecrets.OciConfigProfile)

		if req.Region != nil {
			region = strings.TrimSpace(*req.Region)
		}
		if req.Namespace != nil {
			namespace = strings.TrimSpace(*req.Namespace)
		}
		if req.Compartment != nil {
			compartment = strings.TrimSpace(*req.Compartment)
		}
		if req.Endpoint != nil {
			endpoint = strings.TrimSpace(*req.Endpoint)
		}
		if req.AuthProvider != nil {
			authProvider = strings.TrimSpace(*req.AuthProvider)
		}
		if req.ConfigFile != nil {
			configFile = strings.TrimSpace(*req.ConfigFile)
		}
		if req.ConfigProfile != nil {
			configProfile = strings.TrimSpace(*req.ConfigProfile)
		}
		if region == "" || namespace == "" || compartment == "" {
			return models.Profile{}, true, errors.New("region, namespace, and compartment are required")
		}

		cfg, _ := json.Marshal(ociObjectStorageProfileConfig{
			Namespace:     namespace,
			Compartment:   compartment,
			Region:        region,
			Endpoint:      endpoint,
			AuthProvider:  authProvider,
			ConfigFile:    configFile,
			ConfigProfile: configProfile,
		})
		updates["config_json"] = string(cfg)
		updates["secrets_json"] = "{}"
	default:
		return models.Profile{}, true, errors.New("unsupported provider")
	}

	if err := s.db.WithContext(ctx).
		Model(&profileRow{}).
		Where("id = ?", profileID).
		Updates(updates).Error; err != nil {
		return models.Profile{}, true, err
	}

	profile, ok, err := s.GetProfile(ctx, profileID)
	if err != nil || !ok {
		return models.Profile{}, ok, err
	}
	return profile, true, nil
}

func (s *Store) DeleteProfile(ctx context.Context, profileID string) (bool, error) {
	res := s.db.WithContext(ctx).
		Where("id = ?", profileID).
		Delete(&profileRow{})
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

type CreateJobInput struct {
	Type    string
	Payload map[string]any
}

func (s *Store) CreateJob(ctx context.Context, profileID string, in CreateJobInput) (models.Job, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	id := ulid.Make().String()

	payloadJSON, err := json.Marshal(in.Payload)
	if err != nil {
		return models.Job{}, err
	}

	row := jobRow{
		ID:          id,
		ProfileID:   profileID,
		Type:        in.Type,
		Status:      string(models.JobStatusQueued),
		PayloadJSON: string(payloadJSON),
		CreatedAt:   now,
	}
	if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
		return models.Job{}, err
	}

	return models.Job{
		ID:        id,
		Type:      in.Type,
		Status:    models.JobStatusQueued,
		Payload:   in.Payload,
		CreatedAt: now,
	}, nil
}

type JobFilter struct {
	Status    *models.JobStatus
	Type      *string
	ErrorCode *string
	Limit     int
	Cursor    *string
}

func (s *Store) ListJobs(ctx context.Context, profileID string, f JobFilter) (models.JobsListResponse, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	query := s.db.WithContext(ctx).
		Model(&jobRow{}).
		Where("profile_id = ?", profileID)
	if f.Status != nil {
		query = query.Where("status = ?", string(*f.Status))
	}
	if f.Type != nil && *f.Type != "" {
		query = query.Where("type = ?", *f.Type)
	}
	if f.ErrorCode != nil {
		code := strings.TrimSpace(*f.ErrorCode)
		if code != "" {
			query = query.Where("error_code = ?", code)
		}
	}
	if f.Cursor != nil && *f.Cursor != "" {
		query = query.Where("id < ?", *f.Cursor)
	}

	resp := models.JobsListResponse{
		Items: make([]models.Job, 0),
	}
	var (
		jobIDs   []string
		jobCount int
	)
	var rows []jobRow
	if err := query.
		Order("id DESC").
		Limit(limit + 1).
		Find(&rows).Error; err != nil {
		return models.JobsListResponse{}, err
	}

	for _, row := range rows {
		job := models.Job{
			ID:        row.ID,
			Type:      row.Type,
			Status:    models.JobStatus(row.Status),
			Payload:   make(map[string]any),
			CreatedAt: row.CreatedAt,
		}
		if err := json.Unmarshal([]byte(row.PayloadJSON), &job.Payload); err != nil {
			return models.JobsListResponse{}, err
		}
		if row.ProgressJSON != nil && *row.ProgressJSON != "" {
			var jp models.JobProgress
			if err := json.Unmarshal([]byte(*row.ProgressJSON), &jp); err != nil {
				return models.JobsListResponse{}, err
			}
			job.Progress = &jp
		}
		if row.Error != nil {
			job.Error = row.Error
		}
		if row.ErrorCode != nil {
			job.ErrorCode = row.ErrorCode
		}
		if row.StartedAt != nil {
			job.StartedAt = row.StartedAt
		}
		if row.FinishedAt != nil {
			job.FinishedAt = row.FinishedAt
		}

		jobCount++
		if jobCount <= limit {
			resp.Items = append(resp.Items, job)
			jobIDs = append(jobIDs, job.ID)
		}
	}

	if len(jobIDs) == limit && jobCount > limit {
		last := jobIDs[len(jobIDs)-1]
		resp.NextCursor = &last
	}
	return resp, nil
}

func (s *Store) GetJob(ctx context.Context, profileID, jobID string) (models.Job, bool, error) {
	var row jobRow
	if err := s.db.WithContext(ctx).
		Where("profile_id = ? AND id = ?", profileID, jobID).
		Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.Job{}, false, nil
		}
		return models.Job{}, false, err
	}

	job := models.Job{
		ID:        row.ID,
		Type:      row.Type,
		Status:    models.JobStatus(row.Status),
		Payload:   make(map[string]any),
		CreatedAt: row.CreatedAt,
	}
	if err := json.Unmarshal([]byte(row.PayloadJSON), &job.Payload); err != nil {
		return models.Job{}, false, err
	}
	if row.ProgressJSON != nil && *row.ProgressJSON != "" {
		var jp models.JobProgress
		if err := json.Unmarshal([]byte(*row.ProgressJSON), &jp); err != nil {
			return models.Job{}, false, err
		}
		job.Progress = &jp
	}
	if row.Error != nil {
		job.Error = row.Error
	}
	if row.ErrorCode != nil {
		job.ErrorCode = row.ErrorCode
	}
	if row.StartedAt != nil {
		job.StartedAt = row.StartedAt
	}
	if row.FinishedAt != nil {
		job.FinishedAt = row.FinishedAt
	}

	return job, true, nil
}

func (s *Store) DeleteJob(ctx context.Context, profileID, jobID string) (bool, error) {
	res := s.db.WithContext(ctx).
		Where("profile_id = ? AND id = ?", profileID, jobID).
		Delete(&jobRow{})
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

func (s *Store) DeleteFinishedJobsBefore(ctx context.Context, beforeRFC3339Nano string, limit int) ([]string, error) {
	if limit <= 0 {
		limit = 200
	}
	if limit > 1000 {
		limit = 1000
	}

	ids := make([]string, 0, limit)
	if err := s.db.WithContext(ctx).
		Model(&jobRow{}).
		Select("id").
		Where("finished_at IS NOT NULL").
		Where("finished_at < ?", beforeRFC3339Nano).
		Where("status IN ?", []string{
			string(models.JobStatusSucceeded),
			string(models.JobStatusFailed),
			string(models.JobStatusCanceled),
		}).
		Order("finished_at ASC").
		Limit(limit).
		Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return nil, nil
	}

	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return tx.Where("id IN ?", ids).Delete(&jobRow{}).Error
	}); err != nil {
		return nil, err
	}

	return ids, nil
}

func (s *Store) ListJobIDsByProfile(ctx context.Context, profileID string) ([]string, error) {
	var ids []string
	if err := s.db.WithContext(ctx).
		Model(&jobRow{}).
		Select("id").
		Where("profile_id = ?", profileID).
		Order("id ASC").
		Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	return ids, nil
}

func (s *Store) ListJobIDsByProfileAndStatus(ctx context.Context, profileID string, status models.JobStatus) ([]string, error) {
	var ids []string
	if err := s.db.WithContext(ctx).
		Model(&jobRow{}).
		Select("id").
		Where("profile_id = ? AND status = ?", profileID, string(status)).
		Order("id ASC").
		Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	return ids, nil
}

func (s *Store) JobExists(ctx context.Context, jobID string) (bool, error) {
	var count int64
	if err := s.db.WithContext(ctx).
		Model(&jobRow{}).
		Where("id = ?", jobID).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Store) GetJobByID(ctx context.Context, jobID string) (profileID string, job models.Job, ok bool, err error) {
	var row jobRow
	if err := s.db.WithContext(ctx).
		Where("id = ?", jobID).
		Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", models.Job{}, false, nil
		}
		return "", models.Job{}, false, err
	}

	profileID = row.ProfileID
	job = models.Job{
		ID:        row.ID,
		Type:      row.Type,
		Status:    models.JobStatus(row.Status),
		Payload:   make(map[string]any),
		CreatedAt: row.CreatedAt,
	}
	if err := json.Unmarshal([]byte(row.PayloadJSON), &job.Payload); err != nil {
		return "", models.Job{}, false, err
	}
	if row.ProgressJSON != nil && *row.ProgressJSON != "" {
		var jp models.JobProgress
		if err := json.Unmarshal([]byte(*row.ProgressJSON), &jp); err != nil {
			return "", models.Job{}, false, err
		}
		job.Progress = &jp
	}
	if row.Error != nil {
		job.Error = row.Error
	}
	if row.ErrorCode != nil {
		job.ErrorCode = row.ErrorCode
	}
	if row.StartedAt != nil {
		job.StartedAt = row.StartedAt
	}
	if row.FinishedAt != nil {
		job.FinishedAt = row.FinishedAt
	}

	return profileID, job, true, nil
}

func (s *Store) UpdateJobStatus(ctx context.Context, jobID string, status models.JobStatus, startedAt, finishedAt *string, progress *models.JobProgress, errMsg *string, errorCode *string) error {
	var progressJSON *string
	if progress != nil {
		bytes, err := json.Marshal(progress)
		if err != nil {
			return err
		}
		val := string(bytes)
		progressJSON = &val
	}

	updates := map[string]any{
		"status":     string(status),
		"error":      errMsg,
		"error_code": errorCode,
	}
	if startedAt != nil {
		updates["started_at"] = *startedAt
	}
	if finishedAt != nil {
		updates["finished_at"] = *finishedAt
	}
	if progressJSON != nil {
		updates["progress_json"] = *progressJSON
	}

	return s.db.WithContext(ctx).
		Model(&jobRow{}).
		Where("id = ?", jobID).
		Updates(updates).Error
}

func (s *Store) ListJobIDsByStatus(ctx context.Context, status models.JobStatus) ([]string, error) {
	var ids []string
	if err := s.db.WithContext(ctx).
		Model(&jobRow{}).
		Select("id").
		Where("status = ?", string(status)).
		Order("id ASC").
		Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	return ids, nil
}

func (s *Store) MarkRunningJobsFailed(ctx context.Context, errorMessage string) error {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	updates := map[string]any{
		"status":      string(models.JobStatusFailed),
		"error":       errorMessage,
		"finished_at": now,
	}
	return s.db.WithContext(ctx).
		Model(&jobRow{}).
		Where("status = ?", string(models.JobStatusRunning)).
		Updates(updates).Error
}

type UploadSession struct {
	ID         string
	ProfileID  string
	Bucket     string
	Prefix     string
	StagingDir string
	ExpiresAt  string
	CreatedAt  string
}

type MultipartUpload struct {
	UploadID   string
	ProfileID  string
	Path       string
	Bucket     string
	ObjectKey  string
	S3UploadID string
	ChunkSize  int64
	FileSize   int64
	CreatedAt  string
	UpdatedAt  string
}

func (s *Store) CreateUploadSession(ctx context.Context, profileID, bucket, prefix, stagingDir, expiresAt string) (UploadSession, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	id := ulid.Make().String()

	row := uploadSessionRow{
		ID:         id,
		ProfileID:  profileID,
		Bucket:     bucket,
		Prefix:     prefix,
		StagingDir: stagingDir,
		ExpiresAt:  expiresAt,
		CreatedAt:  now,
	}
	if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
		return UploadSession{}, err
	}
	return UploadSession{
		ID:         id,
		ProfileID:  profileID,
		Bucket:     bucket,
		Prefix:     prefix,
		StagingDir: stagingDir,
		ExpiresAt:  expiresAt,
		CreatedAt:  now,
	}, nil
}

func (s *Store) SetUploadSessionStagingDir(ctx context.Context, profileID, uploadID, stagingDir string) error {
	return s.db.WithContext(ctx).
		Model(&uploadSessionRow{}).
		Where("profile_id = ? AND id = ?", profileID, uploadID).
		Update("staging_dir", stagingDir).Error
}

func (s *Store) GetUploadSession(ctx context.Context, profileID, uploadID string) (UploadSession, bool, error) {
	var row uploadSessionRow
	if err := s.db.WithContext(ctx).
		Where("profile_id = ? AND id = ?", profileID, uploadID).
		Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return UploadSession{}, false, nil
		}
		return UploadSession{}, false, err
	}
	return UploadSession(row), true, nil
}

func (s *Store) GetMultipartUpload(ctx context.Context, profileID, uploadID, path string) (MultipartUpload, bool, error) {
	var row uploadMultipartRow
	if err := s.db.WithContext(ctx).
		Where("profile_id = ? AND upload_id = ? AND path = ?", profileID, uploadID, path).
		Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return MultipartUpload{}, false, nil
		}
		return MultipartUpload{}, false, err
	}
	return MultipartUpload(row), true, nil
}

func (s *Store) UpsertMultipartUpload(ctx context.Context, mu MultipartUpload) error {
	row := uploadMultipartRow(mu)
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "upload_id"}, {Name: "path"}},
		DoUpdates: clause.AssignmentColumns([]string{"bucket", "object_key", "s3_upload_id", "chunk_size", "file_size", "updated_at"}),
	}).Create(&row).Error
}

func (s *Store) ListMultipartUploads(ctx context.Context, profileID, uploadID string) ([]MultipartUpload, error) {
	var rows []uploadMultipartRow
	if err := s.db.WithContext(ctx).
		Where("profile_id = ? AND upload_id = ?", profileID, uploadID).
		Order("path ASC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]MultipartUpload, 0, len(rows))
	for _, row := range rows {
		out = append(out, MultipartUpload(row))
	}
	return out, nil
}

func (s *Store) DeleteMultipartUpload(ctx context.Context, profileID, uploadID, path string) error {
	return s.db.WithContext(ctx).
		Where("profile_id = ? AND upload_id = ? AND path = ?", profileID, uploadID, path).
		Delete(&uploadMultipartRow{}).Error
}

func (s *Store) DeleteMultipartUploadsBySession(ctx context.Context, profileID, uploadID string) error {
	return s.db.WithContext(ctx).
		Where("profile_id = ? AND upload_id = ?", profileID, uploadID).
		Delete(&uploadMultipartRow{}).Error
}

func (s *Store) UploadSessionExists(ctx context.Context, uploadID string) (bool, error) {
	var count int64
	if err := s.db.WithContext(ctx).
		Model(&uploadSessionRow{}).
		Where("id = ?", uploadID).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Store) ListUploadSessionsByProfile(ctx context.Context, profileID string, limit int) ([]UploadSession, error) {
	if limit <= 0 {
		limit = 1000
	}
	if limit > 10_000 {
		limit = 10_000
	}

	var rows []uploadSessionRow
	if err := s.db.WithContext(ctx).
		Where("profile_id = ?", profileID).
		Order("created_at ASC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, err
	}

	sessions := make([]UploadSession, 0, len(rows))
	for _, row := range rows {
		sessions = append(sessions, UploadSession(row))
	}
	return sessions, nil
}

func (s *Store) DeleteUploadSession(ctx context.Context, profileID, uploadID string) (bool, error) {
	res := s.db.WithContext(ctx).
		Where("profile_id = ? AND id = ?", profileID, uploadID).
		Delete(&uploadSessionRow{})
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

func (s *Store) ListExpiredUploadSessions(ctx context.Context, nowRFC3339Nano string, limit int) ([]UploadSession, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}

	var rows []uploadSessionRow
	if err := s.db.WithContext(ctx).
		Where("expires_at < ?", nowRFC3339Nano).
		Order("expires_at ASC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, err
	}

	sessions := make([]UploadSession, 0, len(rows))
	for _, row := range rows {
		sessions = append(sessions, UploadSession(row))
	}
	return sessions, nil
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
