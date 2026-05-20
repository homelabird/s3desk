package profileendpoint

import (
	"strings"

	"s3desk/internal/models"
)

func ValidateProfileSecretsEndpoints(secrets models.ProfileSecrets, allowRemote bool) error {
	switch secrets.Provider {
	case "", models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible:
		if err := validateProfileEndpointField("endpoint", secrets.Endpoint, allowRemote); err != nil {
			return err
		}
		if err := validateProfileEndpointField("publicEndpoint", secrets.PublicEndpoint, allowRemote); err != nil {
			return err
		}
		if secrets.TLSInsecureSkipVerify {
			if err := validateProfileTLSSkipVerifyField("endpoint", secrets.Endpoint, allowRemote); err != nil {
				return err
			}
		}
	case models.ProfileProviderAzureBlob:
		if err := validateProfileEndpointField("endpoint", secrets.AzureEndpoint, allowRemote); err != nil {
			return err
		}
		if secrets.TLSInsecureSkipVerify {
			if err := validateProfileTLSSkipVerifyField("endpoint", secrets.AzureEndpoint, allowRemote); err != nil {
				return err
			}
		}
	case models.ProfileProviderGcpGcs:
		if err := validateProfileEndpointField("endpoint", secrets.GcpEndpoint, allowRemote); err != nil {
			return err
		}
		if secrets.TLSInsecureSkipVerify {
			if err := validateProfileTLSSkipVerifyField("endpoint", secrets.GcpEndpoint, allowRemote); err != nil {
				return err
			}
		}
	case models.ProfileProviderOciObjectStorage:
		if err := validateProfileEndpointField("endpoint", secrets.OciEndpoint, allowRemote); err != nil {
			return err
		}
		if secrets.TLSInsecureSkipVerify {
			if err := validateProfileTLSSkipVerifyField("endpoint", secrets.OciEndpoint, allowRemote); err != nil {
				return err
			}
		}
	default:
		for _, endpoint := range []struct {
			field string
			value string
		}{
			{"endpoint", secrets.Endpoint},
			{"publicEndpoint", secrets.PublicEndpoint},
			{"azureEndpoint", secrets.AzureEndpoint},
			{"gcpEndpoint", secrets.GcpEndpoint},
			{"ociEndpoint", secrets.OciEndpoint},
		} {
			if err := validateProfileEndpointField(endpoint.field, endpoint.value, allowRemote); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateProfileEndpointField(field, raw string, allowRemote bool) error {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil
	}
	return ValidateURL(field, &value, allowRemote)
}

func validateProfileTLSSkipVerifyField(field, raw string, allowRemote bool) error {
	value := strings.TrimSpace(raw)
	return ValidateTLSSkipVerifyEndpoint(field, &value, allowRemote)
}
