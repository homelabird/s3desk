package bucketgov

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"strings"
	"sync"
	"time"

	"s3desk/internal/azureacl"
	"s3desk/internal/azurearmimmutability"
	"s3desk/internal/models"
)

type azureAdapter struct {
	getARMServiceProperties  func(context.Context, models.ProfileSecrets) (azurearmimmutability.Response, error)
	putARMVersioning         func(context.Context, models.ProfileSecrets, bool) (azurearmimmutability.Response, error)
	getPolicy                func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error)
	putPolicy                func(context.Context, models.ProfileSecrets, string, []byte) (azureacl.Response, error)
	getServiceProperties     func(context.Context, models.ProfileSecrets) (azureacl.Response, error)
	putServiceProperties     func(context.Context, models.ProfileSecrets, []byte) (azureacl.Response, error)
	getContainerProperties   func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error)
	getContainer             func(context.Context, models.ProfileSecrets, string) (azurearmimmutability.Response, error)
	setLegalHold             func(context.Context, models.ProfileSecrets, string, azurearmimmutability.LegalHoldRequest) (azurearmimmutability.Response, error)
	clearLegalHold           func(context.Context, models.ProfileSecrets, string, azurearmimmutability.LegalHoldRequest) (azurearmimmutability.Response, error)
	getImmutabilityPolicy    func(context.Context, models.ProfileSecrets, string) (azurearmimmutability.Response, error)
	putImmutabilityPolicy    func(context.Context, models.ProfileSecrets, string, azurearmimmutability.PutPolicyRequest) (azurearmimmutability.Response, error)
	deleteImmutabilityPolicy func(context.Context, models.ProfileSecrets, string, string) (azurearmimmutability.Response, error)
	lockImmutabilityPolicy   func(context.Context, models.ProfileSecrets, string, string) (azurearmimmutability.Response, error)
	extendImmutabilityPolicy func(context.Context, models.ProfileSecrets, string, azurearmimmutability.ExtendPolicyRequest) (azurearmimmutability.Response, error)
}

type azureLegalHold struct {
	HasLegalHold bool
	Tags         []string
}

type azureLegalHoldResource struct {
	Properties struct {
		LegalHold struct {
			HasLegalHold bool `json:"hasLegalHold"`
			Tags         []struct {
				Tag string `json:"tag"`
			} `json:"tags"`
		} `json:"legalHold"`
	} `json:"properties"`
}

type AzureAdapterOptions struct {
	AllowRemote bool
}

const azureMutationRollbackTimeout = 5 * time.Second

func NewAzureAdapter() Adapter {
	return NewAzureAdapterWithOptions(AzureAdapterOptions{})
}

func NewAzureAdapterWithOptions(opts AzureAdapterOptions) Adapter {
	armClient := azurearmimmutability.NewClientWithOptions(azurearmimmutability.ClientOptions{AllowRemote: opts.AllowRemote})
	return &azureAdapter{
		getARMServiceProperties: armClient.GetBlobServiceProperties,
		putARMVersioning:        armClient.PutBlobVersioning,
		getPolicy: func(ctx context.Context, profile models.ProfileSecrets, container string) (azureacl.Response, error) {
			return azureacl.GetContainerPolicyWithOptions(ctx, profile, container, azureacl.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		putPolicy: func(ctx context.Context, profile models.ProfileSecrets, container string, policyJSON []byte) (azureacl.Response, error) {
			return azureacl.PutContainerPolicyWithOptions(ctx, profile, container, policyJSON, azureacl.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		getServiceProperties: func(ctx context.Context, profile models.ProfileSecrets) (azureacl.Response, error) {
			return azureacl.GetBlobServicePropertiesWithOptions(ctx, profile, azureacl.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		putServiceProperties: func(ctx context.Context, profile models.ProfileSecrets, propsJSON []byte) (azureacl.Response, error) {
			return azureacl.PutBlobServicePropertiesWithOptions(ctx, profile, propsJSON, azureacl.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		getContainerProperties: func(ctx context.Context, profile models.ProfileSecrets, container string) (azureacl.Response, error) {
			return azureacl.GetContainerPropertiesWithOptions(ctx, profile, container, azureacl.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		getContainer: func(ctx context.Context, profile models.ProfileSecrets, container string) (azurearmimmutability.Response, error) {
			return azurearmimmutability.GetContainerWithOptions(ctx, profile, container, azurearmimmutability.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		setLegalHold: func(ctx context.Context, profile models.ProfileSecrets, container string, req azurearmimmutability.LegalHoldRequest) (azurearmimmutability.Response, error) {
			return azurearmimmutability.SetLegalHoldWithOptions(ctx, profile, container, req, azurearmimmutability.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		clearLegalHold: func(ctx context.Context, profile models.ProfileSecrets, container string, req azurearmimmutability.LegalHoldRequest) (azurearmimmutability.Response, error) {
			return azurearmimmutability.ClearLegalHoldWithOptions(ctx, profile, container, req, azurearmimmutability.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		getImmutabilityPolicy: func(ctx context.Context, profile models.ProfileSecrets, container string) (azurearmimmutability.Response, error) {
			return azurearmimmutability.GetPolicyWithOptions(ctx, profile, container, azurearmimmutability.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		putImmutabilityPolicy: func(ctx context.Context, profile models.ProfileSecrets, container string, req azurearmimmutability.PutPolicyRequest) (azurearmimmutability.Response, error) {
			return azurearmimmutability.PutPolicyWithOptions(ctx, profile, container, req, azurearmimmutability.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		deleteImmutabilityPolicy: func(ctx context.Context, profile models.ProfileSecrets, container string, ifMatch string) (azurearmimmutability.Response, error) {
			return azurearmimmutability.DeletePolicyWithOptions(ctx, profile, container, ifMatch, azurearmimmutability.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		lockImmutabilityPolicy: func(ctx context.Context, profile models.ProfileSecrets, container string, ifMatch string) (azurearmimmutability.Response, error) {
			return azurearmimmutability.LockPolicyWithOptions(ctx, profile, container, ifMatch, azurearmimmutability.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		extendImmutabilityPolicy: func(ctx context.Context, profile models.ProfileSecrets, container string, req azurearmimmutability.ExtendPolicyRequest) (azurearmimmutability.Response, error) {
			return azurearmimmutability.ExtendPolicyWithOptions(ctx, profile, container, req, azurearmimmutability.ClientOptions{AllowRemote: opts.AllowRemote})
		},
	}
}

func (a *azureAdapter) GetGovernance(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketGovernanceView, error) {
	view := NewView(models.ProfileProviderAzureBlob, bucket)
	view.Capabilities = ProviderGovernanceCapabilities(models.ProfileProviderAzureBlob)
	requestAdapter := *a
	if a.getPolicy != nil {
		getPolicy := sync.OnceValues(func() (azureacl.Response, error) {
			return a.getPolicy(ctx, profile, strings.TrimSpace(bucket))
		})
		requestAdapter.getPolicy = func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error) {
			return getPolicy()
		}
	}
	if a.getServiceProperties != nil {
		getServiceProperties := sync.OnceValues(func() (azureacl.Response, error) {
			return a.getServiceProperties(ctx, profile)
		})
		requestAdapter.getServiceProperties = func(context.Context, models.ProfileSecrets) (azureacl.Response, error) {
			return getServiceProperties()
		}
	}

	access, err := requestAdapter.GetAccess(ctx, profile, bucket)
	if err != nil {
		return models.BucketGovernanceView{}, err
	}
	view.Access = &access

	publicExposure, err := requestAdapter.GetPublicExposure(ctx, profile, bucket)
	if err != nil {
		return models.BucketGovernanceView{}, err
	}
	view.PublicExposure = &publicExposure

	protection, err := requestAdapter.GetProtection(ctx, profile, bucket)
	if err != nil {
		return models.BucketGovernanceView{}, err
	}
	view.Protection = &protection

	if !azurearmimmutability.HasConfig(profile) {
		SetCapability(&view, models.BucketGovernanceCapabilityVersioning, false, "Azure versioning requires ARM profile configuration")
		return view, nil
	}
	versioning, err := requestAdapter.GetVersioning(ctx, profile, bucket)
	if err != nil {
		return models.BucketGovernanceView{}, err
	}
	view.Versioning = &versioning

	return view, nil
}

func (a *azureAdapter) GetAccess(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketAccessView, error) {
	policy, err := a.getContainerPolicy(ctx, profile, bucket, "get bucket access controls", "bucket_access_error")
	if err != nil {
		return models.BucketAccessView{}, err
	}

	view := models.BucketAccessView{
		Provider: models.ProfileProviderAzureBlob,
		Bucket:   strings.TrimSpace(bucket),
	}
	for _, item := range policy.StoredAccessPolicies {
		view.StoredAccessPolicies = append(view.StoredAccessPolicies, models.BucketStoredAccessPolicy{
			ID:         strings.TrimSpace(item.ID),
			Start:      strings.TrimSpace(item.Start),
			Expiry:     strings.TrimSpace(item.Expiry),
			Permission: strings.TrimSpace(item.Permission),
		})
	}
	if len(view.StoredAccessPolicies) > 5 {
		view.Warnings = append(view.Warnings, "Azure returned more than 5 stored access policies; review container ACL state.")
	}
	return view, nil
}

func (a *azureAdapter) PutAccess(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketAccessPutRequest) error {

	current, err := a.getContainerPolicy(ctx, profile, bucket, "read current Azure container access policy", "bucket_access_error")
	if err != nil {
		return err
	}
	current.StoredAccessPolicies = make([]azureacl.StoredAccessPolicy, 0, len(req.StoredAccessPolicies))
	for _, item := range req.StoredAccessPolicies {
		current.StoredAccessPolicies = append(current.StoredAccessPolicies, azureacl.StoredAccessPolicy{
			ID:         strings.TrimSpace(item.ID),
			Start:      strings.TrimSpace(item.Start),
			Expiry:     strings.TrimSpace(item.Expiry),
			Permission: strings.TrimSpace(item.Permission),
		})
	}
	return a.putContainerPolicy(ctx, profile, bucket, current, "put bucket access controls", "bucket_access_error", "bucket_access_unconfirmed")
}

func (a *azureAdapter) GetPublicExposure(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketPublicExposureView, error) {
	policy, err := a.getContainerPolicy(ctx, profile, bucket, "get bucket public exposure", "bucket_public_exposure_error")
	if err != nil {
		return models.BucketPublicExposureView{}, err
	}

	visibility := normalizeAzurePublicAccess(policy.PublicAccess)
	return models.BucketPublicExposureView{
		Provider:   models.ProfileProviderAzureBlob,
		Bucket:     strings.TrimSpace(bucket),
		Mode:       visibility,
		Visibility: string(visibility),
	}, nil
}

func (a *azureAdapter) PutPublicExposure(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketPublicExposurePutRequest) error {

	current, err := a.getContainerPolicy(ctx, profile, bucket, "read current Azure container access policy", "bucket_public_exposure_error")
	if err != nil {
		return err
	}

	visibility, err := azureVisibilityFromRequest(req)
	if err != nil {
		return err
	}
	current.PublicAccess = string(visibility)
	return a.putContainerPolicy(ctx, profile, bucket, current, "put bucket public exposure", "bucket_public_exposure_error", "bucket_public_exposure_unconfirmed")
}

func azureStoredAccessPoliciesMatch(expected, observed []azureacl.StoredAccessPolicy) bool {
	if len(expected) != len(observed) {
		return false
	}
	counts := make(map[azureacl.StoredAccessPolicy]int, len(expected))
	for _, policy := range expected {
		counts[normalizeAzurePolicyTimes(policy)]++
	}
	for _, policy := range observed {
		policy = normalizeAzurePolicyTimes(policy)
		if counts[policy] == 0 {
			return false
		}
		counts[policy]--
	}
	return true
}

func normalizeAzurePolicyTimes(policy azureacl.StoredAccessPolicy) azureacl.StoredAccessPolicy {
	for _, value := range []*string{&policy.Start, &policy.Expiry} {
		if parsed, err := azureacl.ParseStoredPolicyTime(*value); err == nil {
			*value = parsed.UTC().Format(time.RFC3339Nano)
		}
	}
	return policy
}

func (a *azureAdapter) GetProtection(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketProtectionView, error) {
	props, err := a.getBlobServiceProperties(ctx, profile, bucket, "get Azure Blob service properties", "bucket_protection_error")
	if err != nil {
		return models.BucketProtectionView{}, err
	}
	containerProps, err := a.getAzureContainerProperties(ctx, profile, bucket, "get Azure container properties", "bucket_protection_error")
	if err != nil {
		return models.BucketProtectionView{}, err
	}

	view := models.BucketProtectionView{
		Provider: models.ProfileProviderAzureBlob,
		Bucket:   strings.TrimSpace(bucket),
		Warnings: []string{
			"Azure Blob versioning and soft delete settings are configured at the storage account level and affect all containers in this account.",
		},
	}
	if props.DeleteRetentionPolicy != nil {
		view.SoftDelete = &models.BucketSoftDeleteView{
			Enabled: props.DeleteRetentionPolicy.Enabled,
			Days:    props.DeleteRetentionPolicy.Days,
		}
	}
	view.Immutability = &models.BucketImmutabilityView{
		Enabled:           containerProps.HasImmutabilityPolicy,
		Editable:          azurearmimmutability.HasConfig(profile),
		LegalHold:         containerProps.HasLegalHold,
		LegalHoldEditable: azurearmimmutability.HasConfig(profile),
	}
	if azurearmimmutability.HasConfig(profile) {
		legalHold, err := a.getAzureLegalHold(ctx, profile, bucket, "get Azure container legal hold", "bucket_protection_error")
		if err != nil {
			view.Immutability.LegalHoldEditable = false
			view.Warnings = append(view.Warnings, "Azure legal hold lookup through ARM failed. Legal hold editing is disabled until the current tag set can be read safely.")
		} else if legalHold != nil {
			view.Immutability.LegalHold = legalHold.HasLegalHold
			view.Immutability.LegalHoldTags = legalHold.Tags
		}
		policy, err := a.getAzureImmutabilityPolicy(ctx, profile, bucket, "get Azure container immutability policy", "bucket_protection_error")
		if err != nil {
			view.Immutability.Editable = false
			view.Warnings = append(view.Warnings, "Azure immutability policy lookup through ARM failed. Immutability editing is disabled until its current policy can be read safely.")
		} else if policy != nil {
			applyAzureImmutabilityPolicy(view.Immutability, *policy)
		}
	} else if containerProps.HasImmutabilityPolicy || containerProps.HasLegalHold {
		view.Immutability.Enabled = containerProps.HasImmutabilityPolicy
		view.Warnings = append(view.Warnings, "Azure container immutability or legal hold is detected, but Azure ARM credentials are not configured on this profile. Add subscription, resource group, tenant, client ID, and client secret to edit it.")
	}
	return view, nil
}

func (a *azureAdapter) PutProtection(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketProtectionPutRequest) error {

	hasLegalHoldMutation := req.LegalHoldTags != nil
	if (req.Immutability != nil || hasLegalHoldMutation) && !azurearmimmutability.HasConfig(profile) {
		field := "immutability"
		message := "Azure immutability editing requires Azure ARM credentials on the profile"
		if req.Immutability == nil {
			field = "legalHoldTags"
			message = "Azure legal hold editing requires Azure ARM credentials on the profile"
		}
		return InvalidFieldError(field, message, map[string]any{
			"section":  "protection",
			"provider": models.ProfileProviderAzureBlob,
		})
	}
	var currentImmutability *azurearmimmutability.Policy
	if req.Immutability != nil {
		var err error
		currentImmutability, err = a.getAzureImmutabilityPolicy(ctx, profile, bucket, "read current Azure immutability policy", "bucket_protection_error")
		if err != nil {
			return err
		}
		if err := validateAzureImmutabilityChange(currentImmutability, *req.Immutability); err != nil {
			return err
		}
	}
	var currentLegalHold *azureLegalHold
	if hasLegalHoldMutation {
		var err error
		currentLegalHold, err = a.getAzureLegalHold(ctx, profile, bucket, "read current Azure container legal hold", "bucket_protection_error")
		if err != nil {
			return err
		}
		if currentLegalHold == nil {
			return UpstreamOperationError("bucket_protection_error", "failed to read current Azure container legal hold", bucket, fmt.Errorf("azure legal hold client is not configured"))
		}
		if _, err := normalizeAzureLegalHoldTags(req.LegalHoldTags); err != nil {
			return err
		}
	}
	var originalServiceProperties azureacl.ServiceProperties
	softDeleteChanged := false
	if req.SoftDelete != nil {
		props, err := a.getBlobServiceProperties(ctx, profile, bucket, "read current Azure Blob service properties", "bucket_protection_error")
		if err != nil {
			return err
		}
		originalServiceProperties = props
		if originalServiceProperties.DeleteRetentionPolicy == nil {
			return UpstreamOperationError("bucket_protection_error", "Azure soft delete state is missing; reload before editing", bucket, fmt.Errorf("missing delete retention policy"))
		}
		props.DeleteRetentionPolicy = &azureacl.DeleteRetentionPolicy{
			Enabled: req.SoftDelete.Enabled,
			Days:    req.SoftDelete.Days,
		}
		if err := a.putBlobServiceProperties(ctx, profile, bucket, props, "put Azure Blob service properties", "bucket_protection_error"); err != nil {
			return err
		}
		softDeleteChanged = true
	}
	if req.Immutability == nil {
		if hasLegalHoldMutation {
			if err := a.putAzureLegalHold(ctx, profile, bucket, currentLegalHold, req.LegalHoldTags); err != nil {
				if softDeleteChanged {
					return a.rollbackAzureServiceProperties(ctx, profile, bucket, originalServiceProperties, err)
				}
				return err
			}
		}
		return nil
	}
	if err := a.putAzureProtectionImmutability(ctx, profile, bucket, currentImmutability, *req.Immutability); err != nil {
		if softDeleteChanged {
			return a.rollbackAzureServiceProperties(ctx, profile, bucket, originalServiceProperties, err)
		}
		return err
	}
	if hasLegalHoldMutation {
		if err := a.putAzureLegalHold(ctx, profile, bucket, currentLegalHold, req.LegalHoldTags); err != nil {
			if softDeleteChanged {
				return a.rollbackAzureServiceProperties(ctx, profile, bucket, originalServiceProperties, err)
			}
			return err
		}
	}
	return nil
}

func (a *azureAdapter) rollbackAzureServiceProperties(ctx context.Context, profile models.ProfileSecrets, bucket string, original azureacl.ServiceProperties, cause error) error {
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), azureMutationRollbackTimeout)
	defer cancel()
	cleanupErr := a.putBlobServiceProperties(cleanupCtx, profile, bucket, original, "rollback Azure Blob service properties", "bucket_protection_error")
	if cleanupErr == nil {
		return cause
	}
	var operationErr *OperationError
	if errors.As(cause, &operationErr) {
		details := cloneDetails(operationErr.Details)
		details["cleanupError"] = cleanupErr.Error()
		operationErr.Details = details
		return cause
	}
	return fmt.Errorf("%w (Azure cleanup failed: %v)", cause, cleanupErr)
}

func (a *azureAdapter) GetVersioning(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketVersioningView, error) {
	if !azurearmimmutability.HasConfig(profile) || a.getARMServiceProperties == nil {
		return models.BucketVersioningView{}, InvalidFieldError("versioning", "Azure versioning requires ARM profile configuration", nil)
	}
	resp, err := a.getARMServiceProperties(ctx, profile)
	if err != nil {
		return models.BucketVersioningView{}, UpstreamOperationError("bucket_versioning_error", "failed to read Azure ARM versioning", bucket, err)
	}
	var resource struct {
		Properties struct {
			Enabled *bool `json:"isVersioningEnabled"`
		} `json:"properties"`
	}
	if resp.Status != http.StatusOK {
		return models.BucketVersioningView{}, UpstreamOperationError("bucket_versioning_error", "failed to read Azure ARM versioning", bucket, fmt.Errorf("azure ARM returned status %d", resp.Status))
	}
	if err := json.Unmarshal(resp.Body, &resource); err != nil || resource.Properties.Enabled == nil {
		return models.BucketVersioningView{}, UpstreamOperationError("bucket_versioning_error", "invalid Azure ARM versioning response", bucket, fmt.Errorf("missing or invalid isVersioningEnabled"))
	}
	view := models.BucketVersioningView{
		Provider: models.ProfileProviderAzureBlob,
		Bucket:   strings.TrimSpace(bucket),
		Status:   models.BucketVersioningStatusDisabled,
		Warnings: []string{
			"Azure Blob versioning is configured at the storage account level and affects all containers in this account.",
		},
	}
	if *resource.Properties.Enabled {
		view.Status = models.BucketVersioningStatusEnabled
	}
	return view, nil
}

func (a *azureAdapter) PutVersioning(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketVersioningPutRequest) error {
	if !azurearmimmutability.HasConfig(profile) || a.putARMVersioning == nil {
		return InvalidFieldError("versioning", "Azure versioning requires ARM profile configuration", nil)
	}
	resp, err := a.putARMVersioning(ctx, profile, req.Status == models.BucketVersioningStatusEnabled)
	if err != nil {
		return UpstreamOperationError("bucket_versioning_error", "failed to update Azure ARM versioning", bucket, err)
	}
	if resp.Status != http.StatusOK {
		return UpstreamOperationError("bucket_versioning_error", "failed to update Azure ARM versioning", bucket, fmt.Errorf("azure ARM returned status %d", resp.Status))
	}
	var resource struct {
		Properties struct {
			Enabled *bool `json:"isVersioningEnabled"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(resp.Body, &resource); err != nil || resource.Properties.Enabled == nil || *resource.Properties.Enabled != (req.Status == models.BucketVersioningStatusEnabled) {
		return UpstreamOperationError("bucket_versioning_error", "Azure ARM response did not confirm requested versioning; reload current settings before retrying", bucket, fmt.Errorf("missing, invalid, or mismatched isVersioningEnabled"))
	}
	return nil
}

func (a *azureAdapter) GetEncryption(context.Context, models.ProfileSecrets, string) (models.BucketEncryptionView, error) {
	return models.BucketEncryptionView{}, UnsupportedOperationError{Provider: models.ProfileProviderAzureBlob, Section: "encryption"}
}

func (a *azureAdapter) PutEncryption(context.Context, models.ProfileSecrets, string, models.BucketEncryptionPutRequest) error {
	return UnsupportedOperationError{Provider: models.ProfileProviderAzureBlob, Section: "encryption"}
}

func (a *azureAdapter) GetLifecycle(context.Context, models.ProfileSecrets, string) (models.BucketLifecycleView, error) {
	return models.BucketLifecycleView{}, UnsupportedOperationError{Provider: models.ProfileProviderAzureBlob, Section: "lifecycle"}
}

func (a *azureAdapter) PutLifecycle(context.Context, models.ProfileSecrets, string, models.BucketLifecyclePutRequest) error {
	return UnsupportedOperationError{Provider: models.ProfileProviderAzureBlob, Section: "lifecycle"}
}

func (a *azureAdapter) GetSharing(context.Context, models.ProfileSecrets, string) (models.BucketSharingView, error) {
	return models.BucketSharingView{}, UnsupportedOperationError{Provider: models.ProfileProviderAzureBlob, Section: "sharing"}
}

func (a *azureAdapter) PutSharing(context.Context, models.ProfileSecrets, string, models.BucketSharingPutRequest) (models.BucketSharingView, error) {
	return models.BucketSharingView{}, UnsupportedOperationError{Provider: models.ProfileProviderAzureBlob, Section: "sharing"}
}

func (a *azureAdapter) getContainerPolicy(ctx context.Context, profile models.ProfileSecrets, bucket, operation, code string) (azureacl.Policy, error) {
	if a.getPolicy == nil {
		return azureacl.Policy{}, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure container policy client is not configured"))
	}
	resp, err := a.getPolicy(ctx, profile, strings.TrimSpace(bucket))
	if err != nil {
		return azureacl.Policy{}, UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK:
		var policy *azureacl.Policy
		if err := json.Unmarshal(resp.Body, &policy); err != nil {
			return azureacl.Policy{}, UpstreamOperationError(code, "failed to decode Azure container policy", bucket, err)
		}
		if policy == nil {
			return azureacl.Policy{}, UpstreamOperationError(code, "failed to decode Azure container policy", bucket, fmt.Errorf("expected a policy object, received null"))
		}
		if policy.StoredAccessPolicies == nil {
			return azureacl.Policy{}, UpstreamOperationError(code, "failed to decode Azure container policy", bucket, fmt.Errorf("missing or null stored access policies"))
		}
		policy.PublicAccess = string(normalizeAzurePublicAccess(policy.PublicAccess))
		if policy.PublicAccess == "" {
			return azureacl.Policy{}, UpstreamOperationError(code, "failed to decode Azure container policy", bucket, fmt.Errorf("missing or unknown public access level"))
		}
		return *policy, nil
	case http.StatusNotFound:
		return azureacl.Policy{}, BucketNotFoundError(bucket)
	default:
		return azureacl.Policy{}, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
}

func (a *azureAdapter) putContainerPolicy(ctx context.Context, profile models.ProfileSecrets, bucket string, policy azureacl.Policy, operation, code, unconfirmedCode string) error {
	body, err := json.Marshal(policy)
	if err != nil {
		return UpstreamOperationError(code, "failed to encode Azure container policy", bucket, err)
	}
	resp, writeErr := a.putPolicy(ctx, profile, strings.TrimSpace(bucket), body)
	if writeErr != nil {
		writeErr = UpstreamOperationError(code, "failed to "+operation, bucket, writeErr)
	} else {
		switch resp.Status {
		case http.StatusOK, http.StatusNoContent:
		case http.StatusNotFound:
			writeErr = BucketNotFoundError(bucket)
		default:
			writeErr = UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
		}
	}
	readCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	observed, readErr := a.getContainerPolicy(readCtx, profile, bucket, "confirm Azure container access policy", code)
	if writeErr != nil {
		return writeErr
	}
	if readErr != nil || observed.PublicAccess != policy.PublicAccess || !azureStoredAccessPoliciesMatch(policy.StoredAccessPolicies, observed.StoredAccessPolicies) {
		return UpstreamOperationError(unconfirmedCode, "Azure access policy update was accepted but current state did not confirm the request; reload before retrying", bucket, fmt.Errorf("access policy readback failed or differed"))
	}
	return nil
}

func (a *azureAdapter) getBlobServiceProperties(ctx context.Context, profile models.ProfileSecrets, bucket, operation, code string) (azureacl.ServiceProperties, error) {
	if a.getServiceProperties == nil {
		return azureacl.ServiceProperties{}, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure service properties client is not configured"))
	}
	resp, err := a.getServiceProperties(ctx, profile)
	if err != nil {
		return azureacl.ServiceProperties{}, UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK:
		var props *azureacl.ServiceProperties
		if err := json.Unmarshal(resp.Body, &props); err != nil {
			return azureacl.ServiceProperties{}, UpstreamOperationError(code, "failed to decode Azure Blob service properties", bucket, err)
		}
		if props == nil {
			return azureacl.ServiceProperties{}, UpstreamOperationError(code, "failed to decode Azure Blob service properties", bucket, fmt.Errorf("expected a service properties object, received null"))
		}
		var required struct {
			Policy *struct {
				Enabled *bool `json:"enabled"`
			} `json:"deleteRetentionPolicy"`
		}
		if err := json.Unmarshal(resp.Body, &required); err != nil || (required.Policy != nil && required.Policy.Enabled == nil) {
			return azureacl.ServiceProperties{}, UpstreamOperationError(code, "invalid Azure soft delete state", bucket, fmt.Errorf("missing enabled flag"))
		}
		return *props, nil
	default:
		return azureacl.ServiceProperties{}, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
}

func (a *azureAdapter) putBlobServiceProperties(ctx context.Context, profile models.ProfileSecrets, bucket string, props azureacl.ServiceProperties, operation, code string) error {
	if a.putServiceProperties == nil {
		return UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure service properties client is not configured"))
	}
	body, err := json.Marshal(props)
	if err != nil {
		return UpstreamOperationError(code, "failed to encode Azure Blob service properties", bucket, err)
	}
	resp, err := a.putServiceProperties(ctx, profile, body)
	readCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	observed, readErr := a.getBlobServiceProperties(readCtx, profile, bucket, "confirm Azure Blob service properties", code)
	if err != nil {
		return UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK, http.StatusAccepted, http.StatusNoContent:
		want, got := props.DeleteRetentionPolicy, observed.DeleteRetentionPolicy
		if readErr != nil || (want != nil && (got == nil || want.Enabled != got.Enabled || (want.Enabled && !reflect.DeepEqual(want.Days, got.Days)))) {
			return UpstreamOperationError("bucket_protection_unconfirmed", "Azure soft delete update was accepted but current state did not confirm the request; reload before retrying", bucket, fmt.Errorf("soft delete readback failed or differed"))
		}
		return nil
	default:
		return UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
}

func (a *azureAdapter) getAzureContainerProperties(ctx context.Context, profile models.ProfileSecrets, bucket, operation, code string) (azureacl.ContainerProperties, error) {
	if a.getContainerProperties == nil {
		return azureacl.ContainerProperties{}, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure container properties client is not configured"))
	}
	resp, err := a.getContainerProperties(ctx, profile, strings.TrimSpace(bucket))
	if err != nil {
		return azureacl.ContainerProperties{}, UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK:
		var props *azureacl.ContainerProperties
		if err := json.Unmarshal(resp.Body, &props); err != nil {
			return azureacl.ContainerProperties{}, UpstreamOperationError(code, "failed to decode Azure container properties", bucket, err)
		}
		if props == nil {
			return azureacl.ContainerProperties{}, UpstreamOperationError(code, "failed to decode Azure container properties", bucket, fmt.Errorf("expected container properties object, received null"))
		}
		return *props, nil
	case http.StatusNotFound:
		return azureacl.ContainerProperties{}, BucketNotFoundError(bucket)
	default:
		return azureacl.ContainerProperties{}, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
}

func normalizeAzurePublicAccess(value string) models.BucketPublicExposureMode {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "blob":
		return models.BucketPublicExposureModeBlob
	case "container":
		return models.BucketPublicExposureModeContainer
	case "private":
		return models.BucketPublicExposureModePrivate
	default:
		return ""
	}
}

func azureVisibilityFromRequest(req models.BucketPublicExposurePutRequest) (models.BucketPublicExposureMode, error) {
	value := strings.ToLower(strings.TrimSpace(req.Visibility))
	if value == "" {
		value = strings.ToLower(strings.TrimSpace(string(req.Mode)))
	}
	switch models.BucketPublicExposureMode(value) {
	case models.BucketPublicExposureModePrivate:
		return models.BucketPublicExposureModePrivate, nil
	case models.BucketPublicExposureModeBlob:
		return models.BucketPublicExposureModeBlob, nil
	case models.BucketPublicExposureModeContainer:
		return models.BucketPublicExposureModeContainer, nil
	default:
		return "", InvalidEnumFieldError("mode", value,
			string(models.BucketPublicExposureModePrivate),
			string(models.BucketPublicExposureModeBlob),
			string(models.BucketPublicExposureModeContainer),
		)
	}
}

func (a *azureAdapter) getAzureImmutabilityPolicy(ctx context.Context, profile models.ProfileSecrets, bucket, operation, code string) (*azurearmimmutability.Policy, error) {
	if a.getImmutabilityPolicy == nil {
		return nil, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure immutability client is not configured"))
	}
	resp, err := a.getImmutabilityPolicy(ctx, profile, strings.TrimSpace(bucket))
	if err != nil {
		return nil, UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK:
		var policy *azurearmimmutability.Policy
		if err := json.Unmarshal(resp.Body, &policy); err != nil {
			return nil, UpstreamOperationError(code, "failed to decode Azure immutability policy", bucket, err)
		}
		if policy == nil {
			return nil, UpstreamOperationError(code, "failed to decode Azure immutability policy", bucket, fmt.Errorf("expected an immutability policy object, received null"))
		}
		if strings.TrimSpace(policy.ETag) == "" {
			policy.ETag = strings.TrimSpace(resp.Headers.Get("Etag"))
		}
		return policy, nil
	case http.StatusNotFound:
		return nil, nil
	default:
		return nil, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure arm returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
}

func (a *azureAdapter) getAzureLegalHold(ctx context.Context, profile models.ProfileSecrets, bucket, operation, code string) (*azureLegalHold, error) {
	if a.getContainer == nil {
		return nil, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure legal hold client is not configured"))
	}
	resp, err := a.getContainer(ctx, profile, strings.TrimSpace(bucket))
	if err != nil {
		return nil, UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK:
		var resource *azureLegalHoldResource
		if err := json.Unmarshal(resp.Body, &resource); err != nil {
			return nil, UpstreamOperationError(code, "failed to decode Azure container legal hold", bucket, err)
		}
		if resource == nil {
			return nil, UpstreamOperationError(code, "failed to decode Azure container legal hold", bucket, fmt.Errorf("expected a container resource object, received null"))
		}
		tags := make([]string, 0, len(resource.Properties.LegalHold.Tags))
		for _, item := range resource.Properties.LegalHold.Tags {
			tag := strings.ToLower(strings.TrimSpace(item.Tag))
			if tag != "" {
				tags = append(tags, tag)
			}
		}
		return &azureLegalHold{
			HasLegalHold: resource.Properties.LegalHold.HasLegalHold || len(tags) > 0,
			Tags:         tags,
		}, nil
	default:
		return nil, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure arm returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
}

func (a *azureAdapter) putAzureLegalHold(ctx context.Context, profile models.ProfileSecrets, bucket string, current *azureLegalHold, desired []string) (result error) {
	if current == nil {
		return UpstreamOperationError("bucket_protection_error", "failed to update Azure container legal hold", bucket, fmt.Errorf("current Azure legal hold is unavailable"))
	}
	normalizedDesired, err := normalizeAzureLegalHoldTags(desired)
	if err != nil {
		return err
	}
	normalizedCurrent, err := normalizeAzureLegalHoldTags(current.Tags)
	if err != nil {
		return err
	}
	defer func() {
		readCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		observed, readErr := a.getAzureLegalHold(readCtx, profile, bucket, "confirm Azure legal hold", "bucket_protection_error")
		if result != nil {
			return
		}
		matches := false
		if readErr == nil && observed != nil {
			actual, err := normalizeAzureLegalHoldTags(observed.Tags)
			if err == nil {
				removed, added := diffAzureLegalHoldTags(actual, normalizedDesired)
				matches = len(removed) == 0 && len(added) == 0 && observed.HasLegalHold == (len(normalizedDesired) > 0)
			}
		}
		if !matches {
			result = UpstreamOperationError("bucket_protection_unconfirmed", "Azure legal hold update did not confirm the requested state; reload before retrying", bucket, fmt.Errorf("legal hold readback failed or differed"))
		}
	}()
	clearTags, setTags := diffAzureLegalHoldTags(normalizedCurrent, normalizedDesired)
	if len(clearTags) == 0 && len(setTags) == 0 {
		return nil
	}
	if len(clearTags) > 0 {
		if err := a.mutateAzureLegalHold(ctx, profile, bucket, clearTags, false, "clear Azure container legal hold", "bucket_protection_error"); err != nil {
			return err
		}
	}
	if len(setTags) == 0 {
		return nil
	}
	if err := a.mutateAzureLegalHold(ctx, profile, bucket, setTags, true, "set Azure container legal hold", "bucket_protection_error"); err != nil {
		if len(clearTags) > 0 {
			cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), azureMutationRollbackTimeout)
			cleanupErr := a.restoreAzureLegalHoldTags(cleanupCtx, profile, bucket, setTags, clearTags)
			cancel()
			if cleanupErr != nil {
				var operationErr *OperationError
				if errors.As(err, &operationErr) {
					details := cloneDetails(operationErr.Details)
					details["cleanupError"] = cleanupErr.Error()
					operationErr.Details = details
					return err
				}
				return fmt.Errorf("%w (Azure cleanup failed: %v)", err, cleanupErr)
			}
		}
		return err
	}
	return nil
}

func (a *azureAdapter) restoreAzureLegalHoldTags(ctx context.Context, profile models.ProfileSecrets, bucket string, added, removed []string) error {
	var cleanupErr error
	if len(added) > 0 {
		cleanupErr = errors.Join(cleanupErr, a.mutateAzureLegalHold(ctx, profile, bucket, added, false, "clear Azure container legal hold during rollback", "bucket_protection_error"))
	}
	if len(removed) > 0 {
		cleanupErr = errors.Join(cleanupErr, a.mutateAzureLegalHold(ctx, profile, bucket, removed, true, "restore Azure container legal hold", "bucket_protection_error"))
	}
	return cleanupErr
}

func (a *azureAdapter) mutateAzureLegalHold(ctx context.Context, profile models.ProfileSecrets, bucket string, tags []string, set bool, operation, code string) error {
	var mutate func(context.Context, models.ProfileSecrets, string, azurearmimmutability.LegalHoldRequest) (azurearmimmutability.Response, error)
	if set {
		mutate = a.setLegalHold
	} else {
		mutate = a.clearLegalHold
	}
	if mutate == nil {
		return UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure legal hold client is not configured"))
	}
	resp, err := mutate(ctx, profile, strings.TrimSpace(bucket), azurearmimmutability.LegalHoldRequest{Tags: tags})
	if err != nil {
		return UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	if resp.Status != http.StatusOK {
		return UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure arm returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
	return nil
}

func normalizeAzureLegalHoldTags(tags []string) ([]string, error) {
	seen := make(map[string]struct{}, len(tags))
	normalized := make([]string, 0, len(tags))
	for index, raw := range tags {
		tag := strings.ToLower(strings.TrimSpace(raw))
		field := fmt.Sprintf("legalHoldTags[%d]", index)
		if len(tag) < 3 || len(tag) > 23 {
			return nil, InvalidFieldError(field, "legal hold tags must contain 3 to 23 characters", map[string]any{"section": "protection"})
		}
		for _, char := range tag {
			if !((char >= 'a' && char <= 'z') || (char >= '0' && char <= '9')) {
				return nil, InvalidFieldError(field, "legal hold tags must be alphanumeric", map[string]any{"section": "protection"})
			}
		}
		if _, ok := seen[tag]; ok {
			return nil, InvalidFieldError(field, "legal hold tags must be unique", map[string]any{"section": "protection"})
		}
		seen[tag] = struct{}{}
		normalized = append(normalized, tag)
	}
	return normalized, nil
}

func diffAzureLegalHoldTags(current, desired []string) (clear, set []string) {
	currentSet := make(map[string]struct{}, len(current))
	desiredSet := make(map[string]struct{}, len(desired))
	for _, tag := range current {
		currentSet[tag] = struct{}{}
	}
	for _, tag := range desired {
		desiredSet[tag] = struct{}{}
	}
	for _, tag := range current {
		if _, ok := desiredSet[tag]; !ok {
			clear = append(clear, tag)
		}
	}
	for _, tag := range desired {
		if _, ok := currentSet[tag]; !ok {
			set = append(set, tag)
		}
	}
	return clear, set
}

func (a *azureAdapter) putAzureProtectionImmutability(ctx context.Context, profile models.ProfileSecrets, bucket string, current *azurearmimmutability.Policy, req models.BucketImmutabilityView) (result error) {
	if err := validateAzureImmutabilityChange(current, req); err != nil {
		return err
	}

	mode := normalizeAzureImmutabilityState(req.Mode)
	if mode == "" {
		mode = "unlocked"
	}

	defer func() {
		readCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		observed, readErr := a.getAzureImmutabilityPolicy(readCtx, profile, bucket, "confirm Azure immutability policy", "bucket_protection_error")
		if result != nil {
			return
		}
		matches := readErr == nil && observed == nil && !req.Enabled
		if readErr == nil && observed != nil && req.Enabled && req.Days != nil {
			matches = normalizeAzureImmutabilityState(observed.Properties.State) == mode &&
				observed.Properties.ImmutabilityPeriodSinceCreationInDays == *req.Days &&
				observed.Properties.AllowProtectedAppendWrites == req.AllowProtectedAppendWrites &&
				observed.Properties.AllowProtectedAppendWritesAll == req.AllowProtectedAppendWritesAll
		}
		if !matches {
			result = UpstreamOperationError("bucket_protection_unconfirmed", "Azure immutability update did not confirm the requested state; reload before retrying", bucket, fmt.Errorf("immutability readback failed or differed"))
		}
	}()

	if !req.Enabled {
		if current == nil {
			return nil
		}
		if normalizeAzureImmutabilityState(current.Properties.State) == "locked" {
			return InvalidFieldError("immutability.enabled", "locked Azure immutability policies cannot be disabled", map[string]any{
				"section":  "protection",
				"provider": models.ProfileProviderAzureBlob,
			})
		}
		ifMatch := strings.TrimSpace(req.ETag)
		return a.deleteAzureImmutability(ctx, profile, bucket, ifMatch, "delete Azure immutability policy", "bucket_protection_error")
	}

	if req.Days == nil || *req.Days <= 0 {
		return InvalidFieldError("immutability.days", "immutability.days must be greater than zero when Azure immutability is enabled", map[string]any{
			"section": "protection",
		})
	}

	if current == nil {
		policy, err := a.putAzureImmutability(ctx, profile, bucket, azurearmimmutability.PutPolicyRequest{
			Days:                          *req.Days,
			AllowProtectedAppendWrites:    azureBoolPtrIfTrue(req.AllowProtectedAppendWrites),
			AllowProtectedAppendWritesAll: azureBoolPtrIfTrue(req.AllowProtectedAppendWritesAll),
		}, "create Azure immutability policy", "bucket_protection_error")
		if err != nil {
			return err
		}
		if mode == "locked" {
			return a.lockAzureImmutability(ctx, profile, bucket, policy.ETag, "lock Azure immutability policy", "bucket_protection_error")
		}
		return nil
	}

	currentMode := normalizeAzureImmutabilityState(current.Properties.State)
	if currentMode == "locked" {
		if mode == "unlocked" {
			return InvalidFieldError("immutability.mode", "locked Azure immutability policies cannot be changed back to unlocked", map[string]any{
				"section": "protection",
			})
		}
		if *req.Days < current.Properties.ImmutabilityPeriodSinceCreationInDays {
			return InvalidFieldError("immutability.days", "locked Azure immutability policies can only be extended", map[string]any{
				"section":     "protection",
				"currentDays": current.Properties.ImmutabilityPeriodSinceCreationInDays,
			})
		}
		if req.AllowProtectedAppendWrites != current.Properties.AllowProtectedAppendWrites ||
			req.AllowProtectedAppendWritesAll != current.Properties.AllowProtectedAppendWritesAll {
			return InvalidFieldError("immutability", "allowProtectedAppendWrites settings cannot be changed after an Azure immutability policy is locked", map[string]any{
				"section": "protection",
			})
		}
		if *req.Days == current.Properties.ImmutabilityPeriodSinceCreationInDays {
			return nil
		}
		ifMatch := strings.TrimSpace(req.ETag)
		return a.extendAzureImmutability(ctx, profile, bucket, azurearmimmutability.ExtendPolicyRequest{
			Days:    *req.Days,
			IfMatch: ifMatch,
		}, "extend Azure immutability policy", "bucket_protection_error")
	}

	ifMatch := strings.TrimSpace(req.ETag)
	policy, err := a.putAzureImmutability(ctx, profile, bucket, azurearmimmutability.PutPolicyRequest{
		Days:                          *req.Days,
		IfMatch:                       ifMatch,
		AllowProtectedAppendWrites:    azureBoolPtr(req.AllowProtectedAppendWrites),
		AllowProtectedAppendWritesAll: azureBoolPtr(req.AllowProtectedAppendWritesAll),
	}, "update Azure immutability policy", "bucket_protection_error")
	if err != nil {
		return err
	}
	if mode == "locked" {
		return a.lockAzureImmutability(ctx, profile, bucket, policy.ETag, "lock Azure immutability policy", "bucket_protection_error")
	}
	return nil
}

func validateAzureImmutabilityChange(current *azurearmimmutability.Policy, req models.BucketImmutabilityView) error {
	revision := strings.TrimSpace(req.ETag)
	if current != nil && revision == "" {
		return InvalidFieldError("immutability.etag", "Azure immutability edits require the loaded policy ETag; reload before saving", nil)
	}
	if (current == nil && revision != "") || (current != nil && (strings.TrimSpace(current.ETag) == "" || revision != strings.TrimSpace(current.ETag))) {
		return &OperationError{Status: http.StatusConflict, Code: "bucket_policy_conflict", Message: "Azure immutability policy changed or its revision is unavailable; reload and review before retrying"}
	}

	mode := normalizeAzureImmutabilityState(req.Mode)
	if mode == "" {
		mode = "unlocked"
	}

	if !req.Enabled {
		if current != nil && normalizeAzureImmutabilityState(current.Properties.State) == "locked" {
			return InvalidFieldError("immutability.enabled", "locked Azure immutability policies cannot be disabled", map[string]any{
				"section":  "protection",
				"provider": models.ProfileProviderAzureBlob,
			})
		}
		return nil
	}

	if req.Days == nil || *req.Days <= 0 {
		return InvalidFieldError("immutability.days", "immutability.days must be greater than zero when Azure immutability is enabled", map[string]any{
			"section": "protection",
		})
	}
	if current == nil || normalizeAzureImmutabilityState(current.Properties.State) != "locked" {
		return nil
	}
	if mode == "unlocked" {
		return InvalidFieldError("immutability.mode", "locked Azure immutability policies cannot be changed back to unlocked", map[string]any{
			"section": "protection",
		})
	}
	if *req.Days < current.Properties.ImmutabilityPeriodSinceCreationInDays {
		return InvalidFieldError("immutability.days", "locked Azure immutability policies can only be extended", map[string]any{
			"section":     "protection",
			"currentDays": current.Properties.ImmutabilityPeriodSinceCreationInDays,
		})
	}
	if req.AllowProtectedAppendWrites != current.Properties.AllowProtectedAppendWrites ||
		req.AllowProtectedAppendWritesAll != current.Properties.AllowProtectedAppendWritesAll {
		return InvalidFieldError("immutability", "allowProtectedAppendWrites settings cannot be changed after an Azure immutability policy is locked", map[string]any{
			"section": "protection",
		})
	}
	return nil
}

func (a *azureAdapter) putAzureImmutability(ctx context.Context, profile models.ProfileSecrets, bucket string, req azurearmimmutability.PutPolicyRequest, operation, code string) (*azurearmimmutability.Policy, error) {
	if a.putImmutabilityPolicy == nil {
		return nil, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure immutability client is not configured"))
	}
	resp, err := a.putImmutabilityPolicy(ctx, profile, strings.TrimSpace(bucket), req)
	if err != nil {
		return nil, UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK, http.StatusCreated:
		var policy *azurearmimmutability.Policy
		if err := json.Unmarshal(resp.Body, &policy); err != nil {
			return nil, UpstreamOperationError(code, "failed to decode Azure immutability policy", bucket, err)
		}
		if policy == nil {
			return nil, UpstreamOperationError(code, "failed to decode Azure immutability policy", bucket, fmt.Errorf("expected an immutability policy object, received null"))
		}
		if strings.TrimSpace(policy.ETag) == "" {
			policy.ETag = strings.TrimSpace(resp.Headers.Get("Etag"))
		}
		return policy, nil
	case http.StatusConflict, http.StatusPreconditionFailed:
		return nil, &OperationError{Status: http.StatusConflict, Code: "bucket_policy_conflict", Message: "Azure immutability policy changed; reload and review before retrying"}
	default:
		return nil, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure arm returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
}

func (a *azureAdapter) deleteAzureImmutability(ctx context.Context, profile models.ProfileSecrets, bucket string, ifMatch string, operation, code string) error {
	if a.deleteImmutabilityPolicy == nil {
		return UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure immutability client is not configured"))
	}
	resp, err := a.deleteImmutabilityPolicy(ctx, profile, strings.TrimSpace(bucket), ifMatch)
	if err != nil {
		return UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK, http.StatusNoContent:
		return nil
	case http.StatusConflict, http.StatusPreconditionFailed:
		return &OperationError{Status: http.StatusConflict, Code: "bucket_policy_conflict", Message: "Azure immutability policy changed; reload and review before retrying"}
	default:
		return UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure arm returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
}

func (a *azureAdapter) lockAzureImmutability(ctx context.Context, profile models.ProfileSecrets, bucket string, ifMatch string, operation, code string) error {
	if strings.TrimSpace(ifMatch) == "" {
		return UpstreamOperationError("bucket_protection_unconfirmed", "Azure policy update returned no revision; reload before locking", bucket, fmt.Errorf("missing policy ETag"))
	}
	if a.lockImmutabilityPolicy == nil {
		return UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure immutability client is not configured"))
	}
	resp, err := a.lockImmutabilityPolicy(ctx, profile, strings.TrimSpace(bucket), ifMatch)
	if err != nil {
		return UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK:
		return nil
	case http.StatusConflict, http.StatusPreconditionFailed:
		return &OperationError{Status: http.StatusConflict, Code: "bucket_policy_conflict", Message: "Azure immutability policy changed; reload and review before retrying"}
	default:
		return UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure arm returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
}

func (a *azureAdapter) extendAzureImmutability(ctx context.Context, profile models.ProfileSecrets, bucket string, req azurearmimmutability.ExtendPolicyRequest, operation, code string) error {
	if a.extendImmutabilityPolicy == nil {
		return UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure immutability client is not configured"))
	}
	resp, err := a.extendImmutabilityPolicy(ctx, profile, strings.TrimSpace(bucket), req)
	if err != nil {
		return UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK:
		return nil
	case http.StatusConflict, http.StatusPreconditionFailed:
		return &OperationError{Status: http.StatusConflict, Code: "bucket_policy_conflict", Message: "Azure immutability policy changed; reload and review before retrying"}
	default:
		return UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure arm returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
}

func applyAzureImmutabilityPolicy(view *models.BucketImmutabilityView, policy azurearmimmutability.Policy) {
	if view == nil {
		return
	}
	view.Enabled = true
	view.Mode = normalizeAzureImmutabilityState(policy.Properties.State)
	view.ETag = strings.TrimSpace(policy.ETag)
	view.Editable = true
	if policy.Properties.ImmutabilityPeriodSinceCreationInDays > 0 {
		days := policy.Properties.ImmutabilityPeriodSinceCreationInDays
		view.Days = &days
	}
	view.AllowProtectedAppendWrites = policy.Properties.AllowProtectedAppendWrites
	view.AllowProtectedAppendWritesAll = policy.Properties.AllowProtectedAppendWritesAll
}

func normalizeAzureImmutabilityState(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "locked":
		return "locked"
	case "unlocked":
		return "unlocked"
	default:
		return ""
	}
}

func azureBoolPtr(value bool) *bool {
	ptr := new(bool)
	*ptr = value
	return ptr
}

func azureBoolPtrIfTrue(value bool) *bool {
	if !value {
		return nil
	}
	return azureBoolPtr(true)
}
