package bucketgov

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"s3desk/internal/azureacl"
	"s3desk/internal/azurearmimmutability"
	"s3desk/internal/models"
)

type azureAdapter struct {
	getPolicy              func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error)
	putPolicy              func(context.Context, models.ProfileSecrets, string, []byte) (azureacl.Response, error)
	getServiceProperties   func(context.Context, models.ProfileSecrets) (azureacl.Response, error)
	putServiceProperties   func(context.Context, models.ProfileSecrets, []byte) (azureacl.Response, error)
	getContainerProperties func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error)
	getImmutabilityPolicy  func(context.Context, models.ProfileSecrets, string) (azurearmimmutability.Response, error)
	putImmutabilityPolicy  func(context.Context, models.ProfileSecrets, string, azurearmimmutability.PutPolicyRequest) (azurearmimmutability.Response, error)
	deleteImmutabilityPolicy func(context.Context, models.ProfileSecrets, string, string) (azurearmimmutability.Response, error)
	lockImmutabilityPolicy func(context.Context, models.ProfileSecrets, string, string) (azurearmimmutability.Response, error)
	extendImmutabilityPolicy func(context.Context, models.ProfileSecrets, string, azurearmimmutability.ExtendPolicyRequest) (azurearmimmutability.Response, error)
}

func NewAzureAdapter() Adapter {
	return &azureAdapter{
		getPolicy:              azureacl.GetContainerPolicy,
		putPolicy:              azureacl.PutContainerPolicy,
		getServiceProperties:   azureacl.GetBlobServiceProperties,
		putServiceProperties:   azureacl.PutBlobServiceProperties,
		getContainerProperties: azureacl.GetContainerProperties,
		getImmutabilityPolicy:  azurearmimmutability.GetPolicy,
		putImmutabilityPolicy:  azurearmimmutability.PutPolicy,
		deleteImmutabilityPolicy: azurearmimmutability.DeletePolicy,
		lockImmutabilityPolicy: azurearmimmutability.LockPolicy,
		extendImmutabilityPolicy: azurearmimmutability.ExtendPolicy,
	}
}

func (a *azureAdapter) GetGovernance(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketGovernanceView, error) {
	view := NewView(models.ProfileProviderAzureBlob, bucket)
	view.Capabilities = ProviderGovernanceCapabilities(models.ProfileProviderAzureBlob)

	access, err := a.GetAccess(ctx, profile, bucket)
	if err != nil {
		return models.BucketGovernanceView{}, err
	}
	view.Access = &access

	publicExposure, err := a.GetPublicExposure(ctx, profile, bucket)
	if err != nil {
		return models.BucketGovernanceView{}, err
	}
	view.PublicExposure = &publicExposure

	protection, err := a.GetProtection(ctx, profile, bucket)
	if err != nil {
		return models.BucketGovernanceView{}, err
	}
	view.Protection = &protection

	versioning, err := a.GetVersioning(ctx, profile, bucket)
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
	if err := ValidateAccessPut(models.ProfileProviderAzureBlob, req); err != nil {
		return err
	}

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
	return a.putContainerPolicy(ctx, profile, bucket, current, "put bucket access controls", "bucket_access_error")
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
	if err := ValidatePublicExposurePut(models.ProfileProviderAzureBlob, req); err != nil {
		return err
	}

	current, err := a.getContainerPolicy(ctx, profile, bucket, "read current Azure container access policy", "bucket_public_exposure_error")
	if err != nil {
		return err
	}

	visibility, err := azureVisibilityFromRequest(req)
	if err != nil {
		return err
	}
	current.PublicAccess = string(visibility)
	return a.putContainerPolicy(ctx, profile, bucket, current, "put bucket public exposure", "bucket_public_exposure_error")
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
		Enabled:   false,
		Editable:  azurearmimmutability.HasConfig(profile),
		LegalHold: containerProps.HasLegalHold,
	}
	if azurearmimmutability.HasConfig(profile) {
		policy, err := a.getAzureImmutabilityPolicy(ctx, profile, bucket, "get Azure container immutability policy", "bucket_protection_error")
		if err != nil {
			view.Warnings = append(view.Warnings, "Azure immutability policy lookup through ARM failed. Soft delete and versioning remain available, but immutability details may be stale.")
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
	if err := ValidateProtectionPut(models.ProfileProviderAzureBlob, req); err != nil {
		return err
	}

	if req.SoftDelete != nil {
		props, err := a.getBlobServiceProperties(ctx, profile, bucket, "read current Azure Blob service properties", "bucket_protection_error")
		if err != nil {
			return err
		}
		props.DeleteRetentionPolicy = &azureacl.DeleteRetentionPolicy{
			Enabled: req.SoftDelete.Enabled,
			Days:    req.SoftDelete.Days,
		}
		if err := a.putBlobServiceProperties(ctx, profile, bucket, props, "put Azure Blob service properties", "bucket_protection_error"); err != nil {
			return err
		}
	}
	if req.Immutability == nil {
		return nil
	}
	if !azurearmimmutability.HasConfig(profile) {
		return InvalidFieldError("immutability", "Azure immutability editing requires Azure ARM credentials on the profile", map[string]any{
			"section": "protection",
			"provider": models.ProfileProviderAzureBlob,
		})
	}
	return a.putAzureProtectionImmutability(ctx, profile, bucket, *req.Immutability)
}

func (a *azureAdapter) GetVersioning(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketVersioningView, error) {
	props, err := a.getBlobServiceProperties(ctx, profile, bucket, "get Azure Blob service properties", "bucket_versioning_error")
	if err != nil {
		return models.BucketVersioningView{}, err
	}
	view := models.BucketVersioningView{
		Provider: models.ProfileProviderAzureBlob,
		Bucket:   strings.TrimSpace(bucket),
		Status:   models.BucketVersioningStatusDisabled,
		Warnings: []string{
			"Azure Blob versioning is configured at the storage account level and affects all containers in this account.",
		},
	}
	if props.IsVersioningEnabled {
		view.Status = models.BucketVersioningStatusEnabled
	}
	return view, nil
}

func (a *azureAdapter) PutVersioning(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketVersioningPutRequest) error {
	if err := ValidateVersioningPut(models.ProfileProviderAzureBlob, req); err != nil {
		return err
	}
	props, err := a.getBlobServiceProperties(ctx, profile, bucket, "read current Azure Blob service properties", "bucket_versioning_error")
	if err != nil {
		return err
	}
	props.IsVersioningEnabled = req.Status == models.BucketVersioningStatusEnabled
	return a.putBlobServiceProperties(ctx, profile, bucket, props, "put Azure Blob service properties", "bucket_versioning_error")
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
	resp, err := a.getPolicy(ctx, profile, strings.TrimSpace(bucket))
	if err != nil {
		return azureacl.Policy{}, UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK:
		var policy azureacl.Policy
		if err := json.Unmarshal(resp.Body, &policy); err != nil {
			return azureacl.Policy{}, UpstreamOperationError(code, "failed to decode Azure container policy", bucket, err)
		}
		policy.PublicAccess = string(normalizeAzurePublicAccess(policy.PublicAccess))
		return policy, nil
	case http.StatusNotFound:
		return azureacl.Policy{}, BucketNotFoundError(bucket)
	default:
		return azureacl.Policy{}, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
}

func (a *azureAdapter) putContainerPolicy(ctx context.Context, profile models.ProfileSecrets, bucket string, policy azureacl.Policy, operation, code string) error {
	body, err := json.Marshal(policy)
	if err != nil {
		return UpstreamOperationError(code, "failed to encode Azure container policy", bucket, err)
	}
	resp, err := a.putPolicy(ctx, profile, strings.TrimSpace(bucket), body)
	if err != nil {
		return UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK, http.StatusNoContent:
		return nil
	case http.StatusNotFound:
		return BucketNotFoundError(bucket)
	default:
		return UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
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
		var props azureacl.ServiceProperties
		if err := json.Unmarshal(resp.Body, &props); err != nil {
			return azureacl.ServiceProperties{}, UpstreamOperationError(code, "failed to decode Azure Blob service properties", bucket, err)
		}
		return props, nil
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
	if err != nil {
		return UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK, http.StatusAccepted, http.StatusNoContent:
		return nil
	default:
		return UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
}

func (a *azureAdapter) getAzureContainerProperties(ctx context.Context, profile models.ProfileSecrets, bucket, operation, code string) (azureacl.ContainerProperties, error) {
	if a.getContainerProperties == nil {
		return azureacl.ContainerProperties{}, nil
	}
	resp, err := a.getContainerProperties(ctx, profile, strings.TrimSpace(bucket))
	if err != nil {
		return azureacl.ContainerProperties{}, UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK:
		var props azureacl.ContainerProperties
		if err := json.Unmarshal(resp.Body, &props); err != nil {
			return azureacl.ContainerProperties{}, UpstreamOperationError(code, "failed to decode Azure container properties", bucket, err)
		}
		return props, nil
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
	default:
		return models.BucketPublicExposureModePrivate
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
		return nil, nil
	}
	resp, err := a.getImmutabilityPolicy(ctx, profile, strings.TrimSpace(bucket))
	if err != nil {
		return nil, UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK:
		var policy azurearmimmutability.Policy
		if err := json.Unmarshal(resp.Body, &policy); err != nil {
			return nil, UpstreamOperationError(code, "failed to decode Azure immutability policy", bucket, err)
		}
		if strings.TrimSpace(policy.ETag) == "" {
			policy.ETag = strings.TrimSpace(resp.Headers.Get("Etag"))
		}
		return &policy, nil
	case http.StatusNotFound:
		return nil, nil
	default:
		return nil, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure arm returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
}

func (a *azureAdapter) putAzureProtectionImmutability(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketImmutabilityView) error {
	current, err := a.getAzureImmutabilityPolicy(ctx, profile, bucket, "read current Azure immutability policy", "bucket_protection_error")
	if err != nil {
		return err
	}

	mode := normalizeAzureImmutabilityState(req.Mode)
	if mode == "" {
		mode = "unlocked"
	}

	if !req.Enabled {
		if current == nil {
			return nil
		}
		if normalizeAzureImmutabilityState(current.Properties.State) == "locked" {
			return InvalidFieldError("immutability.enabled", "locked Azure immutability policies cannot be disabled", map[string]any{
				"section": "protection",
				"provider": models.ProfileProviderAzureBlob,
			})
		}
		ifMatch := strings.TrimSpace(req.ETag)
		if ifMatch == "" {
			ifMatch = strings.TrimSpace(current.ETag)
		}
		return a.deleteAzureImmutability(ctx, profile, bucket, ifMatch, "delete Azure immutability policy", "bucket_protection_error")
	}

	if req.Days == nil || *req.Days <= 0 {
		return InvalidFieldError("immutability.days", "immutability.days must be greater than zero when Azure immutability is enabled", map[string]any{
			"section": "protection",
		})
	}

	if current == nil {
		policy, err := a.putAzureImmutability(ctx, profile, bucket, azurearmimmutability.PutPolicyRequest{
			Days:                        *req.Days,
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
				"section": "protection",
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
		if ifMatch == "" {
			ifMatch = strings.TrimSpace(current.ETag)
		}
		return a.extendAzureImmutability(ctx, profile, bucket, azurearmimmutability.ExtendPolicyRequest{
			Days:    *req.Days,
			IfMatch: ifMatch,
		}, "extend Azure immutability policy", "bucket_protection_error")
	}

	ifMatch := strings.TrimSpace(req.ETag)
	if ifMatch == "" {
		ifMatch = strings.TrimSpace(current.ETag)
	}
	policy, err := a.putAzureImmutability(ctx, profile, bucket, azurearmimmutability.PutPolicyRequest{
		Days:                        *req.Days,
		IfMatch:                     ifMatch,
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
		var policy azurearmimmutability.Policy
		if err := json.Unmarshal(resp.Body, &policy); err != nil {
			return nil, UpstreamOperationError(code, "failed to decode Azure immutability policy", bucket, err)
		}
		if strings.TrimSpace(policy.ETag) == "" {
			policy.ETag = strings.TrimSpace(resp.Headers.Get("Etag"))
		}
		return &policy, nil
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
	default:
		return UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("azure arm returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
}

func (a *azureAdapter) lockAzureImmutability(ctx context.Context, profile models.ProfileSecrets, bucket string, ifMatch string, operation, code string) error {
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
