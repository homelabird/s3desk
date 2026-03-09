package bucketgov

import (
	"strings"

	"s3desk/internal/models"
)

func EnabledCapability() models.BucketGovernanceCapabilityState {
	return models.BucketGovernanceCapabilityState{Enabled: true}
}

func DisabledCapability(reason string) models.BucketGovernanceCapabilityState {
	return models.BucketGovernanceCapabilityState{
		Enabled: false,
		Reason:  strings.TrimSpace(reason),
	}
}

func NewCapabilities() models.BucketGovernanceCapabilities {
	return make(models.BucketGovernanceCapabilities)
}

func KnownCapabilities() []models.BucketGovernanceCapability {
	return []models.BucketGovernanceCapability{
		models.BucketGovernanceCapabilityAccessRawPolicy,
		models.BucketGovernanceCapabilityAccessBindings,
		models.BucketGovernanceCapabilityAccessPublicToggle,
		models.BucketGovernanceCapabilityAccessACLReset,
		models.BucketGovernanceCapabilityPublicAccessBlock,
		models.BucketGovernanceCapabilityPublicAccessPrevention,
		models.BucketGovernanceCapabilityUniformAccess,
		models.BucketGovernanceCapabilityObjectOwnership,
		models.BucketGovernanceCapabilityVersioning,
		models.BucketGovernanceCapabilityDefaultEncryption,
		models.BucketGovernanceCapabilityLifecycle,
		models.BucketGovernanceCapabilityRetention,
		models.BucketGovernanceCapabilityObjectLock,
		models.BucketGovernanceCapabilitySoftDelete,
		models.BucketGovernanceCapabilityImmutability,
		models.BucketGovernanceCapabilityStoredAccessPolicy,
		models.BucketGovernanceCapabilityPAR,
		models.BucketGovernanceCapabilitySASPolicy,
		models.BucketGovernanceCapabilityCMEK,
	}
}

func NewView(provider models.ProfileProvider, bucket string) models.BucketGovernanceView {
	return models.BucketGovernanceView{
		Provider:     provider,
		Bucket:       strings.TrimSpace(bucket),
		Capabilities: NewCapabilities(),
	}
}

func SetCapability(view *models.BucketGovernanceView, capability models.BucketGovernanceCapability, enabled bool, reason string) {
	if view == nil {
		return
	}
	if view.Capabilities == nil {
		view.Capabilities = NewCapabilities()
	}
	if enabled {
		view.Capabilities[capability] = EnabledCapability()
		return
	}
	view.Capabilities[capability] = DisabledCapability(reason)
}
