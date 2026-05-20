package api

import (
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"s3desk/internal/gcsauth"
	"s3desk/internal/models"
)

type fieldTextInput struct {
	name  string
	value *string
}

func prepareCreateProfileRequest(req models.ProfileCreateRequest, allowRemote bool) (models.ProfileCreateRequest, error) {
	req.Name = strings.TrimSpace(req.Name)
	provider := models.ProfileProvider(strings.TrimSpace(string(req.Provider)))
	if provider == "" {
		provider = models.ProfileProviderS3Compatible
	}
	req.Provider = provider

	trimPtrNilIfEmpty(&req.Endpoint)
	trimPtrNilIfEmpty(&req.PublicEndpoint)
	trimPtrNilIfEmpty(&req.Region)
	trimPtrNilIfEmpty(&req.AccessKeyID)
	trimPtrNilIfEmpty(&req.SecretAccessKey)
	trimPtrNilIfEmpty(&req.SessionToken)
	trimPtrNilIfEmpty(&req.AccountName)
	trimPtrNilIfEmpty(&req.AccountKey)
	trimPtrNilIfEmpty(&req.SubscriptionID)
	trimPtrNilIfEmpty(&req.ResourceGroup)
	trimPtrNilIfEmpty(&req.TenantID)
	trimPtrNilIfEmpty(&req.ClientID)
	trimPtrNilIfEmpty(&req.ClientSecret)
	trimPtrNilIfEmpty(&req.ServiceAccountJSON)
	trimPtrNilIfEmpty(&req.ProjectNumber)
	trimPtrNilIfEmpty(&req.Namespace)
	trimPtrNilIfEmpty(&req.Compartment)
	trimPtrNilIfEmpty(&req.AuthProvider)
	trimPtrNilIfEmpty(&req.ConfigFile)
	trimPtrNilIfEmpty(&req.ConfigProfile)

	if req.Name == "" {
		return req, errors.New("name is required")
	}
	if err := validateProfileTextInputs(
		fieldTextInput{"name", &req.Name},
		fieldTextInput{"endpoint", req.Endpoint},
		fieldTextInput{"publicEndpoint", req.PublicEndpoint},
		fieldTextInput{"region", req.Region},
		fieldTextInput{"accessKeyId", req.AccessKeyID},
		fieldTextInput{"secretAccessKey", req.SecretAccessKey},
		fieldTextInput{"sessionToken", req.SessionToken},
		fieldTextInput{"accountName", req.AccountName},
		fieldTextInput{"accountKey", req.AccountKey},
		fieldTextInput{"subscriptionId", req.SubscriptionID},
		fieldTextInput{"resourceGroup", req.ResourceGroup},
		fieldTextInput{"tenantId", req.TenantID},
		fieldTextInput{"clientId", req.ClientID},
		fieldTextInput{"clientSecret", req.ClientSecret},
		fieldTextInput{"projectNumber", req.ProjectNumber},
		fieldTextInput{"namespace", req.Namespace},
		fieldTextInput{"compartment", req.Compartment},
		fieldTextInput{"authProvider", req.AuthProvider},
		fieldTextInput{"configFile", req.ConfigFile},
		fieldTextInput{"configProfile", req.ConfigProfile},
	); err != nil {
		return req, err
	}
	if err := validateProfileEndpointURL("endpoint", req.Endpoint, allowRemote); err != nil {
		return req, err
	}
	if err := validateProfileEndpointURL("publicEndpoint", req.PublicEndpoint, allowRemote); err != nil {
		return req, err
	}
	if err := validateCreateProfileProvider(&req); err != nil {
		return req, err
	}
	if req.TLSInsecureSkipVerify {
		if err := validateProfileTLSSkipVerifyEndpoint("endpoint", req.Endpoint, allowRemote); err != nil {
			return req, err
		}
	}
	return req, nil
}

func prepareUpdateProfileRequest(req models.ProfileUpdateRequest) (models.ProfileUpdateRequest, error) {
	if strings.TrimSpace(string(req.Provider)) != "" {
		req.Provider = models.ProfileProvider(strings.TrimSpace(string(req.Provider)))
	}

	trimPtrPreserveEmpty(&req.Name)
	trimPtrPreserveEmpty(&req.Endpoint)
	trimPtrPreserveEmpty(&req.PublicEndpoint)
	trimPtrPreserveEmpty(&req.Region)
	trimPtrPreserveEmpty(&req.AccessKeyID)
	trimPtrPreserveEmpty(&req.SecretAccessKey)
	trimPtrPreserveEmpty(&req.SessionToken)
	trimPtrPreserveEmpty(&req.AccountName)
	trimPtrPreserveEmpty(&req.AccountKey)
	trimPtrPreserveEmpty(&req.SubscriptionID)
	trimPtrPreserveEmpty(&req.ResourceGroup)
	trimPtrPreserveEmpty(&req.TenantID)
	trimPtrPreserveEmpty(&req.ClientID)
	trimPtrPreserveEmpty(&req.ClientSecret)
	trimPtrPreserveEmpty(&req.ServiceAccountJSON)
	trimPtrPreserveEmpty(&req.ProjectNumber)
	trimPtrPreserveEmpty(&req.Namespace)
	trimPtrPreserveEmpty(&req.Compartment)
	trimPtrPreserveEmpty(&req.AuthProvider)
	trimPtrPreserveEmpty(&req.ConfigFile)
	trimPtrPreserveEmpty(&req.ConfigProfile)

	if req.Name != nil && *req.Name == "" {
		return req, errors.New("name must not be empty")
	}
	if req.AccessKeyID != nil && *req.AccessKeyID == "" {
		return req, errors.New("accessKeyId must not be empty")
	}
	if req.SecretAccessKey != nil && *req.SecretAccessKey == "" {
		return req, errors.New("secretAccessKey must not be empty")
	}
	if err := validateProfileTextInputs(
		fieldTextInput{"name", req.Name},
		fieldTextInput{"endpoint", req.Endpoint},
		fieldTextInput{"publicEndpoint", req.PublicEndpoint},
		fieldTextInput{"region", req.Region},
		fieldTextInput{"accessKeyId", req.AccessKeyID},
		fieldTextInput{"secretAccessKey", req.SecretAccessKey},
		fieldTextInput{"sessionToken", req.SessionToken},
		fieldTextInput{"accountName", req.AccountName},
		fieldTextInput{"accountKey", req.AccountKey},
		fieldTextInput{"subscriptionId", req.SubscriptionID},
		fieldTextInput{"resourceGroup", req.ResourceGroup},
		fieldTextInput{"tenantId", req.TenantID},
		fieldTextInput{"clientId", req.ClientID},
		fieldTextInput{"clientSecret", req.ClientSecret},
		fieldTextInput{"projectNumber", req.ProjectNumber},
		fieldTextInput{"namespace", req.Namespace},
		fieldTextInput{"compartment", req.Compartment},
		fieldTextInput{"authProvider", req.AuthProvider},
		fieldTextInput{"configFile", req.ConfigFile},
		fieldTextInput{"configProfile", req.ConfigProfile},
	); err != nil {
		return req, err
	}
	return req, nil
}

func validatePreparedUpdateProfileRequest(currentProfile models.Profile, req models.ProfileUpdateRequest, allowRemote bool) error {
	if err := validateProfileEndpointURL("endpoint", req.Endpoint, allowRemote); err != nil {
		return err
	}
	if err := validateProfileEndpointURL("publicEndpoint", req.PublicEndpoint, allowRemote); err != nil {
		return err
	}

	effectiveEndpoint := currentProfile.Endpoint
	if req.Endpoint != nil {
		effectiveEndpoint = strings.TrimSpace(*req.Endpoint)
	}
	effectiveTLSSkipVerify := currentProfile.TLSInsecureSkipVerify
	if req.TLSInsecureSkipVerify != nil {
		effectiveTLSSkipVerify = *req.TLSInsecureSkipVerify
	}
	if effectiveTLSSkipVerify {
		if err := validateProfileTLSSkipVerifyEndpoint("endpoint", &effectiveEndpoint, allowRemote); err != nil {
			return err
		}
	}
	if req.ServiceAccountJSON != nil {
		if err := gcsauth.ValidateServiceAccountJSON(*req.ServiceAccountJSON); err != nil {
			return err
		}
	}
	return nil
}

func trimPtrNilIfEmpty(p **string) {
	if *p == nil {
		return
	}
	v := strings.TrimSpace(**p)
	if v == "" {
		*p = nil
		return
	}
	*p = &v
}

func trimPtrPreserveEmpty(p **string) {
	if *p == nil {
		return
	}
	v := strings.TrimSpace(**p)
	*p = &v
}

func validateProfileTextInputs(fields ...fieldTextInput) error {
	for _, field := range fields {
		if field.value == nil {
			continue
		}
		if containsUnsafeSingleLineText(*field.value) {
			return fmt.Errorf("%s contains unsupported control characters", field.name)
		}
	}
	return nil
}

func containsUnsafeSingleLineText(value string) bool {
	for len(value) > 0 {
		r, size := utf8.DecodeRuneInString(value)
		if r == '\n' || r == '\r' || r == 0 {
			return true
		}
		value = value[size:]
	}
	return false
}

func hasUnexpectedFields(fields ...any) bool {
	for _, f := range fields {
		switch v := f.(type) {
		case *string:
			if v != nil {
				return true
			}
		case *bool:
			if v != nil {
				return true
			}
		}
	}
	return false
}

func validateCreateProfileProvider(req *models.ProfileCreateRequest) error {
	switch req.Provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible:
		if req.Provider != models.ProfileProviderAwsS3 {
			if req.Endpoint == nil || strings.TrimSpace(*req.Endpoint) == "" {
				return errors.New("endpoint is required")
			}
		}
		if req.Region == nil || strings.TrimSpace(*req.Region) == "" {
			return errors.New("region is required")
		}
		if req.AccessKeyID == nil || strings.TrimSpace(*req.AccessKeyID) == "" {
			return errors.New("accessKeyId is required")
		}
		if req.SecretAccessKey == nil || strings.TrimSpace(*req.SecretAccessKey) == "" {
			return errors.New("secretAccessKey is required")
		}
		if req.ForcePathStyle == nil {
			forcePathStyle := false
			req.ForcePathStyle = &forcePathStyle
		}
		if hasUnexpectedFields(req.AccountName, req.AccountKey, req.SubscriptionID, req.ResourceGroup, req.TenantID, req.ClientID, req.ClientSecret, req.UseEmulator, req.ServiceAccountJSON, req.Anonymous, req.ProjectNumber, req.Namespace, req.Compartment, req.AuthProvider, req.ConfigFile, req.ConfigProfile) {
			return errors.New("unexpected fields for s3 provider")
		}
	case models.ProfileProviderAzureBlob:
		if req.AccountName == nil || *req.AccountName == "" || req.AccountKey == nil || *req.AccountKey == "" {
			return errors.New("accountName and accountKey are required")
		}
		if hasUnexpectedFields(req.Region, req.AccessKeyID, req.SecretAccessKey, req.SessionToken, req.ForcePathStyle, req.PublicEndpoint, req.ServiceAccountJSON, req.Anonymous, req.ProjectNumber, req.Namespace, req.Compartment, req.AuthProvider, req.ConfigFile, req.ConfigProfile) {
			return errors.New("unexpected fields for azure_blob")
		}
	case models.ProfileProviderGcpGcs:
		anonymous := req.Anonymous != nil && *req.Anonymous
		if req.ProjectNumber == nil || strings.TrimSpace(*req.ProjectNumber) == "" {
			return errors.New("projectNumber is required")
		}
		if !anonymous && (req.ServiceAccountJSON == nil || *req.ServiceAccountJSON == "") {
			return errors.New("serviceAccountJson is required unless anonymous=true")
		}
		if req.ServiceAccountJSON != nil {
			if err := gcsauth.ValidateServiceAccountJSON(*req.ServiceAccountJSON); err != nil {
				return err
			}
		}
		if hasUnexpectedFields(req.Region, req.AccessKeyID, req.SecretAccessKey, req.SessionToken, req.ForcePathStyle, req.PublicEndpoint, req.AccountName, req.AccountKey, req.SubscriptionID, req.ResourceGroup, req.TenantID, req.ClientID, req.ClientSecret, req.UseEmulator, req.Namespace, req.Compartment, req.AuthProvider, req.ConfigFile, req.ConfigProfile) {
			return errors.New("unexpected fields for gcp_gcs")
		}
	case models.ProfileProviderOciObjectStorage:
		if req.Region == nil || strings.TrimSpace(*req.Region) == "" {
			return errors.New("region is required")
		}
		if req.Namespace == nil || strings.TrimSpace(*req.Namespace) == "" {
			return errors.New("namespace is required")
		}
		if req.Compartment == nil || strings.TrimSpace(*req.Compartment) == "" {
			return errors.New("compartment is required")
		}
		if hasUnexpectedFields(req.AccessKeyID, req.SecretAccessKey, req.SessionToken, req.ForcePathStyle, req.PublicEndpoint, req.AccountName, req.AccountKey, req.SubscriptionID, req.ResourceGroup, req.TenantID, req.ClientID, req.ClientSecret, req.UseEmulator, req.ServiceAccountJSON, req.Anonymous, req.ProjectNumber) {
			return errors.New("unexpected fields for oci_object_storage")
		}
	default:
		return fmt.Errorf("unknown provider: %s", req.Provider)
	}
	return nil
}
