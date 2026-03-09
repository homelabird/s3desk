package api

import (
	"strings"

	"s3desk/internal/bucketgov"
	"s3desk/internal/models"
)

const (
	reasonBucketPolicyS3Only             = "Supported only by S3-compatible providers (aws_s3, s3_compatible)."
	reasonGCSIAMPolicyOnly               = "Supported only by gcp_gcs."
	reasonAzureContainerPolicyOnly       = "Supported only by azure_blob."
	reasonPresignedUploadS3Only          = "Presigned upload is supported only by S3-compatible providers (aws_s3, s3_compatible)."
	reasonPresignedMultipartUploadS3Only = "Presigned multipart upload is supported only by S3-compatible providers (aws_s3, s3_compatible)."
	reasonDirectUploadDisabledByConfig   = "Direct upload mode is disabled on this server (UPLOAD_DIRECT_STREAM=false)."
	reasonGcpProjectNumberRequired       = "GCS bucket operations require Project Number on this profile."
	reasonGcpAnonymousPolicyEndpoint     = "GCS IAM policy requires credentials, or anonymous mode with a custom endpoint that allows unauthenticated access."
)

const (
	profileValidationIssueGcpProjectNumberRequired = "gcp_project_number_required"
)

func providerCapabilityMatrix(uploadDirectStream bool) map[models.ProfileProvider]models.ProviderCapability {
	newBase := func() models.ProviderCapability {
		cap := models.ProviderCapability{
			BucketCRUD:   true,
			ObjectCRUD:   true,
			JobTransfer:  true,
			DirectUpload: uploadDirectStream,
		}
		if !uploadDirectStream {
			cap.Reasons = &models.ProviderCapabilityReasons{
				DirectUpload: reasonDirectUploadDisabledByConfig,
			}
		}
		return cap
	}

	out := map[models.ProfileProvider]models.ProviderCapability{
		models.ProfileProviderAwsS3:            newBase(),
		models.ProfileProviderS3Compatible:     newBase(),
		models.ProfileProviderAzureBlob:        newBase(),
		models.ProfileProviderGcpGcs:           newBase(),
		models.ProfileProviderOciObjectStorage: newBase(),
	}

	s3Like := []models.ProfileProvider{
		models.ProfileProviderAwsS3,
		models.ProfileProviderS3Compatible,
	}
	for _, provider := range s3Like {
		cap := out[provider]
		cap.BucketPolicy = true
		cap.PresignedUpload = true
		cap.PresignedMultipartUpload = true
		out[provider] = cap
	}

	azure := out[models.ProfileProviderAzureBlob]
	azure.AzureContainerAccessPolicy = true
	out[models.ProfileProviderAzureBlob] = azure

	gcs := out[models.ProfileProviderGcpGcs]
	gcs.GCSIAMPolicy = true
	out[models.ProfileProviderGcpGcs] = gcs

	for provider, cap := range out {
		cap.Governance = bucketgov.ProviderGovernanceCapabilities(provider)
		if !cap.BucketPolicy {
			ensureCapabilityReasons(&cap).BucketPolicy = reasonBucketPolicyS3Only
		}
		if !cap.GCSIAMPolicy {
			ensureCapabilityReasons(&cap).GCSIAMPolicy = reasonGCSIAMPolicyOnly
		}
		if !cap.AzureContainerAccessPolicy {
			ensureCapabilityReasons(&cap).AzureContainerAccessPolicy = reasonAzureContainerPolicyOnly
		}
		if !cap.PresignedUpload {
			ensureCapabilityReasons(&cap).PresignedUpload = reasonPresignedUploadS3Only
		}
		if !cap.PresignedMultipartUpload {
			ensureCapabilityReasons(&cap).PresignedMultipartUpload = reasonPresignedMultipartUploadS3Only
		}
		out[provider] = cap
	}

	return out
}

func decorateProfile(profile models.Profile, uploadDirectStream bool) models.Profile {
	effective := effectiveProviderCapability(profile, uploadDirectStream)
	validation := validateProfile(profile)
	profile.EffectiveCapabilities = &effective
	if !validation.Valid {
		profile.Validation = validation
	}
	return profile
}

func decorateProfiles(profiles []models.Profile, uploadDirectStream bool) []models.Profile {
	out := make([]models.Profile, len(profiles))
	for i, profile := range profiles {
		out[i] = decorateProfile(profile, uploadDirectStream)
	}
	return out
}

func effectiveProviderCapability(profile models.Profile, uploadDirectStream bool) models.ProviderCapability {
	base := providerCapabilityMatrix(uploadDirectStream)[profile.Provider]
	out := cloneProviderCapability(base)

	if profile.Provider != models.ProfileProviderGcpGcs {
		return out
	}

	if strings.TrimSpace(profile.ProjectNumber) == "" {
		out.BucketCRUD = false
		ensureCapabilityReasons(&out).BucketCRUD = reasonGcpProjectNumberRequired
	}

	if profile.Anonymous != nil && *profile.Anonymous && strings.TrimSpace(profile.Endpoint) == "" {
		out.GCSIAMPolicy = false
		ensureCapabilityReasons(&out).GCSIAMPolicy = reasonGcpAnonymousPolicyEndpoint
		setGovernanceCapability(&out, models.BucketGovernanceCapabilityAccessBindings, false, reasonGcpAnonymousPolicyEndpoint)
	}

	return out
}

func validateProfile(profile models.Profile) *models.ProfileValidation {
	issues := make([]models.ProfileValidationIssue, 0, 1)

	if profile.Provider == models.ProfileProviderGcpGcs && strings.TrimSpace(profile.ProjectNumber) == "" {
		issues = append(issues, models.ProfileValidationIssue{
			Code:    profileValidationIssueGcpProjectNumberRequired,
			Field:   "projectNumber",
			Message: "This GCS profile predates the required Project Number field. Edit the profile and add Project Number to restore bucket management.",
		})
	}

	return &models.ProfileValidation{
		Valid:  len(issues) == 0,
		Issues: issues,
	}
}

func cloneProviderCapability(cap models.ProviderCapability) models.ProviderCapability {
	if cap.Governance != nil {
		governance := make(models.BucketGovernanceCapabilities, len(cap.Governance))
		for key, value := range cap.Governance {
			governance[key] = value
		}
		cap.Governance = governance
	}
	if cap.Reasons == nil {
		return cap
	}
	reasons := *cap.Reasons
	cap.Reasons = &reasons
	return cap
}

func ensureCapabilityReasons(cap *models.ProviderCapability) *models.ProviderCapabilityReasons {
	if cap.Reasons == nil {
		cap.Reasons = &models.ProviderCapabilityReasons{}
	}
	return cap.Reasons
}

func setGovernanceCapability(cap *models.ProviderCapability, capability models.BucketGovernanceCapability, enabled bool, reason string) {
	if cap == nil {
		return
	}
	if cap.Governance == nil {
		cap.Governance = bucketgov.NewCapabilities()
	}
	if enabled {
		cap.Governance[capability] = bucketgov.EnabledCapability()
		return
	}
	cap.Governance[capability] = bucketgov.DisabledCapability(reason)
}
