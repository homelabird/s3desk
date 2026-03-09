package bucketgov

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"s3desk/internal/gcsbucket"
	"s3desk/internal/gcsiam"
	"s3desk/internal/models"
)

type gcsAdapter struct {
	getPolicy   func(context.Context, models.ProfileSecrets, string) (gcsiam.Response, error)
	putPolicy   func(context.Context, models.ProfileSecrets, string, []byte) (gcsiam.Response, error)
	getBucket   func(context.Context, models.ProfileSecrets, string) (gcsbucket.Response, error)
	patchBucket func(context.Context, models.ProfileSecrets, string, []byte) (gcsbucket.Response, error)
}

type gcsIAMPolicy struct {
	Version  int             `json:"version,omitempty"`
	ETag     string          `json:"etag,omitempty"`
	Bindings []gcsIAMBinding `json:"bindings,omitempty"`
}

type gcsIAMBinding struct {
	Role      string          `json:"role"`
	Members   []string        `json:"members,omitempty"`
	Condition json.RawMessage `json:"condition,omitempty"`
}

type gcsBucketMetadata struct {
	Versioning struct {
		Enabled bool `json:"enabled"`
	} `json:"versioning,omitempty"`
	IAMConfiguration struct {
		UniformBucketLevelAccess struct {
			Enabled    bool   `json:"enabled"`
			LockedTime string `json:"lockedTime,omitempty"`
		} `json:"uniformBucketLevelAccess,omitempty"`
		PublicAccessPrevention string `json:"publicAccessPrevention,omitempty"`
	} `json:"iamConfiguration,omitempty"`
	RetentionPolicy *gcsRetentionPolicy `json:"retentionPolicy,omitempty"`
}

type gcsRetentionPolicy struct {
	RetentionPeriod string `json:"retentionPeriod,omitempty"`
	EffectiveTime   string `json:"effectiveTime,omitempty"`
	IsLocked        bool   `json:"isLocked,omitempty"`
}

func NewGCSAdapter() Adapter {
	return &gcsAdapter{
		getPolicy:   gcsiam.GetBucketIamPolicy,
		putPolicy:   gcsiam.PutBucketIamPolicy,
		getBucket:   gcsbucket.GetBucket,
		patchBucket: gcsbucket.PatchBucket,
	}
}

func (a *gcsAdapter) GetGovernance(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketGovernanceView, error) {
	view := NewView(models.ProfileProviderGcpGcs, bucket)
	view.Capabilities = ProviderGovernanceCapabilities(models.ProfileProviderGcpGcs)

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

func (a *gcsAdapter) GetAccess(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketAccessView, error) {
	policy, err := a.getIAMPolicy(ctx, profile, bucket, "get bucket access controls", "bucket_access_error")
	if err != nil {
		return models.BucketAccessView{}, err
	}

	view := models.BucketAccessView{
		Provider: models.ProfileProviderGcpGcs,
		Bucket:   strings.TrimSpace(bucket),
		ETag:     strings.TrimSpace(policy.ETag),
	}
	for _, binding := range policy.Bindings {
		view.Bindings = append(view.Bindings, models.BucketAccessBinding{
			Role:      strings.TrimSpace(binding.Role),
			Members:   compactStrings(binding.Members),
			Condition: trimJSON(binding.Condition),
		})
	}
	if view.ETag == "" {
		view.Warnings = append(view.Warnings, "GCS IAM policy etag is missing; preserve it to avoid update conflicts.")
	}
	if gcsPolicyHasPublicMembers(policy) {
		view.Warnings = append(view.Warnings, "GCS IAM policy currently grants public access via allUsers or allAuthenticatedUsers.")
	}
	return view, nil
}

func (a *gcsAdapter) PutAccess(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketAccessPutRequest) error {
	if err := ValidateAccessPut(models.ProfileProviderGcpGcs, req); err != nil {
		return err
	}

	current, err := a.getIAMPolicy(ctx, profile, bucket, "read current GCS IAM policy", "bucket_access_error")
	if err != nil {
		return err
	}

	next := gcsIAMPolicy{
		Version:  gcsPolicyVersionForBindings(req.Bindings, current.Version),
		ETag:     strings.TrimSpace(req.ETag),
		Bindings: make([]gcsIAMBinding, 0, len(req.Bindings)),
	}
	if next.ETag == "" {
		next.ETag = strings.TrimSpace(current.ETag)
	}
	for _, binding := range req.Bindings {
		next.Bindings = append(next.Bindings, gcsIAMBinding{
			Role:      strings.TrimSpace(binding.Role),
			Members:   compactStrings(binding.Members),
			Condition: trimJSON(binding.Condition),
		})
	}

	return a.putIAMPolicy(ctx, profile, bucket, next, "put bucket access controls", "bucket_access_error")
}

func (a *gcsAdapter) GetPublicExposure(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketPublicExposureView, error) {
	policy, err := a.getIAMPolicy(ctx, profile, bucket, "get bucket public exposure", "bucket_public_exposure_error")
	if err != nil {
		return models.BucketPublicExposureView{}, err
	}
	metadata, err := a.getBucketMetadata(ctx, profile, bucket, "get GCS bucket metadata", "bucket_public_exposure_error")
	if err != nil {
		return models.BucketPublicExposureView{}, err
	}

	view := models.BucketPublicExposureView{
		Provider: models.ProfileProviderGcpGcs,
		Bucket:   strings.TrimSpace(bucket),
		Mode:     models.BucketPublicExposureModePrivate,
	}
	if enforced := gcsPublicAccessPreventionEnabled(metadata); enforced != nil {
		view.PublicAccessPrevention = enforced
		if *enforced {
			view.Warnings = append(view.Warnings, "GCS Public Access Prevention is enforced for this bucket.")
		}
	}
	if gcsPolicyHasPublicMembers(policy) {
		view.Mode = models.BucketPublicExposureModePublic
		view.Warnings = append(view.Warnings, "GCS IAM policy exposes this bucket publicly through allUsers or allAuthenticatedUsers.")
	}
	return view, nil
}

func (a *gcsAdapter) PutPublicExposure(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketPublicExposurePutRequest) error {
	if err := ValidatePublicExposurePut(models.ProfileProviderGcpGcs, req); err != nil {
		return err
	}

	current, err := a.getIAMPolicy(ctx, profile, bucket, "read current GCS IAM policy", "bucket_public_exposure_error")
	if err != nil {
		return err
	}

	targetMode := strings.TrimSpace(string(req.Mode))
	if targetMode == "" {
		targetMode = strings.ToLower(strings.TrimSpace(req.Visibility))
	}
	if targetMode == "" {
		return RequiredFieldError("mode", map[string]any{"section": "public-exposure"})
	}

	next := current
	switch models.BucketPublicExposureMode(targetMode) {
	case models.BucketPublicExposureModePrivate:
		next.Bindings = gcsRemovePublicMembers(next.Bindings)
	case models.BucketPublicExposureModePublic:
		next.Bindings = gcsEnsurePublicRead(next.Bindings)
	default:
		return InvalidEnumFieldError("mode", targetMode,
			string(models.BucketPublicExposureModePrivate),
			string(models.BucketPublicExposureModePublic),
		)
	}

	if err := a.putIAMPolicy(ctx, profile, bucket, next, "put bucket public exposure", "bucket_public_exposure_error"); err != nil {
		return err
	}
	if req.PublicAccessPrevention != nil {
		patch := map[string]any{
			"iamConfiguration": map[string]any{
				"publicAccessPrevention": gcsPublicAccessPreventionValue(*req.PublicAccessPrevention),
			},
		}
		if err := a.patchBucketMetadata(ctx, profile, bucket, patch, "put GCS public access prevention", "bucket_public_exposure_error"); err != nil {
			return err
		}
	}
	return nil
}

func (a *gcsAdapter) GetProtection(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketProtectionView, error) {
	metadata, err := a.getBucketMetadata(ctx, profile, bucket, "get GCS bucket protection controls", "bucket_protection_error")
	if err != nil {
		return models.BucketProtectionView{}, err
	}

	view := models.BucketProtectionView{
		Provider: models.ProfileProviderGcpGcs,
		Bucket:   strings.TrimSpace(bucket),
	}
	view.UniformAccess = gcsUniformAccessPtr(metadata)
	view.Retention = gcsRetentionFromMetadata(metadata.RetentionPolicy, &view)
	return view, nil
}

func (a *gcsAdapter) PutProtection(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketProtectionPutRequest) error {
	if err := ValidateProtectionPut(models.ProfileProviderGcpGcs, req); err != nil {
		return err
	}

	current, err := a.getBucketMetadata(ctx, profile, bucket, "read current GCS bucket protection controls", "bucket_protection_error")
	if err != nil {
		return err
	}

	patch := map[string]any{}
	if req.UniformAccess != nil {
		patch["iamConfiguration"] = map[string]any{
			"uniformBucketLevelAccess": map[string]any{
				"enabled": *req.UniformAccess,
			},
		}
	}
	if req.Retention != nil {
		if current.RetentionPolicy != nil && current.RetentionPolicy.IsLocked {
			return InvalidFieldError("retention", "locked GCS retention policy cannot be modified in this client", map[string]any{
				"section": "protection",
				"locked":  true,
			})
		}
		if req.Retention.Locked {
			return InvalidFieldError("retention.locked", "locking GCS retention policy is not supported in this client", map[string]any{
				"section": "protection",
			})
		}
		if !req.Retention.Enabled {
			patch["retentionPolicy"] = nil
		} else {
			days := 0
			if req.Retention.Days != nil {
				days = *req.Retention.Days
			}
			if days <= 0 {
				return InvalidFieldError("retention.days", "retention.days must be greater than zero when retention is enabled", map[string]any{
					"section": "protection",
				})
			}
			patch["retentionPolicy"] = map[string]any{
				"retentionPeriod": strconv.Itoa(days * 24 * 60 * 60),
			}
		}
	}

	return a.patchBucketMetadata(ctx, profile, bucket, patch, "put GCS bucket protection controls", "bucket_protection_error")
}

func (a *gcsAdapter) GetVersioning(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketVersioningView, error) {
	metadata, err := a.getBucketMetadata(ctx, profile, bucket, "get GCS bucket versioning", "bucket_versioning_error")
	if err != nil {
		return models.BucketVersioningView{}, err
	}

	view := models.BucketVersioningView{
		Provider: models.ProfileProviderGcpGcs,
		Bucket:   strings.TrimSpace(bucket),
		Status:   models.BucketVersioningStatusDisabled,
	}
	if metadata.Versioning.Enabled {
		view.Status = models.BucketVersioningStatusEnabled
	}
	return view, nil
}

func (a *gcsAdapter) PutVersioning(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketVersioningPutRequest) error {
	if err := ValidateVersioningPut(models.ProfileProviderGcpGcs, req); err != nil {
		return err
	}

	enabled := req.Status == models.BucketVersioningStatusEnabled
	return a.patchBucketMetadata(ctx, profile, bucket, map[string]any{
		"versioning": map[string]any{
			"enabled": enabled,
		},
	}, "put GCS bucket versioning", "bucket_versioning_error")
}

func (a *gcsAdapter) GetEncryption(context.Context, models.ProfileSecrets, string) (models.BucketEncryptionView, error) {
	return models.BucketEncryptionView{}, UnsupportedOperationError{Provider: models.ProfileProviderGcpGcs, Section: "encryption"}
}

func (a *gcsAdapter) PutEncryption(context.Context, models.ProfileSecrets, string, models.BucketEncryptionPutRequest) error {
	return UnsupportedOperationError{Provider: models.ProfileProviderGcpGcs, Section: "encryption"}
}

func (a *gcsAdapter) GetLifecycle(context.Context, models.ProfileSecrets, string) (models.BucketLifecycleView, error) {
	return models.BucketLifecycleView{}, UnsupportedOperationError{Provider: models.ProfileProviderGcpGcs, Section: "lifecycle"}
}

func (a *gcsAdapter) PutLifecycle(context.Context, models.ProfileSecrets, string, models.BucketLifecyclePutRequest) error {
	return UnsupportedOperationError{Provider: models.ProfileProviderGcpGcs, Section: "lifecycle"}
}

func (a *gcsAdapter) getBucketMetadata(ctx context.Context, profile models.ProfileSecrets, bucket, operation, code string) (gcsBucketMetadata, error) {
	if a.getBucket == nil {
		return gcsBucketMetadata{}, nil
	}
	resp, err := a.getBucket(ctx, profile, strings.TrimSpace(bucket))
	if err != nil {
		return gcsBucketMetadata{}, UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK:
		var metadata gcsBucketMetadata
		if err := json.Unmarshal(resp.Body, &metadata); err != nil {
			return gcsBucketMetadata{}, UpstreamOperationError(code, "failed to decode GCS bucket metadata", bucket, err)
		}
		return metadata, nil
	case http.StatusNotFound:
		return gcsBucketMetadata{}, BucketNotFoundError(bucket)
	default:
		return gcsBucketMetadata{}, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("gcs returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
}

func (a *gcsAdapter) patchBucketMetadata(ctx context.Context, profile models.ProfileSecrets, bucket string, patch map[string]any, operation, code string) error {
	if a.patchBucket == nil {
		return UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("gcs bucket metadata client is not configured"))
	}
	body, err := json.Marshal(patch)
	if err != nil {
		return UpstreamOperationError(code, "failed to encode GCS bucket metadata patch", bucket, err)
	}
	resp, err := a.patchBucket(ctx, profile, strings.TrimSpace(bucket), body)
	if err != nil {
		return UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK:
		return nil
	case http.StatusNotFound:
		return BucketNotFoundError(bucket)
	default:
		return UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("gcs returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
}

func (a *gcsAdapter) getIAMPolicy(ctx context.Context, profile models.ProfileSecrets, bucket, operation, code string) (gcsIAMPolicy, error) {
	if a.getPolicy == nil {
		return gcsIAMPolicy{}, nil
	}
	resp, err := a.getPolicy(ctx, profile, strings.TrimSpace(bucket))
	if err != nil {
		return gcsIAMPolicy{}, UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK:
		var policy gcsIAMPolicy
		if err := json.Unmarshal(resp.Body, &policy); err != nil {
			return gcsIAMPolicy{}, UpstreamOperationError(code, "failed to decode GCS IAM policy", bucket, err)
		}
		return policy, nil
	case http.StatusNotFound:
		return gcsIAMPolicy{}, BucketNotFoundError(bucket)
	default:
		return gcsIAMPolicy{}, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("gcs returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
}

func (a *gcsAdapter) putIAMPolicy(ctx context.Context, profile models.ProfileSecrets, bucket string, policy gcsIAMPolicy, operation, code string) error {
	if a.putPolicy == nil {
		return UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("gcs IAM policy client is not configured"))
	}
	body, err := json.Marshal(policy)
	if err != nil {
		return UpstreamOperationError(code, "failed to encode GCS IAM policy", bucket, err)
	}
	resp, err := a.putPolicy(ctx, profile, strings.TrimSpace(bucket), body)
	if err != nil {
		return UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
	switch resp.Status {
	case http.StatusOK:
		return nil
	case http.StatusNotFound:
		return BucketNotFoundError(bucket)
	default:
		return UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("gcs returned status %d: %s", resp.Status, strings.TrimSpace(string(resp.Body))))
	}
}

func gcsPolicyVersionForBindings(bindings []models.BucketAccessBinding, currentVersion int) int {
	version := 1
	for _, binding := range bindings {
		if len(trimJSON(binding.Condition)) > 0 {
			version = 3
			break
		}
	}
	if currentVersion > version {
		return currentVersion
	}
	return version
}

func gcsPolicyHasPublicMembers(policy gcsIAMPolicy) bool {
	for _, binding := range policy.Bindings {
		for _, member := range binding.Members {
			switch strings.TrimSpace(member) {
			case "allUsers", "allAuthenticatedUsers":
				return true
			}
		}
	}
	return false
}

func gcsRemovePublicMembers(bindings []gcsIAMBinding) []gcsIAMBinding {
	next := make([]gcsIAMBinding, 0, len(bindings))
	for _, binding := range bindings {
		copyBinding := binding
		members := make([]string, 0, len(binding.Members))
		for _, member := range binding.Members {
			switch strings.TrimSpace(member) {
			case "allUsers", "allAuthenticatedUsers":
				continue
			default:
				member = strings.TrimSpace(member)
				if member != "" {
					members = append(members, member)
				}
			}
		}
		copyBinding.Members = members
		if strings.TrimSpace(copyBinding.Role) == "" || len(copyBinding.Members) == 0 {
			continue
		}
		next = append(next, copyBinding)
	}
	return next
}

func gcsEnsurePublicRead(bindings []gcsIAMBinding) []gcsIAMBinding {
	const publicViewerRole = "roles/storage.objectViewer"

	next := append([]gcsIAMBinding(nil), bindings...)
	for i := range next {
		if strings.TrimSpace(next[i].Role) != publicViewerRole {
			continue
		}
		for _, member := range next[i].Members {
			if strings.TrimSpace(member) == "allUsers" {
				return next
			}
		}
		next[i].Members = append(next[i].Members, "allUsers")
		return next
	}

	return append(next, gcsIAMBinding{
		Role:    publicViewerRole,
		Members: []string{"allUsers"},
	})
}

func gcsUniformAccessPtr(metadata gcsBucketMetadata) *bool {
	enabled := metadata.IAMConfiguration.UniformBucketLevelAccess.Enabled
	return &enabled
}

func gcsPublicAccessPreventionEnabled(metadata gcsBucketMetadata) *bool {
	value := strings.ToLower(strings.TrimSpace(metadata.IAMConfiguration.PublicAccessPrevention))
	if value == "" {
		return nil
	}
	enabled := value == "enforced"
	return &enabled
}

func gcsPublicAccessPreventionValue(enabled bool) string {
	if enabled {
		return "enforced"
	}
	return "inherited"
}

func gcsRetentionFromMetadata(policy *gcsRetentionPolicy, view *models.BucketProtectionView) *models.BucketRetentionView {
	if policy == nil {
		return nil
	}
	seconds, _ := strconv.Atoi(strings.TrimSpace(policy.RetentionPeriod))
	retention := &models.BucketRetentionView{
		Enabled:     seconds > 0,
		RetainUntil: strings.TrimSpace(policy.EffectiveTime),
		Locked:      policy.IsLocked,
	}
	if seconds > 0 {
		days := (seconds + 86399) / 86400
		retention.Days = &days
		if view != nil && seconds%86400 != 0 {
			view.Warnings = append(view.Warnings, "GCS retention period is not aligned to whole days; it was rounded up for this client.")
		}
	}
	if policy.IsLocked && view != nil {
		view.Warnings = append(view.Warnings, "GCS retention policy is locked and cannot be reduced or removed.")
	}
	return retention
}

func compactStrings(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		out = append(out, value)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func trimJSON(value json.RawMessage) json.RawMessage {
	value = json.RawMessage(strings.TrimSpace(string(value)))
	if len(value) == 0 || string(value) == "null" {
		return nil
	}
	return value
}
