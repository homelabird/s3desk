package profileendpoint

import (
	"context"
	"strings"

	"s3desk/internal/models"
)

func ValidateProfileSecretsEndpoints(secrets models.ProfileSecrets, allowRemote bool) error {
	return ValidateProfileSecretsEndpointsContext(context.Background(), secrets, allowRemote)
}

func ValidateProfileSecretsEndpointsContext(ctx context.Context, secrets models.ProfileSecrets, allowRemote bool) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	switch secrets.Provider {
	case "", models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible:
		if err := validateProfileEndpointField(ctx, "endpoint", secrets.Endpoint, allowRemote); err != nil {
			return err
		}
		if err := ValidatePublicURLContext(ctx, "publicEndpoint", &secrets.PublicEndpoint, allowRemote); err != nil {
			return err
		}
		if secrets.TLSInsecureSkipVerify {
			if err := validateProfileTLSSkipVerifyField(ctx, "endpoint", secrets.Endpoint, allowRemote); err != nil {
				return err
			}
		}
	case models.ProfileProviderAzureBlob:
		if err := validateProfileEndpointField(ctx, "endpoint", secrets.AzureEndpoint, allowRemote); err != nil {
			return err
		}
		if secrets.TLSInsecureSkipVerify {
			if err := validateProfileTLSSkipVerifyField(ctx, "endpoint", secrets.AzureEndpoint, allowRemote); err != nil {
				return err
			}
		}
	case models.ProfileProviderGcpGcs:
		if err := validateProfileEndpointField(ctx, "endpoint", secrets.GcpEndpoint, allowRemote); err != nil {
			return err
		}
		if secrets.TLSInsecureSkipVerify {
			if err := validateProfileTLSSkipVerifyField(ctx, "endpoint", secrets.GcpEndpoint, allowRemote); err != nil {
				return err
			}
		}
	case models.ProfileProviderOciObjectStorage:
		if err := validateProfileEndpointField(ctx, "endpoint", secrets.OciEndpoint, allowRemote); err != nil {
			return err
		}
		if secrets.TLSInsecureSkipVerify {
			if err := validateProfileTLSSkipVerifyField(ctx, "endpoint", secrets.OciEndpoint, allowRemote); err != nil {
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
			if err := validateProfileEndpointField(ctx, endpoint.field, endpoint.value, allowRemote); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateProfileEndpointField(ctx context.Context, field, raw string, allowRemote bool) error {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil
	}
	return ValidateURLContext(ctx, field, &value, allowRemote)
}

func validateProfileTLSSkipVerifyField(ctx context.Context, field, raw string, allowRemote bool) error {
	value := strings.TrimSpace(raw)
	return ValidateTLSSkipVerifyEndpointContext(ctx, field, &value, allowRemote)
}
