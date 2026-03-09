package bucketgov

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"s3desk/internal/models"
	"s3desk/internal/ocicli"
)

type ociAdapter struct {
	getBucket           func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error)
	updateBucket        func(context.Context, models.ProfileSecrets, string, string, string) (ocicli.Response, error)
	listRetentionRules  func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error)
	createRetentionRule func(context.Context, models.ProfileSecrets, string, int, string) (ocicli.Response, error)
	updateRetentionRule func(context.Context, models.ProfileSecrets, string, string, int, string) (ocicli.Response, error)
	deleteRetentionRule func(context.Context, models.ProfileSecrets, string, string) (ocicli.Response, error)
	listPreauthenticatedRequests func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error)
	createPreauthenticatedRequest func(context.Context, models.ProfileSecrets, string, string, string, string, string, string) (ocicli.Response, error)
	deletePreauthenticatedRequest func(context.Context, models.ProfileSecrets, string, string) (ocicli.Response, error)
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

type ociPreauthenticatedRequestsResponse struct {
	Data []ociPreauthenticatedRequest `json:"data"`
}

type ociPreauthenticatedRequest struct {
	ID                  string `json:"id"`
	Name                string `json:"name"`
	AccessType          string `json:"access-type"`
	BucketListingAction string `json:"bucket-listing-action"`
	ObjectName          string `json:"object-name"`
	TimeCreated         string `json:"time-created"`
	TimeExpires         string `json:"time-expires"`
	AccessURI           string `json:"access-uri"`
}

func NewOCIAdapter() Adapter {
	return &ociAdapter{
		getBucket:           ocicli.GetBucket,
		updateBucket:        ocicli.UpdateBucket,
		listRetentionRules:  ocicli.ListRetentionRules,
		createRetentionRule: ocicli.CreateRetentionRule,
		updateRetentionRule: ocicli.UpdateRetentionRule,
		deleteRetentionRule: ocicli.DeleteRetentionRule,
		listPreauthenticatedRequests: ocicli.ListPreauthenticatedRequests,
		createPreauthenticatedRequest: ocicli.CreatePreauthenticatedRequest,
		deletePreauthenticatedRequest: ocicli.DeletePreauthenticatedRequest,
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

	sharing, err := a.GetSharing(ctx, profile, bucket)
	if err != nil {
		return models.BucketGovernanceView{}, err
	}
	view.Sharing = &sharing

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
	if len(rules) > 0 {
		retention := &models.BucketRetentionView{
			Enabled: true,
			Rules:   make([]models.BucketRetentionRuleView, 0, len(rules)),
		}
		lockedCount := 0
		for _, rule := range rules {
			retentionRule := toBucketRetentionRule(rule)
			retention.Rules = append(retention.Rules, retentionRule)
			if retentionRule.Locked {
				lockedCount++
			}
		}
		if len(retention.Rules) == 1 {
			retention.Days = retention.Rules[0].Days
			retention.Locked = retention.Rules[0].Locked
		}
		if lockedCount > 0 {
			view.Warnings = append(view.Warnings, "One or more OCI retention rules are locked and can only be extended, not shortened or removed.")
		}
		view.Retention = retention
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
	desiredRules, err := desiredOCIRetentionRules(req.Retention)
	if err != nil {
		return err
	}

	currentByID := make(map[string]ociRetentionRule, len(rules))
	for _, rule := range rules {
		currentByID[rule.ID] = rule
	}
	desiredByID := make(map[string]models.BucketRetentionRuleView, len(desiredRules))
	for index, rule := range desiredRules {
		id := strings.TrimSpace(rule.ID)
		if id == "" {
			continue
		}
		if _, exists := desiredByID[id]; exists {
			return InvalidFieldError("retention.rules["+fmt.Sprintf("%d", index)+"].id", "retention rule ids must be unique", map[string]any{
				"section": "protection",
				"id":      id,
			})
		}
		desiredByID[id] = rule
		if _, exists := currentByID[id]; !exists {
			return InvalidFieldError("retention.rules["+fmt.Sprintf("%d", index)+"].id", "retention rule id does not exist on this bucket", map[string]any{
				"section": "protection",
				"id":      id,
			})
		}
	}

	for _, current := range rules {
		desired, exists := desiredByID[current.ID]
		if !exists {
			if current.TimeRuleLocked {
				return InvalidFieldError("retention.rules", "locked OCI retention rules cannot be removed", map[string]any{
					"section": "protection",
					"id":      current.ID,
				})
			}
			if _, err := a.deleteOCIRetentionRule(ctx, profile, bucket, current.ID, "delete OCI retention rule", "bucket_protection_error"); err != nil {
				return err
			}
			continue
		}
		if desired.Days == nil || *desired.Days <= 0 {
			return InvalidFieldError("retention.rules", "retention rule days must be greater than zero", map[string]any{
				"section": "protection",
				"id":      current.ID,
			})
		}
		currentDays := ociRetentionRuleDays(current)
		desiredDays := *desired.Days
		currentName := strings.TrimSpace(current.DisplayName)
		desiredName := strings.TrimSpace(desired.DisplayName)
		if desiredName == "" {
			desiredName = currentName
		}
		if current.TimeRuleLocked {
			if desiredName != currentName {
				return InvalidFieldError("retention.rules", "locked OCI retention rule names cannot be changed", map[string]any{
					"section": "protection",
					"id":      current.ID,
				})
			}
			if desiredDays < currentDays {
				return InvalidFieldError("retention.rules", "locked OCI retention rules can only be extended", map[string]any{
					"section":    "protection",
					"id":         current.ID,
					"currentDays": currentDays,
				})
			}
			if desiredDays == currentDays {
				continue
			}
			if _, err := a.updateOCIRetentionRule(ctx, profile, bucket, current.ID, desiredDays, currentName, "extend OCI retention rule", "bucket_protection_error"); err != nil {
				return err
			}
			continue
		}
		if desiredDays == currentDays && desiredName == currentName {
			continue
		}
		if _, err := a.updateOCIRetentionRule(ctx, profile, bucket, current.ID, desiredDays, desiredName, "update OCI retention rule", "bucket_protection_error"); err != nil {
			return err
		}
	}

	for index, desired := range desiredRules {
		if strings.TrimSpace(desired.ID) != "" {
			continue
		}
		if desired.Days == nil || *desired.Days <= 0 {
			return InvalidFieldError("retention.rules["+fmt.Sprintf("%d", index)+"].days", "retention rule days must be greater than zero", map[string]any{
				"section": "protection",
			})
		}
		displayName := strings.TrimSpace(desired.DisplayName)
		if displayName == "" {
			displayName = defaultOCIRetentionRuleName(index + 1)
		}
		if _, err := a.createOCIRetentionRule(ctx, profile, bucket, *desired.Days, displayName, "create OCI retention rule", "bucket_protection_error"); err != nil {
			return err
		}
	}
	return nil
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

func (a *ociAdapter) GetSharing(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketSharingView, error) {
	requests, err := a.getOCIPreauthenticatedRequests(ctx, profile, bucket, "get OCI pre-authenticated requests", "bucket_sharing_error")
	if err != nil {
		return models.BucketSharingView{}, err
	}
	supported := true
	view := models.BucketSharingView{
		Provider:                models.ProfileProviderOciObjectStorage,
		Bucket:                  strings.TrimSpace(bucket),
		PreauthenticatedSupport: &supported,
		PreauthenticatedRequests: make([]models.BucketPreauthenticatedRequestView, 0, len(requests)),
	}
	for _, item := range requests {
		view.PreauthenticatedRequests = append(view.PreauthenticatedRequests, toBucketPreauthenticatedRequest(item))
	}
	return view, nil
}

func (a *ociAdapter) PutSharing(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketSharingPutRequest) (models.BucketSharingView, error) {
	if err := ValidateSharingPut(models.ProfileProviderOciObjectStorage, req); err != nil {
		return models.BucketSharingView{}, err
	}
	current, err := a.getOCIPreauthenticatedRequests(ctx, profile, bucket, "read current OCI pre-authenticated requests", "bucket_sharing_error")
	if err != nil {
		return models.BucketSharingView{}, err
	}
	currentByID := make(map[string]ociPreauthenticatedRequest, len(current))
	for _, item := range current {
		currentByID[item.ID] = item
	}

	desiredByID := make(map[string]models.BucketPreauthenticatedRequestView, len(req.PreauthenticatedRequests))
	for index, item := range req.PreauthenticatedRequests {
		id := strings.TrimSpace(item.ID)
		if id == "" {
			continue
		}
		if _, ok := currentByID[id]; !ok {
			return models.BucketSharingView{}, InvalidFieldError("preauthenticatedRequests["+strconv.Itoa(index)+"].id", "PAR id does not exist on this bucket", map[string]any{
				"section": "sharing",
				"id":      id,
			})
		}
		desiredByID[id] = item
	}

	for _, existing := range current {
		desired, ok := desiredByID[existing.ID]
		if !ok {
			if _, err := a.deleteOCIPreauthenticatedRequest(ctx, profile, bucket, existing.ID, "delete OCI pre-authenticated request", "bucket_sharing_error"); err != nil {
				return models.BucketSharingView{}, err
			}
			continue
		}
		if existingPARChanged(existing, desired) {
			return models.BucketSharingView{}, InvalidFieldError("preauthenticatedRequests", "existing OCI pre-authenticated requests are immutable in this client; delete and recreate to change them", map[string]any{
				"section": "sharing",
				"id":      existing.ID,
			})
		}
	}

	created := make([]models.BucketPreauthenticatedRequestView, 0)
	for index, item := range req.PreauthenticatedRequests {
		if strings.TrimSpace(item.ID) != "" {
			continue
		}
		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = fmt.Sprintf("PAR %d", index+1)
		}
		bucketListingAction := strings.TrimSpace(item.BucketListingAction)
		if bucketListingAction == "" {
			bucketListingAction = "Deny"
		}
		createdItem, err := a.createOCIPreauthenticatedRequest(
			ctx,
			profile,
			bucket,
			name,
			strings.TrimSpace(item.AccessType),
			strings.TrimSpace(item.TimeExpires),
			strings.TrimSpace(item.ObjectName),
			bucketListingAction,
			"create OCI pre-authenticated request",
			"bucket_sharing_error",
		)
		if err != nil {
			return models.BucketSharingView{}, err
		}
		created = append(created, toBucketPreauthenticatedRequest(createdItem))
	}

	view, err := a.GetSharing(ctx, profile, bucket)
	if err != nil {
		return models.BucketSharingView{}, err
	}
	if len(created) > 0 {
		createdByID := make(map[string]models.BucketPreauthenticatedRequestView, len(created))
		for _, item := range created {
			createdByID[item.ID] = item
		}
		for index, item := range view.PreauthenticatedRequests {
			if createdItem, ok := createdByID[item.ID]; ok {
				view.PreauthenticatedRequests[index].AccessURI = createdItem.AccessURI
			}
		}
		view.Warnings = append(view.Warnings, "OCI only returns the full PAR access URI when a PAR is created. Copy it now if you need the complete link later.")
	}
	return view, nil
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

func (a *ociAdapter) getOCIPreauthenticatedRequests(ctx context.Context, profile models.ProfileSecrets, bucket, operation, code string) ([]ociPreauthenticatedRequest, error) {
	if a.listPreauthenticatedRequests == nil {
		return nil, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("oci preauthenticated request client is not configured"))
	}
	resp, err := a.listPreauthenticatedRequests(ctx, profile, strings.TrimSpace(bucket))
	if err != nil {
		return nil, mapOCIError(err, bucket, code, operation)
	}
	var payload ociPreauthenticatedRequestsResponse
	if err := json.Unmarshal(resp.Body, &payload); err != nil {
		return nil, UpstreamOperationError(code, "failed to decode OCI pre-authenticated requests", bucket, err)
	}
	return payload.Data, nil
}

func (a *ociAdapter) createOCIPreauthenticatedRequest(ctx context.Context, profile models.ProfileSecrets, bucket, name, accessType, timeExpires, objectName, bucketListingAction, operation, code string) (ociPreauthenticatedRequest, error) {
	if a.createPreauthenticatedRequest == nil {
		return ociPreauthenticatedRequest{}, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("oci preauthenticated request client is not configured"))
	}
	resp, err := a.createPreauthenticatedRequest(ctx, profile, strings.TrimSpace(bucket), name, accessType, timeExpires, objectName, bucketListingAction)
	if err != nil {
		return ociPreauthenticatedRequest{}, mapOCIError(err, bucket, code, operation)
	}
	var payload struct {
		Data ociPreauthenticatedRequest `json:"data"`
	}
	if err := json.Unmarshal(resp.Body, &payload); err != nil {
		return ociPreauthenticatedRequest{}, UpstreamOperationError(code, "failed to decode OCI pre-authenticated request", bucket, err)
	}
	return payload.Data, nil
}

func (a *ociAdapter) deleteOCIPreauthenticatedRequest(ctx context.Context, profile models.ProfileSecrets, bucket, parID, operation, code string) (ocicli.Response, error) {
	if a.deletePreauthenticatedRequest == nil {
		return ocicli.Response{}, UpstreamOperationError(code, "failed to "+operation, bucket, fmt.Errorf("oci preauthenticated request client is not configured"))
	}
	resp, err := a.deletePreauthenticatedRequest(ctx, profile, strings.TrimSpace(bucket), strings.TrimSpace(parID))
	if err != nil {
		return ocicli.Response{}, mapOCIError(err, bucket, code, operation)
	}
	return resp, nil
}

func (a *ociAdapter) createOCIRetentionRule(ctx context.Context, profile models.ProfileSecrets, bucket string, days int, displayName, operation, code string) (ociRetentionRule, error) {
	resp, err := a.createRetentionRule(ctx, profile, strings.TrimSpace(bucket), days, strings.TrimSpace(displayName))
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

func (a *ociAdapter) updateOCIRetentionRule(ctx context.Context, profile models.ProfileSecrets, bucket, ruleID string, days int, displayName, operation, code string) (ociRetentionRule, error) {
	resp, err := a.updateRetentionRule(ctx, profile, strings.TrimSpace(bucket), strings.TrimSpace(ruleID), days, strings.TrimSpace(displayName))
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

func toBucketRetentionRule(rule ociRetentionRule) models.BucketRetentionRuleView {
	days := ociRetentionRuleDays(rule)
	view := models.BucketRetentionRuleView{
		ID:           strings.TrimSpace(rule.ID),
		DisplayName:  strings.TrimSpace(rule.DisplayName),
		Locked:       rule.TimeRuleLocked,
		TimeModified: strings.TrimSpace(rule.TimeModified),
	}
	if days > 0 {
		view.Days = &days
	}
	return view
}

func toBucketPreauthenticatedRequest(item ociPreauthenticatedRequest) models.BucketPreauthenticatedRequestView {
	return models.BucketPreauthenticatedRequestView{
		ID:                  strings.TrimSpace(item.ID),
		Name:                strings.TrimSpace(item.Name),
		AccessType:          strings.TrimSpace(item.AccessType),
		BucketListingAction: strings.TrimSpace(item.BucketListingAction),
		ObjectName:          strings.TrimSpace(item.ObjectName),
		TimeCreated:         strings.TrimSpace(item.TimeCreated),
		TimeExpires:         strings.TrimSpace(item.TimeExpires),
		AccessURI:           strings.TrimSpace(item.AccessURI),
	}
}

func existingPARChanged(current ociPreauthenticatedRequest, desired models.BucketPreauthenticatedRequestView) bool {
	return strings.TrimSpace(current.Name) != strings.TrimSpace(desired.Name) ||
		strings.TrimSpace(current.AccessType) != strings.TrimSpace(desired.AccessType) ||
		strings.TrimSpace(current.BucketListingAction) != normalizePARBucketListingAction(desired.BucketListingAction) ||
		strings.TrimSpace(current.ObjectName) != strings.TrimSpace(desired.ObjectName) ||
		strings.TrimSpace(current.TimeExpires) != strings.TrimSpace(desired.TimeExpires)
}

func normalizePARBucketListingAction(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "Deny"
	}
	return trimmed
}

func desiredOCIRetentionRules(retention *models.BucketRetentionView) ([]models.BucketRetentionRuleView, error) {
	if retention == nil {
		return nil, InvalidFieldError("retention", "retention is required", map[string]any{
			"section": "protection",
		})
	}
	if len(retention.Rules) > 0 {
		if !retention.Enabled {
			return nil, InvalidFieldError("retention.rules", "retention rules must be empty when retention is disabled", map[string]any{
				"section": "protection",
			})
		}
		return retention.Rules, nil
	}
	if !retention.Enabled {
		return []models.BucketRetentionRuleView{}, nil
	}
	days := 0
	if retention.Days != nil {
		days = *retention.Days
	}
	if days <= 0 {
		return nil, InvalidFieldError("retention.days", "retention.days must be greater than zero when retention is enabled", map[string]any{
			"section": "protection",
		})
	}
	return []models.BucketRetentionRuleView{
		{
			DisplayName: defaultOCIRetentionRuleName(1),
			Days:        &days,
		},
	}, nil
}

func defaultOCIRetentionRuleName(index int) string {
	if index <= 0 {
		return "Retention Rule"
	}
	return fmt.Sprintf("Retention Rule %d", index)
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
