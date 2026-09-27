package bucketgov

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"time"

	"s3desk/internal/models"
	"s3desk/internal/ocicli"
)

type ociAdapter struct {
	getBucket                     func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error)
	updateBucket                  func(context.Context, models.ProfileSecrets, string, string, string) (ocicli.Response, error)
	listRetentionRules            func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error)
	createRetentionRule           func(context.Context, models.ProfileSecrets, string, int, string, string) (ocicli.Response, error)
	updateRetentionRule           func(context.Context, models.ProfileSecrets, string, string, int, string, string) (ocicli.Response, error)
	deleteRetentionRule           func(context.Context, models.ProfileSecrets, string, string) (ocicli.Response, error)
	listPreauthenticatedRequests  func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error)
	createPreauthenticatedRequest func(context.Context, models.ProfileSecrets, string, string, string, string, string, string) (ocicli.Response, error)
	deletePreauthenticatedRequest func(context.Context, models.ProfileSecrets, string, string) (ocicli.Response, error)
}

type OCIAdapterOptions struct {
	AllowRemote bool
}

const ociMutationRollbackTimeout = 5 * time.Second

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
	ID             string                `json:"id"`
	DisplayName    string                `json:"display-name"`
	TimeRuleLocked *time.Time            `json:"time-rule-locked"`
	TimeModified   string                `json:"time-modified"`
	Duration       *ociRetentionDuration `json:"duration"`
}

type ociRetentionDuration struct {
	TimeAmount int    `json:"time-amount"`
	TimeUnit   string `json:"time-unit"`
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
	return NewOCIAdapterWithOptions(OCIAdapterOptions{})
}

func NewOCIAdapterWithOptions(opts OCIAdapterOptions) Adapter {
	return &ociAdapter{
		getBucket: func(ctx context.Context, profile models.ProfileSecrets, bucket string) (ocicli.Response, error) {
			return ocicli.GetBucketWithOptions(ctx, profile, bucket, ocicli.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		updateBucket: func(ctx context.Context, profile models.ProfileSecrets, bucket string, publicAccessType string, versioning string) (ocicli.Response, error) {
			return ocicli.UpdateBucketWithOptions(ctx, profile, bucket, publicAccessType, versioning, ocicli.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		listRetentionRules: func(ctx context.Context, profile models.ProfileSecrets, bucket string) (ocicli.Response, error) {
			return ocicli.ListRetentionRulesWithOptions(ctx, profile, bucket, ocicli.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		createRetentionRule: func(ctx context.Context, profile models.ProfileSecrets, bucket string, days int, unit, displayName string) (ocicli.Response, error) {
			return ocicli.CreateRetentionRuleWithOptions(ctx, profile, bucket, days, unit, displayName, ocicli.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		updateRetentionRule: func(ctx context.Context, profile models.ProfileSecrets, bucket string, ruleID string, days int, unit, displayName string) (ocicli.Response, error) {
			return ocicli.UpdateRetentionRuleWithOptions(ctx, profile, bucket, ruleID, days, unit, displayName, ocicli.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		deleteRetentionRule: func(ctx context.Context, profile models.ProfileSecrets, bucket string, ruleID string) (ocicli.Response, error) {
			return ocicli.DeleteRetentionRuleWithOptions(ctx, profile, bucket, ruleID, ocicli.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		listPreauthenticatedRequests: func(ctx context.Context, profile models.ProfileSecrets, bucket string) (ocicli.Response, error) {
			return ocicli.ListPreauthenticatedRequestsWithOptions(ctx, profile, bucket, ocicli.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		createPreauthenticatedRequest: func(ctx context.Context, profile models.ProfileSecrets, bucket string, name string, accessType string, timeExpires string, objectName string, bucketListingAction string) (ocicli.Response, error) {
			return ocicli.CreatePreauthenticatedRequestWithOptions(ctx, profile, bucket, name, accessType, timeExpires, objectName, bucketListingAction, ocicli.ClientOptions{AllowRemote: opts.AllowRemote})
		},
		deletePreauthenticatedRequest: func(ctx context.Context, profile models.ProfileSecrets, bucket string, parID string) (ocicli.Response, error) {
			return ocicli.DeletePreauthenticatedRequestWithOptions(ctx, profile, bucket, parID, ocicli.ClientOptions{AllowRemote: opts.AllowRemote})
		},
	}
}

func (a *ociAdapter) GetGovernance(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketGovernanceView, error) {
	view := NewView(models.ProfileProviderOciObjectStorage, bucket)
	view.Capabilities = ProviderGovernanceCapabilities(models.ProfileProviderOciObjectStorage)
	requestAdapter := *a
	if a.getBucket != nil {
		getBucket := sync.OnceValues(func() (ocicli.Response, error) {
			return a.getBucket(ctx, profile, strings.TrimSpace(bucket))
		})
		requestAdapter.getBucket = func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
			return getBucket()
		}
	}

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

	versioning, err := requestAdapter.GetVersioning(ctx, profile, bucket)
	if err != nil {
		return models.BucketGovernanceView{}, err
	}
	view.Versioning = &versioning

	sharing, err := requestAdapter.GetSharing(ctx, profile, bucket)
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
	if visibility == "" {
		return models.BucketPublicExposureView{}, UpstreamOperationError("bucket_public_exposure_error", "unrecognized OCI visibility response", bucket, errors.New("missing or unknown public access type"))
	}
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
	publicAccessType, err := toOCIPublicAccessType(req)
	if err != nil {
		return err
	}
	_, err = a.updateOCIBucket(ctx, profile, bucket, publicAccessType, "", "put OCI bucket public exposure", "bucket_public_exposure_error")
	readCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	observed, readErr := a.getOCIBucket(readCtx, profile, bucket, "confirm OCI bucket public exposure", "bucket_public_exposure_error")
	if err != nil {
		return err
	}
	if readErr != nil || observed.PublicAccessType != publicAccessType {
		return UpstreamOperationError("bucket_public_exposure_unconfirmed", "OCI visibility update was accepted but current state did not confirm the request; reload before retrying", bucket, errors.New("visibility readback failed or differed"))
	}
	return nil
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

func (a *ociAdapter) PutProtection(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketProtectionPutRequest) (result error) {
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

	createdRules := make([]ociRetentionRule, 0, len(desiredRules))
	for _, desired := range desiredRules {
		if _, err := ociDesiredRetentionDuration(desired); err != nil {
			return err
		}
	}

	for _, current := range rules {
		desired, exists := desiredByID[current.ID]
		if !exists {
			if ociRetentionRuleLocked(current) {
				return InvalidFieldError("retention.rules", "locked OCI retention rules cannot be removed", map[string]any{
					"section": "protection",
					"id":      current.ID,
				})
			}
			continue
		}
		desiredDuration, _ := ociDesiredRetentionDuration(desired)
		currentName := strings.TrimSpace(current.DisplayName)
		desiredName := strings.TrimSpace(desired.DisplayName)
		if desiredName == "" {
			desiredName = currentName
		}
		if desiredDuration == nil && current.TimeRuleLocked != nil {
			return InvalidFieldError("retention.rules", "an OCI rule with a pending or active lock cannot become indefinite", nil)
		}
		if ociRetentionRuleLocked(current) {
			if desiredName != currentName {
				return InvalidFieldError("retention.rules", "locked OCI retention rule names cannot be changed", map[string]any{
					"section": "protection",
					"id":      current.ID,
				})
			}
			if desiredDuration == nil || current.Duration == nil || desiredDuration.TimeUnit != current.Duration.TimeUnit || desiredDuration.TimeAmount < current.Duration.TimeAmount {
				return InvalidFieldError("retention.rules", "locked OCI retention rules can only be extended", map[string]any{
					"section": "protection",
					"id":      current.ID,
					"reason":  "locked duration must retain its unit and cannot decrease",
				})
			}
		}
	}

	if len(desiredRules) > 0 {
		versioning, err := a.GetVersioning(ctx, profile, bucket)
		if err != nil {
			return err
		}
		if versioning.Status == models.BucketVersioningStatusEnabled {
			return InvalidFieldError("retention", "OCI retention cannot be applied while bucket versioning is enabled; suspend versioning first", map[string]any{"section": "protection"})
		}
	}

	// Copy before assigning provider IDs; the caller's draft must remain unchanged.
	desiredRules = append([]models.BucketRetentionRuleView(nil), desiredRules...)
	defer func() {
		readCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		observed, readErr := a.getOCIRetentionRules(readCtx, profile, bucket, "confirm OCI retention rules", "bucket_protection_error")
		if result != nil {
			return
		}
		if readErr != nil || !ociRetentionRulesMatch(desiredRules, currentByID, observed) {
			result = UpstreamOperationError("bucket_protection_unconfirmed", "OCI retention update did not confirm the requested rules; reload before retrying", bucket, errors.New("retention readback failed or differed"))
		}
	}()
	for index, desired := range desiredRules {
		if strings.TrimSpace(desired.ID) != "" {
			continue
		}
		displayName := strings.TrimSpace(desired.DisplayName)
		if displayName == "" {
			displayName = defaultOCIRetentionRuleName(index + 1)
		}
		duration, _ := ociDesiredRetentionDuration(desired)
		createdRule, err := a.createOCIRetentionRule(ctx, profile, bucket, duration, displayName, "create OCI retention rule", "bucket_protection_error")
		if err != nil {
			return a.rollbackCreatedOCIRetentionRules(ctx, profile, bucket, createdRules, err)
		}
		desiredRules[index].ID = strings.TrimSpace(createdRule.ID)
		desiredRules[index].DisplayName = displayName
		createdRules = append(createdRules, createdRule)
	}

	for _, current := range rules {
		desired, exists := desiredByID[current.ID]
		if !exists {
			continue
		}
		desiredDuration, _ := ociDesiredRetentionDuration(desired)
		currentName := strings.TrimSpace(current.DisplayName)
		desiredName := strings.TrimSpace(desired.DisplayName)
		if desiredName == "" {
			desiredName = currentName
		}
		if ociRetentionRuleLocked(current) {
			if reflect.DeepEqual(desiredDuration, current.Duration) {
				continue
			}
			if _, err := a.updateOCIRetentionRule(ctx, profile, bucket, current.ID, desiredDuration, currentName, "extend OCI retention rule", "bucket_protection_error"); err != nil {
				return a.rollbackCreatedOCIRetentionRules(ctx, profile, bucket, createdRules, err)
			}
			continue
		}
		if reflect.DeepEqual(desiredDuration, current.Duration) && desiredName == currentName {
			continue
		}
		if _, err := a.updateOCIRetentionRule(ctx, profile, bucket, current.ID, desiredDuration, desiredName, "update OCI retention rule", "bucket_protection_error"); err != nil {
			return a.rollbackCreatedOCIRetentionRules(ctx, profile, bucket, createdRules, err)
		}
	}

	for _, current := range rules {
		if _, exists := desiredByID[current.ID]; exists {
			continue
		}
		if _, err := a.deleteOCIRetentionRule(ctx, profile, bucket, current.ID, "delete OCI retention rule", "bucket_protection_error"); err != nil {
			return a.rollbackCreatedOCIRetentionRules(ctx, profile, bucket, createdRules, err)
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
	switch state.Versioning {
	case "Enabled":
		view.Status = models.BucketVersioningStatusEnabled
	case "Suspended":
		view.Status = models.BucketVersioningStatusSuspended
	case "Disabled":
	default:
		return models.BucketVersioningView{}, UpstreamOperationError("bucket_versioning_error", "unrecognized OCI versioning state", bucket, errors.New("missing or unknown versioning status"))
	}
	return view, nil
}

func (a *ociAdapter) PutVersioning(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketVersioningPutRequest) error {
	var versioning string
	switch req.Status {
	case models.BucketVersioningStatusEnabled:
		versioning = "Enabled"
	case models.BucketVersioningStatusSuspended:
		versioning = "Suspended"
	default:
		return InvalidEnumFieldError("status", string(req.Status), "enabled", "suspended")
	}
	if req.Status == models.BucketVersioningStatusEnabled {
		rules, err := a.getOCIRetentionRules(ctx, profile, bucket, "check retention before enabling versioning", "bucket_versioning_error")
		if err != nil {
			return err
		}
		if len(rules) > 0 {
			return InvalidFieldError("status", "OCI versioning cannot be enabled while retention rules exist", map[string]any{"section": "versioning"})
		}
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
		Provider:                 models.ProfileProviderOciObjectStorage,
		Bucket:                   strings.TrimSpace(bucket),
		PreauthenticatedSupport:  &supported,
		PreauthenticatedRequests: make([]models.BucketPreauthenticatedRequestView, 0, len(requests)),
	}
	for _, item := range requests {
		view.PreauthenticatedRequests = append(view.PreauthenticatedRequests, toBucketPreauthenticatedRequest(item))
	}
	return view, nil
}

func (a *ociAdapter) PutSharing(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketSharingPutRequest) (models.BucketSharingView, error) {
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
			continue
		}
		if existingPARChanged(existing, desired) {
			return models.BucketSharingView{}, InvalidFieldError("preauthenticatedRequests", "existing OCI pre-authenticated requests are immutable in this client; delete and recreate to change them", map[string]any{
				"section": "sharing",
				"id":      existing.ID,
			})
		}
	}

	created := make([]models.BucketPreauthenticatedRequestView, 0, len(req.PreauthenticatedRequests))
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
			item.ObjectName,
			bucketListingAction,
			"create OCI pre-authenticated request",
			"bucket_sharing_error",
		)
		if err != nil {
			return models.BucketSharingView{}, a.rollbackCreatedOCIPreauthenticatedRequests(ctx, profile, bucket, created, err)
		}
		item.ID = strings.TrimSpace(createdItem.ID)
		item.Name = name
		item.BucketListingAction = bucketListingAction
		desiredByID[item.ID] = item
		created = append(created, toBucketPreauthenticatedRequest(createdItem))
	}

	for _, existing := range current {
		if _, ok := desiredByID[existing.ID]; ok {
			continue
		}
		if _, err := a.deleteOCIPreauthenticatedRequest(ctx, profile, bucket, existing.ID, "delete OCI pre-authenticated request", "bucket_sharing_error"); err != nil {
			return models.BucketSharingView{}, a.rollbackCreatedOCIPreauthenticatedRequests(ctx, profile, bucket, created, err)
		}
	}

	readCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	view, err := a.GetSharing(readCtx, profile, bucket)
	matches := err == nil && len(view.PreauthenticatedRequests) == len(desiredByID)
	seen := make(map[string]bool, len(view.PreauthenticatedRequests))
	for _, actual := range view.PreauthenticatedRequests {
		want, ok := desiredByID[actual.ID]
		current := ociPreauthenticatedRequest{ID: actual.ID, Name: actual.Name, AccessType: actual.AccessType, BucketListingAction: actual.BucketListingAction, ObjectName: actual.ObjectName, TimeExpires: actual.TimeExpires}
		if !ok || actual.ID == "" || seen[actual.ID] || existingPARChanged(current, want) {
			matches = false
		}
		seen[actual.ID] = true
	}
	if !matches {
		return models.BucketSharingView{}, UpstreamOperationError("bucket_sharing_unconfirmed", "OCI sharing update did not confirm the requested links; reload before retrying", bucket, errors.New("sharing readback failed or differed"))
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

func (a *ociAdapter) rollbackCreatedOCIRetentionRules(ctx context.Context, profile models.ProfileSecrets, bucket string, created []ociRetentionRule, cause error) error {
	if len(created) == 0 {
		return cause
	}
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), ociMutationRollbackTimeout)
	defer cancel()
	var cleanupErr error
	for index := len(created) - 1; index >= 0; index-- {
		id := strings.TrimSpace(created[index].ID)
		if id == "" {
			if cleanupErr == nil {
				cleanupErr = errors.New("created OCI retention rule response did not include an id")
			}
			continue
		}
		if _, err := a.deleteOCIRetentionRule(cleanupCtx, profile, bucket, id, "rollback OCI retention rule", "bucket_protection_error"); err != nil && cleanupErr == nil {
			cleanupErr = err
		}
	}
	return withOCICleanupError(cause, cleanupErr)
}

func (a *ociAdapter) rollbackCreatedOCIPreauthenticatedRequests(ctx context.Context, profile models.ProfileSecrets, bucket string, created []models.BucketPreauthenticatedRequestView, cause error) error {
	if len(created) == 0 {
		return cause
	}
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), ociMutationRollbackTimeout)
	defer cancel()
	var cleanupErr error
	for index := len(created) - 1; index >= 0; index-- {
		id := strings.TrimSpace(created[index].ID)
		if id == "" {
			if cleanupErr == nil {
				cleanupErr = errors.New("created OCI pre-authenticated request response did not include an id")
			}
			continue
		}
		if _, err := a.deleteOCIPreauthenticatedRequest(cleanupCtx, profile, bucket, id, "rollback OCI pre-authenticated request", "bucket_sharing_error"); err != nil && cleanupErr == nil {
			cleanupErr = err
		}
	}
	return withOCICleanupError(cause, cleanupErr)
}

func withOCICleanupError(cause, cleanupErr error) error {
	if cause == nil || cleanupErr == nil {
		return cause
	}
	var operationErr *OperationError
	if errors.As(cause, &operationErr) {
		details := cloneDetails(operationErr.Details)
		details["cleanupError"] = cleanupErr.Error()
		operationErr.Details = details
		return cause
	}
	return fmt.Errorf("%w (OCI cleanup failed: %v)", cause, cleanupErr)
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
	if payload.Data == nil {
		return nil, UpstreamOperationError(code, "incomplete OCI retention rules response", bucket, errors.New("missing data array"))
	}
	seen := make(map[string]bool, len(payload.Data))
	for _, item := range payload.Data {
		if strings.TrimSpace(item.ID) == "" || seen[item.ID] {
			return nil, UpstreamOperationError(code, "invalid OCI retention rules response", bucket, errors.New("missing or duplicate item ID"))
		}
		if item.Duration == nil && item.TimeRuleLocked != nil {
			return nil, UpstreamOperationError(code, "invalid OCI retention lock", bucket, errors.New("lock without duration"))
		}
		if item.Duration != nil && (item.Duration.TimeAmount <= 0 || (item.Duration.TimeUnit != "DAYS" && item.Duration.TimeUnit != "YEARS")) {
			return nil, UpstreamOperationError(code, "invalid OCI retention duration", bucket, errors.New("non-positive amount or unknown unit"))
		}
		seen[item.ID] = true
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
	if payload.Data == nil {
		return nil, UpstreamOperationError(code, "incomplete OCI pre-authenticated requests response", bucket, errors.New("missing data array"))
	}
	seen := make(map[string]bool, len(payload.Data))
	for _, item := range payload.Data {
		if strings.TrimSpace(item.ID) == "" || seen[item.ID] {
			return nil, UpstreamOperationError(code, "invalid OCI pre-authenticated requests response", bucket, errors.New("missing or duplicate item ID"))
		}
		seen[item.ID] = true
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

func (a *ociAdapter) createOCIRetentionRule(ctx context.Context, profile models.ProfileSecrets, bucket string, duration *ociRetentionDuration, displayName, operation, code string) (ociRetentionRule, error) {
	amount, unit := 0, ""
	if duration != nil {
		amount, unit = duration.TimeAmount, duration.TimeUnit
	}
	resp, err := a.createRetentionRule(ctx, profile, strings.TrimSpace(bucket), amount, unit, strings.TrimSpace(displayName))
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

func (a *ociAdapter) updateOCIRetentionRule(ctx context.Context, profile models.ProfileSecrets, bucket, ruleID string, duration *ociRetentionDuration, displayName, operation, code string) (ociRetentionRule, error) {
	amount, unit := 0, ""
	if duration != nil {
		amount, unit = duration.TimeAmount, duration.TimeUnit
	}
	resp, err := a.updateRetentionRule(ctx, profile, strings.TrimSpace(bucket), strings.TrimSpace(ruleID), amount, unit, strings.TrimSpace(displayName))
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
	case "nopublicaccess":
		return models.BucketPublicExposureModePrivate, "private"
	default:
		return "", ""
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

func ociRetentionRuleLocked(rule ociRetentionRule) bool {
	return rule.TimeRuleLocked != nil && !rule.TimeRuleLocked.After(time.Now())
}

func ociDesiredRetentionDuration(rule models.BucketRetentionRuleView) (*ociRetentionDuration, error) {
	count := 0
	if rule.Days != nil {
		count++
	}
	if rule.Years != nil {
		count++
	}
	if rule.Indefinite {
		count++
	}
	if count != 1 {
		return nil, InvalidFieldError("retention.rules", "each OCI rule requires exactly one of days, years or indefinite", nil)
	}
	if rule.Indefinite {
		return nil, nil
	}
	amount, unit := rule.Days, "DAYS"
	if rule.Years != nil {
		amount, unit = rule.Years, "YEARS"
	}
	if *amount <= 0 {
		return nil, InvalidFieldError("retention.rules", "retention duration must be greater than zero", nil)
	}
	return &ociRetentionDuration{TimeAmount: *amount, TimeUnit: unit}, nil
}

func toBucketRetentionRule(rule ociRetentionRule) models.BucketRetentionRuleView {
	view := models.BucketRetentionRuleView{ID: strings.TrimSpace(rule.ID), DisplayName: strings.TrimSpace(rule.DisplayName), Locked: ociRetentionRuleLocked(rule), TimeModified: strings.TrimSpace(rule.TimeModified)}
	if rule.Duration == nil {
		view.Indefinite = true
	} else if rule.Duration.TimeUnit == "DAYS" {
		amount := rule.Duration.TimeAmount
		view.Days = &amount
	} else if rule.Duration.TimeUnit == "YEARS" {
		amount := rule.Duration.TimeAmount
		view.Years = &amount
	}
	return view
}

func toBucketPreauthenticatedRequest(item ociPreauthenticatedRequest) models.BucketPreauthenticatedRequestView {
	return models.BucketPreauthenticatedRequestView{
		ID:                  strings.TrimSpace(item.ID),
		Name:                strings.TrimSpace(item.Name),
		AccessType:          strings.TrimSpace(item.AccessType),
		BucketListingAction: strings.TrimSpace(item.BucketListingAction),
		ObjectName:          item.ObjectName,
		TimeCreated:         strings.TrimSpace(item.TimeCreated),
		TimeExpires:         strings.TrimSpace(item.TimeExpires),
		AccessURI:           strings.TrimSpace(item.AccessURI),
	}
}

func existingPARChanged(current ociPreauthenticatedRequest, desired models.BucketPreauthenticatedRequestView) bool {
	currentExpiry, currentErr := time.Parse(time.RFC3339, strings.TrimSpace(current.TimeExpires))
	desiredExpiry, desiredErr := time.Parse(time.RFC3339, strings.TrimSpace(desired.TimeExpires))
	return currentErr != nil || desiredErr != nil || !currentExpiry.Equal(desiredExpiry) || strings.TrimSpace(current.Name) != strings.TrimSpace(desired.Name) ||
		strings.TrimSpace(current.AccessType) != strings.TrimSpace(desired.AccessType) ||
		strings.TrimSpace(current.BucketListingAction) != normalizePARBucketListingAction(desired.BucketListingAction) ||
		current.ObjectName != desired.ObjectName
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

func ociRetentionRulesMatch(desired []models.BucketRetentionRuleView, before map[string]ociRetentionRule, observed []ociRetentionRule) bool {
	if len(desired) != len(observed) {
		return false
	}
	actual := make(map[string]ociRetentionRule, len(observed))
	for _, rule := range observed {
		if rule.ID == "" {
			return false
		}
		if _, duplicate := actual[rule.ID]; duplicate {
			return false
		}
		actual[rule.ID] = rule
	}
	for _, want := range desired {
		got, ok := actual[want.ID]
		if !ok {
			return false
		}
		delete(actual, want.ID)
		name := strings.TrimSpace(want.DisplayName)
		original, existed := before[want.ID]
		if name == "" && existed {
			name = strings.TrimSpace(original.DisplayName)
		}
		if strings.TrimSpace(got.DisplayName) != name {
			return false
		}
		duration, err := ociDesiredRetentionDuration(want)
		if err != nil || !reflect.DeepEqual(duration, got.Duration) {
			return false
		}

		if (got.TimeRuleLocked == nil) != (original.TimeRuleLocked == nil) {
			return false
		}
		if got.TimeRuleLocked != nil && !got.TimeRuleLocked.Equal(*original.TimeRuleLocked) {
			return false
		}
	}
	return true
}
