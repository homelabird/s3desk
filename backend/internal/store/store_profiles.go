package store

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
	"gorm.io/gorm"

	"s3desk/internal/models"
)

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
		PublicEndpoint:        "",
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
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible:
		endpoint := ""
		if req.Endpoint != nil {
			endpoint = strings.TrimSpace(*req.Endpoint)
		}
		publicEndpoint := ""
		if req.PublicEndpoint != nil {
			publicEndpoint = strings.TrimSpace(*req.PublicEndpoint)
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
		row.PublicEndpoint = publicEndpoint
		row.Region = region
		row.ForcePathStyle = boolToInt(force)
		row.AccessKeyID = ak
		row.SecretAccessKey = sk
		row.SessionToken = sessionToken

	case models.ProfileProviderAzureBlob:
		if req.Region != nil || req.AccessKeyID != nil || req.SecretAccessKey != nil || req.SessionToken != nil || req.ForcePathStyle != nil || req.PublicEndpoint != nil || req.ServiceAccountJSON != nil || req.Anonymous != nil || req.ProjectNumber != nil || req.Namespace != nil || req.Compartment != nil || req.AuthProvider != nil || req.ConfigFile != nil || req.ConfigProfile != nil {
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
		subscriptionID := ""
		if req.SubscriptionID != nil {
			subscriptionID = strings.TrimSpace(*req.SubscriptionID)
		}
		resourceGroup := ""
		if req.ResourceGroup != nil {
			resourceGroup = strings.TrimSpace(*req.ResourceGroup)
		}
		tenantID := ""
		if req.TenantID != nil {
			tenantID = strings.TrimSpace(*req.TenantID)
		}
		clientID := ""
		if req.ClientID != nil {
			clientID = strings.TrimSpace(*req.ClientID)
		}
		clientSecret := ""
		if req.ClientSecret != nil {
			clientSecret = strings.TrimSpace(*req.ClientSecret)
		}
		if accountName == "" || accountKey == "" {
			return models.Profile{}, errors.New("missing required azure fields")
		}
		armFieldsProvided := subscriptionID != "" || resourceGroup != "" || tenantID != "" || clientID != "" || clientSecret != ""
		if armFieldsProvided && (subscriptionID == "" || resourceGroup == "" || tenantID == "" || clientID == "" || clientSecret == "") {
			return models.Profile{}, errors.New("azure ARM configuration requires subscriptionId, resourceGroup, tenantId, clientId, and clientSecret together")
		}

		cfg, _ := json.Marshal(azureProfileConfig{
			AccountName:    accountName,
			Endpoint:       endpoint,
			UseEmulator:    useEmulator,
			SubscriptionID: subscriptionID,
			ResourceGroup:  resourceGroup,
			TenantID:       tenantID,
			ClientID:       clientID,
		})
		secretVal := accountKey
		if s.crypto != nil {
			enc, err := s.crypto.encryptString(secretVal)
			if err != nil {
				return models.Profile{}, err
			}
			secretVal = enc
		}
		clientSecretVal := clientSecret
		if s.crypto != nil && clientSecretVal != "" {
			enc, err := s.crypto.encryptString(clientSecretVal)
			if err != nil {
				return models.Profile{}, err
			}
			clientSecretVal = enc
		}
		sec, _ := json.Marshal(azureProfileSecrets{AccountKey: secretVal, ClientSecret: clientSecretVal})
		row.ConfigJSON = string(cfg)
		row.SecretsJSON = string(sec)

	case models.ProfileProviderGcpGcs:
		if req.Region != nil || req.AccessKeyID != nil || req.SecretAccessKey != nil || req.SessionToken != nil || req.ForcePathStyle != nil || req.PublicEndpoint != nil || req.AccountName != nil || req.AccountKey != nil || req.UseEmulator != nil || req.Namespace != nil || req.Compartment != nil || req.AuthProvider != nil || req.ConfigFile != nil || req.ConfigProfile != nil {
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
		if projectNumber == "" {
			return models.Profile{}, errors.New("projectNumber is required")
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
		if req.AccessKeyID != nil || req.SecretAccessKey != nil || req.SessionToken != nil || req.ForcePathStyle != nil || req.PublicEndpoint != nil || req.AccountName != nil || req.AccountKey != nil || req.UseEmulator != nil || req.ServiceAccountJSON != nil || req.Anonymous != nil || req.ProjectNumber != nil {
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
			authProvider = normalizeOciAuthProvider(*req.AuthProvider)
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
			AuthProvider:  normalizeOciAuthProvider(authProvider),
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

func (s *Store) ListProfiles(ctx context.Context) ([]models.Profile, error) {
	var rows []profileRow
	if err := s.db.WithContext(ctx).
		Select("id", "name", "provider", "config_json", "endpoint", "public_endpoint", "region", "force_path_style", "preserve_leading_slash", "tls_insecure_skip_verify", "created_at", "updated_at").
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
		Select("id", "name", "provider", "config_json", "endpoint", "public_endpoint", "region", "force_path_style", "preserve_leading_slash", "tls_insecure_skip_verify", "created_at", "updated_at").
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
		Select("id", "name", "provider", "config_json", "secrets_json", "endpoint", "public_endpoint", "region", "force_path_style", "preserve_leading_slash", "tls_insecure_skip_verify", "access_key_id", "secret_access_key", "session_token").
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
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible:
		profile.Endpoint = strings.TrimSpace(row.Endpoint)
		profile.PublicEndpoint = strings.TrimSpace(row.PublicEndpoint)
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
		if err := unmarshalProfileJSON(row.ID, provider, "config_json", row.ConfigJSON, &cfg); err != nil {
			return models.ProfileSecrets{}, false, err
		}
		profile.AzureAccountName = strings.TrimSpace(cfg.AccountName)
		profile.AzureEndpoint = strings.TrimSpace(cfg.Endpoint)
		profile.AzureUseEmulator = cfg.UseEmulator
		profile.AzureSubscriptionID = strings.TrimSpace(cfg.SubscriptionID)
		profile.AzureResourceGroup = strings.TrimSpace(cfg.ResourceGroup)
		profile.AzureTenantID = strings.TrimSpace(cfg.TenantID)
		profile.AzureClientID = strings.TrimSpace(cfg.ClientID)
		var sec azureProfileSecrets
		if err := unmarshalProfileJSON(row.ID, provider, "secrets_json", row.SecretsJSON, &sec); err != nil {
			return models.ProfileSecrets{}, false, err
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
		clientSecret := strings.TrimSpace(sec.ClientSecret)
		if strings.HasPrefix(clientSecret, encryptedPrefix) {
			if s.crypto == nil {
				return models.ProfileSecrets{}, false, ErrEncryptedCredentials
			}
			dec, err := s.crypto.decryptString(clientSecret)
			if err != nil {
				return models.ProfileSecrets{}, false, err
			}
			clientSecret = dec
		}
		profile.AzureClientSecret = clientSecret

	case models.ProfileProviderGcpGcs:
		var cfg gcpProfileConfig
		if err := unmarshalProfileJSON(row.ID, provider, "config_json", row.ConfigJSON, &cfg); err != nil {
			return models.ProfileSecrets{}, false, err
		}
		profile.GcpEndpoint = strings.TrimSpace(cfg.Endpoint)
		profile.GcpAnonymous = cfg.Anonymous
		profile.GcpProjectNumber = strings.TrimSpace(cfg.ProjectNumber)

		var sec gcpProfileSecrets
		if err := unmarshalProfileJSON(row.ID, provider, "secrets_json", row.SecretsJSON, &sec); err != nil {
			return models.ProfileSecrets{}, false, err
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
		if err := unmarshalProfileJSON(row.ID, provider, "config_json", row.ConfigJSON, &cfg); err != nil {
			return models.ProfileSecrets{}, false, err
		}
		profile.OciNamespace = strings.TrimSpace(cfg.Namespace)
		profile.OciCompartment = strings.TrimSpace(cfg.Compartment)
		profile.Region = strings.TrimSpace(cfg.Region)
		profile.OciEndpoint = strings.TrimSpace(cfg.Endpoint)
		profile.OciAuthProvider = normalizeOciAuthProvider(cfg.AuthProvider)
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
	updates := map[string]any{
		"updated_at": now,
		"provider":   string(provider),
	}

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
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible:
		endpoint := currentSecrets.Endpoint
		publicEndpoint := currentSecrets.PublicEndpoint
		region := currentSecrets.Region
		ak := currentSecrets.AccessKeyID
		sk := currentSecrets.SecretAccessKey
		sessionToken := currentSecrets.SessionToken
		forcePathStyle := currentSecrets.ForcePathStyle

		if req.Endpoint != nil {
			endpoint = strings.TrimSpace(*req.Endpoint)
			if provider != models.ProfileProviderAwsS3 && endpoint == "" {
				return models.Profile{}, true, errors.New("endpoint must not be empty")
			}
			updates["endpoint"] = endpoint
		}
		if req.PublicEndpoint != nil {
			publicEndpoint = strings.TrimSpace(*req.PublicEndpoint)
			updates["public_endpoint"] = publicEndpoint
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
		updates["public_endpoint"] = publicEndpoint
		updates["region"] = region
		updates["force_path_style"] = boolToInt(forcePathStyle)
		updates["access_key_id"] = ak
		updates["secret_access_key"] = sk
		updates["session_token"] = sessionToken

	case models.ProfileProviderAzureBlob:
		if req.Region != nil || req.AccessKeyID != nil || req.SecretAccessKey != nil || req.SessionToken != nil || req.ForcePathStyle != nil || req.PublicEndpoint != nil || req.ServiceAccountJSON != nil || req.Anonymous != nil || req.ProjectNumber != nil || req.Namespace != nil || req.Compartment != nil || req.AuthProvider != nil || req.ConfigFile != nil || req.ConfigProfile != nil {
			return models.Profile{}, true, errors.New("invalid fields for azure_blob")
		}
		accountName := strings.TrimSpace(currentSecrets.AzureAccountName)
		accountKey := strings.TrimSpace(currentSecrets.AzureAccountKey)
		endpoint := strings.TrimSpace(currentSecrets.AzureEndpoint)
		useEmulator := currentSecrets.AzureUseEmulator
		subscriptionID := strings.TrimSpace(currentSecrets.AzureSubscriptionID)
		resourceGroup := strings.TrimSpace(currentSecrets.AzureResourceGroup)
		tenantID := strings.TrimSpace(currentSecrets.AzureTenantID)
		clientID := strings.TrimSpace(currentSecrets.AzureClientID)
		clientSecret := strings.TrimSpace(currentSecrets.AzureClientSecret)
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
		if req.SubscriptionID != nil {
			subscriptionID = strings.TrimSpace(*req.SubscriptionID)
		}
		if req.ResourceGroup != nil {
			resourceGroup = strings.TrimSpace(*req.ResourceGroup)
		}
		if req.TenantID != nil {
			tenantID = strings.TrimSpace(*req.TenantID)
		}
		if req.ClientID != nil {
			clientID = strings.TrimSpace(*req.ClientID)
		}
		if req.ClientSecret != nil {
			clientSecret = strings.TrimSpace(*req.ClientSecret)
			if clientSecret == "" {
				return models.Profile{}, true, errors.New("clientSecret must not be empty")
			}
		}
		armFieldsProvided := subscriptionID != "" || resourceGroup != "" || tenantID != "" || clientID != "" || clientSecret != ""
		if armFieldsProvided && (subscriptionID == "" || resourceGroup == "" || tenantID == "" || clientID == "" || clientSecret == "") {
			return models.Profile{}, true, errors.New("azure ARM configuration requires subscriptionId, resourceGroup, tenantId, clientId, and clientSecret together")
		}
		cfg, _ := json.Marshal(azureProfileConfig{
			AccountName:    accountName,
			Endpoint:       endpoint,
			UseEmulator:    useEmulator,
			SubscriptionID: subscriptionID,
			ResourceGroup:  resourceGroup,
			TenantID:       tenantID,
			ClientID:       clientID,
		})
		secretVal := accountKey
		if s.crypto != nil {
			enc, err := s.crypto.encryptString(secretVal)
			if err != nil {
				return models.Profile{}, true, err
			}
			secretVal = enc
		}
		clientSecretVal := clientSecret
		if s.crypto != nil && clientSecretVal != "" {
			enc, err := s.crypto.encryptString(clientSecretVal)
			if err != nil {
				return models.Profile{}, true, err
			}
			clientSecretVal = enc
		}
		sec, _ := json.Marshal(azureProfileSecrets{AccountKey: secretVal, ClientSecret: clientSecretVal})
		updates["config_json"] = string(cfg)
		updates["secrets_json"] = string(sec)

	case models.ProfileProviderGcpGcs:
		if req.Region != nil || req.AccessKeyID != nil || req.SecretAccessKey != nil || req.SessionToken != nil || req.ForcePathStyle != nil || req.PublicEndpoint != nil || req.AccountName != nil || req.AccountKey != nil || req.UseEmulator != nil || req.Namespace != nil || req.Compartment != nil || req.AuthProvider != nil || req.ConfigFile != nil || req.ConfigProfile != nil {
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
		if projectNumber == "" {
			return models.Profile{}, true, errors.New("projectNumber is required")
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
		if req.AccessKeyID != nil || req.SecretAccessKey != nil || req.SessionToken != nil || req.ForcePathStyle != nil || req.PublicEndpoint != nil || req.AccountName != nil || req.AccountKey != nil || req.UseEmulator != nil || req.ServiceAccountJSON != nil || req.Anonymous != nil || req.ProjectNumber != nil {
			return models.Profile{}, true, errors.New("invalid fields for oci_object_storage")
		}
		region := strings.TrimSpace(currentSecrets.Region)
		namespace := strings.TrimSpace(currentSecrets.OciNamespace)
		compartment := strings.TrimSpace(currentSecrets.OciCompartment)
		endpoint := strings.TrimSpace(currentSecrets.OciEndpoint)
		authProvider := normalizeOciAuthProvider(currentSecrets.OciAuthProvider)
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
			authProvider = normalizeOciAuthProvider(*req.AuthProvider)
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
			AuthProvider:  normalizeOciAuthProvider(authProvider),
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
