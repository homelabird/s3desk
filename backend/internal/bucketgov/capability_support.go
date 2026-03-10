package bucketgov

import "s3desk/internal/models"

func capabilityState(provider models.ProfileProvider, capability models.BucketGovernanceCapability) models.BucketGovernanceCapabilityState {
	state, ok := ProviderGovernanceCapabilities(provider)[capability]
	if !ok {
		return DisabledCapability(defaultGovernanceReason(provider, capability))
	}
	return state
}

func capabilityEnabled(provider models.ProfileProvider, capability models.BucketGovernanceCapability) bool {
	return capabilityState(provider, capability).Enabled
}
