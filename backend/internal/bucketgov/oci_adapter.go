package bucketgov

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"s3desk/internal/models"
	"s3desk/internal/ocicli"
)

type ociAdapter struct {
	getBucket           func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error)
	updateBucket        func(context.Context, models.ProfileSecrets, string, string, string) (ocicli.Response, error)
	listRetentionRules  func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error)
	createRetentionRule func(context.Context, models.ProfileSecrets, string, int) (ocicli.Response, error)
	updateRetentionRule func(context.Context, models.ProfileSecrets, string, string, int) (ocicli.Response, error)
	deleteRetentionRule func(context.Context, models.ProfileSecrets, string, string) (ocicli.Response, error)
}

type ociBucketResponse struct {
	Data ociBucket `json:"data"`
}

type ociBucket struct {
	PublicAccessType string `json:"public-access-type"`
	Versioning       string `json:"versioning"`
}

type ociRetentionRulesResponse struct {
	Data []ociRetentionRule `json:"data"`
}

type ociRetentionRule struct {
	ID             string `json:"id"`
	DisplayName    string `json:"display-name"`
	TimeRuleLocked bool   `json:"time-rule-locked"`
	TimeModified   string `json:"time-modified"`
	Duration       struct {
		TimeAmount int    `json:"time-amount"`
		TimeUnit   string `json:"time-unit"`
	} `json:"duration"`
}

func NewOCIAdapter() Adapter {
	return &ociAdapter{
		getBucket:           ocicli.GetBucket,
		updateBucket:        ocicli.UpdateBucket,
		listRetentionRules:  ocicli.ListRetentionRules,
		createRetentionRule: ocicli.CreateRetentionRule,
		updateRetentionRule: ocicli.UpdateRetentionRule,
		deleteRetentionRule: ocicli.DeleteRetentionRule,
	}
}

func (a *ociAdapter) GetGovernance(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketGovernanceView, error) {
	view := NewView(models.ProfileProviderOciObjectStorage, bucket)
	view.Capabilities = ProviderGovernanceCapabilities(models.ProfileProviderOciObjectStorage)

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

	view.Warnings = append(view.Warnings, "OCI bucket retention rules are modeled as a single retention control in this client; if multiple rules exist, only the first one is editable here.")
	return view, nil
}

func (a *ociAdapter) GetAccess(context.Context, models.ProfileSecrets, string) (models.BucketAccessView, error) {
	return models.BucketAccessView{}, UnsupportedOperationError{Provider: models.ProfileProviderOciObjectStorage, Section: "access"}
}

func (a *ociAdapter) PutAccess(context.Context, models.ProfileSecrets, string, models.BucketAccessPutRequest) error {
	return UnsupportedOperationError{Provider: models.ProfileProviderOciObjectStorage, Section: "access"}
}

func (a *ociAdapter) GetPublicExposure(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketPublicExposureView, error) {
	state, err := a.getOCIBucket(ctx, profile, bucket, "get OCI bucket", "bucket_public_exposure_error")
	if err != nil {
		return models.BucketPublicExposureView{}, err
	}

	mode, visibility := fromOCIPublicAccessType(state.PublicAccessType)
	view := models.BucketPublicExposureView{
		Provider:   models.ProfileProviderOciObjectStorage,
		Bucket:     strings.TrimSpace(bucket),
		Mode:       mode,
		Visibility: visibility,
	}
	if visibility == "object_read_without_list" {
		view.Warnings = append(view.Warnings, "OCI bucket is public for object reads without listing.")
	}
	return view, nil
}

func (a *ociAdapter) PutPublicExposure(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketPublicExposurePutRequest) error {
	if err := ValidatePublicExposurePut(models.ProfileProviderOciObjectStorage, req); err != nil {
		return err
	}
	publicAccessType, err := toOCIPublicAccessType(req)
	if err != nil {
		return err
	}
	_, err = a.updateOCIBucket(ctx, profile, bucket, publicAccessType, "", "put OCI bucket public exposure", "bucket_public_exposure_error")
	return err
}

func (a *ociAdapter) GetProtection(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketProtectionView, error) {
	rules, err := a.getOCIRetentionRules(ctx, profile, bucket, "get OCI retention rules", "bucket_protection_error")
	if err != nil {
		return models.BucketProtectionView{}, err
	}

	view := models.BucketProtectionView{
		Provider: models.ProfileProviderOciObjectStorage,
		Bucket:   strings.TrimSpace(bucket),
	}
	if len(rules) > 1 {
		view.Warnings = append(view.Warnings, "OCI bucket has multiple retention rules; only the first rule is editable in this client.")
	}
	if len(rules) > 0 {
		days := ociRetentionRuleDays(rules[0])
		view.Retention = &models.BucketRetentionView{
			Enabled: true,
			Days:    &days,
			Locked:  rules[0].TimeRuleLocked,
		}
		if rules[0].TimeRuleLocked {
			view.Warnings = append(view.Warnings, "OCI retention rule is locked and cannot be shortened or removed.")
		}
	}
	return view, nil
}

func (a *ociAdapter) PutProtection(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketProtectionPutRequest) error {
	if err := ValidateProtectionPut(models.ProfileProviderOciObjectStorage, req); err != nil {
		return err
	}
	if req.Retention == nil {
		return UnsupportedOperationError{Provider: models.ProfileProviderOciObjectStorage, Section: "protection"}
	}

	rules, err := a.getOCIRetentionRules(ctx, profile, bucket, "read current OCI retention rules", "bucket_protection_error")
	if err != nil {
		return err
	}
	if len(rules) > 0 && rules[0].TimeRuleLocked {
		return InvalidFieldError("retention", "locked OCI retention rule cannot be modified in this client", map[string]any{
			"section": "protection",
			"locked":  true,
		})
	}

	if !req.Retention.Enabled {
		if len(rules) == 0 {
			return nil
		}
		_, err := a.deleteOCIRetentionRule(ctx, profile, bucket, rules[0].ID, "delete OCI retention rule", "bucket_protection_error")
		return err
	}

	days := 0
	if req.Retention.Days != nil {
		days = *req.Retention.Days
	}
	if days <= 0 {
		return InvalidFieldError("retention.days", "retention.days must be greater than zero when retention is enabled", map[string]any{
			"section": "protection",
		})
	}

	if len(rules) == 0 {
		_, err := a.createOCIRetentionRule(ctx, profile, bucket, days, "create OCI retention rule", "bucket_protection_error")
		return err
	}
	_, err = a.updateOCIRetentionRule(ctx, profile, bucket, rules[0].ID, days, "update OCI retention rule", "bucket_protection_error")
	return err
}

func (a *ociAdapter) GetVersioning(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketVersioningView, error) {
	state, err := a.getOCIBucket(ctx, profile, bucket, "get OCI bucket", "bucket_versioning_error")
	if err != nil {
		return models.BucketVersioningView{}, err
	}
	view := models.BucketVersioningView{
		Provider: models.ProfileProviderOciObjectStorage,
		Bucket:   strings.TrimSpace(bucket),
		Status:   models.BucketVersioningStatusDisabled,
	}
	if strings.EqualFold(strings.TrimSpace(state.Versioning), "Enabled") {
		view.Status = models.BucketVersioningStatusEnabled
	}
	return view, nil
}

func (a *ociAdapter) PutVersioning(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketVersioningPutRequest) error {
	if err := ValidateVersioningPut(models.ProfileProviderOciObjectStorage, req); err != nil {
		return err
	}
	versioning := "Disabled"
	if req.Status == models.BucketVersioningStatusEnabled {
		versioning = "Enabled"
	}
	_, err := a.updateOCIBucket(ctx, profile, bucket, "", versioning, "put OCI bucket versioning", "bucket_versioning_error")
	return err
}

func (a *ociAdapter) GetEncryption(context.Context, models.ProfileSecrets, string) (models.BucketEncryptionView, error) {
	return models.BucketEncryptionView{}, UnsupportedOperationError{Provider: models.ProfileProviderOciObjectStorage, Section: "encryption"}
}

func (a *ociAdapter) PutEncryption(context.Context, models.ProfileSecrets, string, models.BucketEncryptionPutRequest) error {
	return UnsupportedOperationError{Provider: models.ProfileProviderOciObjectStorage, Section: "encryption"}
}

func (a *ociAdapter) GetLifecycle(context.Context, models.ProfileSecrets, string) (models.BucketLifecycleView, error) {
	return models.BucketLifecycleView{}, UnsupportedOperationError{Provider: models.ProfileProviderOciObjectStorage, Section: "lifecycle"}
}

func (a *ociAdapter) PutLifecycle(context.Context, models.ProfileSecrets, string, models.BucketLifecyclePutRequest) error {
	return UnsupportedOperationError{Provider: models.ProfileProviderOciObjectStorage, Section: "lifecycle"}
}

func (a *ociAdapter) getOCIBucket(ctx context.Context, profile models.ProfileSecrets, bucket, operation, code string) (ociBucket, error) {
	if a.getBucket == nil {
		return ociBucket{}, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("oci bucket client is not configured"))
	}
	resp, err := a.getBucket(ctx, profile, strings.TrimSpace(bucket))
	if err != nil {
		return ociBucket{}, mapOCIError(err, bucket, code, operation)
	}
	var payload ociBucketResponse
	if err := json.Unmarshal(resp.Body, &payload); err != nil {
		return ociBucket{}, UpstreamOperationError(code, "failed to decode OCI bucket response", bucket, err)
	}
	return payload.Data, nil
}

func (a *ociAdapter) updateOCIBucket(ctx context.Context, profile models.ProfileSecrets, bucket, publicAccessType, versioning, operation, code string) (ociBucket, error) {
	if a.updateBucket == nil {
		return ociBucket{}, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("oci bucket client is not configured"))
	}
	resp, err := a.updateBucket(ctx, profile, strings.TrimSpace(bucket), publicAccessType, versioning)
	if err != nil {
		return ociBucket{}, mapOCIError(err, bucket, code, operation)
	}
	var payload ociBucketResponse
	if err := json.Unmarshal(resp.Body, &payload); err != nil {
		return ociBucket{}, UpstreamOperationError(code, "failed to decode OCI bucket response", bucket, err)
	}
	return payload.Data, nil
}

func (a *ociAdapter) getOCIRetentionRules(ctx context.Context, profile models.ProfileSecrets, bucket, operation, code string) ([]ociRetentionRule, error) {
	if a.listRetentionRules == nil {
		return nil, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("oci retention client is not configured"))
	}
	resp, err := a.listRetentionRules(ctx, profile, strings.TrimSpace(bucket))
	if err != nil {
		return nil, mapOCIError(err, bucket, code, operation)
	}
	var payload ociRetentionRulesResponse
	if err := json.Unmarshal(resp.Body, &payload); err != nil {
		return nil, UpstreamOperationError(code, "failed to decode OCI retention rules", bucket, err)
	}
	return payload.Data, nil
}

func (a *ociAdapter) createOCIRetentionRule(ctx context.Context, profile models.ProfileSecrets, bucket string, days int, operation, code string) (ociRetentionRule, error) {
	resp, err := a.createRetentionRule(ctx, profile, strings.TrimSpace(bucket), days)
	if err != nil {
		return ociRetentionRule{}, mapOCIError(err, bucket, code, operation)
	}
	var payload struct {
		Data ociRetentionRule `json:"data"`
	}
	if err := json.Unmarshal(resp.Body, &payload); err != nil {
		return ociRetentionRule{}, UpstreamOperationError(code, "failed to decode OCI retention rule", bucket, err)
	}
	return payload.Data, nil
}

func (a *ociAdapter) updateOCIRetentionRule(ctx context.Context, profile models.ProfileSecrets, bucket, ruleID string, days int, operation, code string) (ociRetentionRule, error) {
	resp, err := a.updateRetentionRule(ctx, profile, strings.TrimSpace(bucket), strings.TrimSpace(ruleID), days)
	if err != nil {
		return ociRetentionRule{}, mapOCIError(err, bucket, code, operation)
	}
	var payload struct {
		Data ociRetentionRule `json:"data"`
	}
	if err := json.Unmarshal(resp.Body, &payload); err != nil {
		return ociRetentionRule{}, UpstreamOperationError(code, "failed to decode OCI retention rule", bucket, err)
	}
	return payload.Data, nil
}

func (a *ociAdapter) deleteOCIRetentionRule(ctx context.Context, profile models.ProfileSecrets, bucket, ruleID, operation, code string) (ocicli.Response, error) {
	resp, err := a.deleteRetentionRule(ctx, profile, strings.TrimSpace(bucket), strings.TrimSpace(ruleID))
	if err != nil {
		return ocicli.Response{}, mapOCIError(err, bucket, code, operation)
	}
	return resp, nil
}

func fromOCIPublicAccessType(value string) (models.BucketPublicExposureMode, string) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "objectread":
		return models.BucketPublicExposureModePublic, "object_read"
	case "objectreadwithoutlist":
		return models.BucketPublicExposureModePublic, "object_read_without_list"
	default:
		return models.BucketPublicExposureModePrivate, "private"
	}
}

func toOCIPublicAccessType(req models.BucketPublicExposurePutRequest) (string, error) {
	value := strings.ToLower(strings.TrimSpace(req.Visibility))
	if value == "" {
		switch req.Mode {
		case models.BucketPublicExposureModePrivate:
			value = "private"
		case models.BucketPublicExposureModePublic:
			value = "object_read"
		}
	}
	switch value {
	case "private":
		return "NoPublicAccess", nil
	case "object_read":
		return "ObjectRead", nil
	case "object_read_without_list":
		return "ObjectReadWithoutList", nil
	default:
		return "", InvalidEnumFieldError("visibility", value, "private", "object_read", "object_read_without_list")
	}
}

func ociRetentionRuleDays(rule ociRetentionRule) int {
	amount := rule.Duration.TimeAmount
	if amount <= 0 {
		return 0
	}
	switch strings.ToUpper(strings.TrimSpace(rule.Duration.TimeUnit)) {
	case "YEARS":
		return amount * 365
	default:
		return amount
	}
}

func mapOCIError(err error, bucket, code, operation string) error {
	message := strings.ToLower(strings.TrimSpace(err.Error()))
	switch {
	case strings.Contains(message, "notauthorized"), strings.Contains(message, "not authorized"), strings.Contains(message, "forbidden"):
		return AccessDeniedError(bucket, operation)
	case strings.Contains(message, "notfound"), strings.Contains(message, "not found"):
		return BucketNotFoundError(bucket)
	default:
		return UpstreamOperationError(code, "failed to "+operation, bucket, err)
	}
}
