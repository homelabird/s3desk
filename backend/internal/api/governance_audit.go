package api

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"
	"s3desk/internal/logging"
	"s3desk/internal/models"
	"sort"
	"time"
)

// Observations supplement adapter readback checks. They are not permission-effect
// tests or a concurrency guard; errors must never expose provider response bodies.
func beginGovernanceAudit[T any](s *server, r *http.Request, profile models.ProfileSecrets, bucket, section string, get func(context.Context, models.ProfileSecrets, string) (T, error)) func(error) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	before, beforeErr := get(ctx, profile, bucket)
	cancel()
	return func(writeErr error) {
		ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 10*time.Second)
		defer cancel()
		after, afterErr := get(ctx, profile, bucket)
		fields := s.policyAuditFields(r, 0)
		delete(fields, "http_status")
		fields["event"] = "bucket.policy." + section + ".observation"
		fields["before"] = governanceAuditSummary(before, beforeErr)
		fields["after"] = governanceAuditSummary(after, afterErr)
		fields["write_call_failed"] = writeErr != nil
		fields["outcome"] = "unconfirmed"
		if afterErr == nil {
			fields["outcome"] = "state_observed"
		}
		if beforeErr == nil && afterErr == nil {
			fields["returned_view_equal"] = reflect.DeepEqual(before, after)
			fields["changed_summary_fields"] = changedGovernanceSummaryFields(governanceAuditSummary(before, nil), governanceAuditSummary(after, nil))
		}
		logging.InfoFields("bucket governance change observation", fields)
	}
}

func changedGovernanceSummaryFields(before, after map[string]any) []string {
	keys := map[string]bool{}
	for key := range before {
		keys[key] = true
	}
	for key := range after {
		keys[key] = true
	}
	changed := []string{}
	for key := range keys {
		if !reflect.DeepEqual(before[key], after[key]) {
			changed = append(changed, key)
		}
	}
	sort.Strings(changed)
	return changed
}

// Explicit allowlist: no principal, key ID, rule body, policy ID, tag or PAR URI.
func governanceAuditSummary(value any, err error) map[string]any {
	summary := map[string]any{"known": err == nil}
	if err != nil {
		return summary
	}
	switch view := value.(type) {
	case models.BucketAccessView:
		summary["binding_count"] = len(view.Bindings)
		summary["stored_policy_count"] = len(view.StoredAccessPolicies)
		if view.ObjectOwnership != nil {
			summary["ownership"] = view.ObjectOwnership.Mode
		}
	case models.BucketPublicExposureView:
		summary["mode"] = view.Mode
		summary["visibility"] = view.Visibility
		if view.BlockPublicAccess != nil {
			summary["block_public_access"] = *view.BlockPublicAccess
		}
		if view.PublicAccessPrevention != nil {
			summary["public_access_prevention"] = *view.PublicAccessPrevention
		}
	case models.BucketProtectionView:
		if view.UniformAccess != nil {
			summary["uniform_access"] = *view.UniformAccess
		}
		if view.Retention != nil {
			summary["retention_enabled"] = view.Retention.Enabled
			summary["retention_locked"] = view.Retention.Locked
			summary["retention_rule_count"] = len(view.Retention.Rules)
			if view.Retention.Days != nil {
				summary["retention_days"] = *view.Retention.Days
			}
		}
		if view.SoftDelete != nil {
			summary["soft_delete_enabled"] = view.SoftDelete.Enabled
			if view.SoftDelete.Days != nil {
				summary["soft_delete_days"] = *view.SoftDelete.Days
			}
		}
		if view.Immutability != nil {
			summary["immutability_enabled"] = view.Immutability.Enabled
			summary["immutability_mode"] = view.Immutability.Mode
			summary["legal_hold"] = view.Immutability.LegalHold
			summary["legal_hold_tag_count"] = len(view.Immutability.LegalHoldTags)
			if view.Immutability.Days != nil {
				summary["immutability_days"] = *view.Immutability.Days
			}
		}
	case models.BucketEncryptionView:
		summary["mode"] = view.Mode
		summary["key_configured"] = view.KMSKeyID != ""
	case models.BucketLifecycleView:
		var rules []json.RawMessage
		if json.Unmarshal(view.Rules, &rules) == nil && rules != nil {
			summary["rule_count"] = len(rules)
		}
	case models.BucketSharingView:
		summary["stored_policy_count"] = len(view.StoredAccessPolicies)
		summary["par_count"] = len(view.PreauthenticatedRequests)
	default:
		summary["known"] = false
	}
	return summary
}
