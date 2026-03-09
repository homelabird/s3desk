package bucketgov

import "s3desk/internal/models"

const (
	reasonGovernanceNotYetImplemented  = "This governance section exists in the shared model, but this client does not wire it yet."
	reasonGovernanceS3CompatibleVaries = "S3-compatible coverage depends on the target implementation. Keep using provider-native tooling until this target is live-validated."
	reasonGovernanceS3RawPolicyOnly    = "Raw bucket policy editing is available only for AWS S3 and S3-compatible providers."
	reasonGovernanceGCSBindingsOnly    = "IAM bindings are editable only for Google Cloud Storage buckets."
	reasonGovernancePublicToggleOnly   = "Visibility and public-access toggles are available only for GCS, Azure Blob, and OCI Object Storage."
	reasonGovernanceAzureStoredOnly    = "Stored access policies are available only for Azure Blob containers."
	reasonGovernanceAWSOnly            = "This typed governance control is currently available only for AWS S3 buckets."
	reasonGovernanceGCSOnly            = "This typed governance control is currently available only for Google Cloud Storage buckets."
	reasonGovernanceOCIOnly            = "This typed governance control is currently available only for OCI Object Storage buckets."
)

func ProviderGovernanceCapabilities(provider models.ProfileProvider) models.BucketGovernanceCapabilities {
	capabilities := NewCapabilities()
	for _, capability := range KnownCapabilities() {
		capabilities[capability] = DisabledCapability(defaultGovernanceReason(provider, capability))
	}

	switch provider {
	case models.ProfileProviderAwsS3:
		capabilities[models.BucketGovernanceCapabilityAccessRawPolicy] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilityPublicAccessBlock] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilityObjectOwnership] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilityVersioning] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilityDefaultEncryption] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilityLifecycle] = EnabledCapability()
	case models.ProfileProviderS3Compatible:
		capabilities[models.BucketGovernanceCapabilityAccessRawPolicy] = EnabledCapability()
	case models.ProfileProviderGcpGcs:
		capabilities[models.BucketGovernanceCapabilityAccessBindings] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilityAccessPublicToggle] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilityPublicAccessPrevention] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilityUniformAccess] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilityVersioning] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilityRetention] = EnabledCapability()
	case models.ProfileProviderAzureBlob:
		capabilities[models.BucketGovernanceCapabilityAccessPublicToggle] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilityStoredAccessPolicy] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilityVersioning] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilitySoftDelete] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilityImmutability] = EnabledCapability()
	case models.ProfileProviderOciObjectStorage:
		capabilities[models.BucketGovernanceCapabilityAccessPublicToggle] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilityVersioning] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilityRetention] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilityPAR] = EnabledCapability()
	}

	return capabilities
}

func defaultGovernanceReason(provider models.ProfileProvider, capability models.BucketGovernanceCapability) string {
	switch capability {
	case models.BucketGovernanceCapabilityAccessRawPolicy:
		return reasonGovernanceS3RawPolicyOnly
	case models.BucketGovernanceCapabilityAccessBindings:
		return reasonGovernanceGCSBindingsOnly
	case models.BucketGovernanceCapabilityAccessPublicToggle:
		if provider == models.ProfileProviderOciObjectStorage {
			return reasonGovernanceNotYetImplemented
		}
		return reasonGovernancePublicToggleOnly
	case models.BucketGovernanceCapabilityStoredAccessPolicy:
		return reasonGovernanceAzureStoredOnly
	case models.BucketGovernanceCapabilityPublicAccessBlock, models.BucketGovernanceCapabilityObjectOwnership:
		if provider == models.ProfileProviderS3Compatible {
			return reasonGovernanceS3CompatibleVaries
		}
		return reasonGovernanceAWSOnly
	case models.BucketGovernanceCapabilityPublicAccessPrevention, models.BucketGovernanceCapabilityUniformAccess:
		return reasonGovernanceGCSOnly
	case models.BucketGovernanceCapabilityPAR:
		return reasonGovernanceOCIOnly
	default:
		if provider == models.ProfileProviderS3Compatible {
			switch capability {
			case models.BucketGovernanceCapabilityVersioning, models.BucketGovernanceCapabilityDefaultEncryption, models.BucketGovernanceCapabilityLifecycle:
				return reasonGovernanceS3CompatibleVaries
			}
		}
		if capability == models.BucketGovernanceCapabilityLifecycle {
			return reasonGovernanceAWSOnly
		}
		return reasonGovernanceNotYetImplemented
	}
}
