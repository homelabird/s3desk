package bucketgov

import "s3desk/internal/models"

const (
	reasonGovernanceNotYetImplemented  = "This governance control is not yet implemented in this client."
	reasonGovernanceS3CompatibleVaries = "Support varies across S3-compatible targets and is not enabled generically yet."
	reasonGovernanceS3RawPolicyOnly    = "Advanced raw policy editing is supported only by S3-compatible providers (aws_s3, s3_compatible)."
	reasonGovernanceGCSBindingsOnly    = "Access bindings are supported only by gcp_gcs."
	reasonGovernancePublicToggleOnly   = "Public access toggle is supported only by gcp_gcs and azure_blob."
	reasonGovernanceAzureStoredOnly    = "Stored access policies are supported only by azure_blob."
	reasonGovernanceAWSOnly            = "This governance control is currently supported only by aws_s3."
	reasonGovernanceGCSOnly            = "This governance control is currently supported only by gcp_gcs."
	reasonGovernanceOCIOnly            = "This governance control is currently supported only by oci_object_storage."
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
	case models.ProfileProviderOciObjectStorage:
		capabilities[models.BucketGovernanceCapabilityAccessPublicToggle] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilityVersioning] = EnabledCapability()
		capabilities[models.BucketGovernanceCapabilityRetention] = EnabledCapability()
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
