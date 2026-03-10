package bucketgov

import "s3desk/internal/models"

type ValidationContext struct {
	Provider     models.ProfileProvider
	Bucket       string
	Capabilities models.BucketGovernanceCapabilities
}

func newValidationContext(provider models.ProfileProvider, bucket string) ValidationContext {
	return ValidationContext{
		Provider:     provider,
		Bucket:       bucket,
		Capabilities: ProviderGovernanceCapabilities(provider),
	}
}

func (c ValidationContext) CapabilityState(capability models.BucketGovernanceCapability) models.BucketGovernanceCapabilityState {
	state, ok := c.Capabilities[capability]
	if !ok {
		return DisabledCapability(defaultGovernanceReason(c.Provider, capability))
	}
	return state
}

func (c ValidationContext) CapabilityEnabled(capability models.BucketGovernanceCapability) bool {
	return c.CapabilityState(capability).Enabled
}

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
