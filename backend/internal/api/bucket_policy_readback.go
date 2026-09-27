package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"reflect"
	"sort"
	"strings"
	"time"

	"s3desk/internal/azureacl"
	"s3desk/internal/bucketpolicy"
	"s3desk/internal/logging"
	"s3desk/internal/models"
)

// Observe after errors too: a failed response does not prove a write was rejected.
// Keep the original write error; never automatically repeat the mutation.
func (svc bucketPolicyHTTPService) confirmRawPolicy(r *http.Request, provider models.ProfileProvider, desired []byte, before *models.BucketPolicyResponse, written bucketpolicy.Response, writeErr error) error {
	switch provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible, models.ProfileProviderAzureBlob:
	case models.ProfileProviderGcpGcs:
		if r.Method == http.MethodDelete {
			return nil
		}
	default:
		return nil
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 10*time.Second)
	defer cancel()
	observed, _, callErr, upstream, status, _, _, _, readErr := svc.executeGet(r.WithContext(ctx))
	confirmed := callErr == nil && readErr == nil && upstream.Status == 0 && status == 0 && observed != nil
	if confirmed {
		if r.Method == http.MethodDelete && provider != models.ProfileProviderAzureBlob {
			confirmed = !observed.Exists
		} else {
			if r.Method == http.MethodDelete {
				desired = []byte(`{"publicAccess":"private","storedAccessPolicies":[]}`)
			}
			confirmed = observed.Exists && rawPolicyMatches(provider, desired, observed.Policy)
		}
	}
	fields := svc.server.policyAuditFields(r, written.Status)
	fields["event"] = "bucket.policy.observed"
	fields["outcome"] = "unconfirmed"
	if confirmed {
		fields["outcome"] = "configuration_confirmed"
	}
	fields["before"] = rawPolicyAuditSummary(before)
	after := observed
	if callErr != nil || readErr != nil || upstream.Status != 0 || status != 0 {
		after = nil
	}
	fields["after"] = rawPolicyAuditSummary(after)
	if before != nil && after != nil {
		changed := before.Exists != after.Exists
		if before.Exists && after.Exists {
			changed = !rawPolicyMatches(provider, before.Policy, after.Policy)
		}
		fields["configuration_matches_before"] = !changed
	}
	fields["write_call_failed"] = writeErr != nil
	logging.InfoFields("raw bucket policy observed", fields)
	accepted := written.Status == http.StatusOK || written.Status == http.StatusNoContent
	if r.Method == http.MethodDelete && (provider == models.ProfileProviderAwsS3 || provider == models.ProfileProviderS3Compatible) && written.Status == http.StatusNotFound {
		e := parseXMLError(written.Body)
		accepted = isNoSuchBucketPolicy(e.Code, e.Message)
	}
	if writeErr == nil && accepted && !confirmed {
		return newBucketPolicyHTTPError(http.StatusBadGateway, "bucket_policy_unconfirmed", "policy change could not be confirmed; reload and compare before retrying", nil)
	}
	return nil
}

func rawPolicyMatches(provider models.ProfileProvider, desired, observed []byte) bool {
	var want, got map[string]any
	for i, body := range [][]byte{desired, observed} {
		decoder := json.NewDecoder(bytes.NewReader(body))
		decoder.UseNumber()
		target := &want
		if i == 1 {
			target = &got
		}
		if decoder.Decode(target) != nil || *target == nil {
			return false
		}
		var extra any
		if decoder.Decode(&extra) != io.EOF {
			return false
		}
	}
	if provider == models.ProfileProviderGcpGcs {
		// Revisions change after writes and must still be present on the readback.
		etag, ok := got["etag"].(string)
		if !ok || strings.TrimSpace(etag) == "" {
			return false
		}
		delete(want, "etag")
		delete(got, "etag")
	}
	for _, policy := range []map[string]any{want, got} {
		normalizeRawPolicy(provider, policy)
	}
	// Unknown fields remain part of the comparison.
	return reflect.DeepEqual(want, got)
}

// Normalize only known unordered collections; preserve duplicates and unknown fields.
func normalizeRawPolicy(provider models.ProfileProvider, policy map[string]any) {
	switch provider {
	case models.ProfileProviderGcpGcs:
		if bindings, ok := policy["bindings"].([]any); ok {
			for _, binding := range bindings {
				if entry, ok := binding.(map[string]any); ok {
					sortRawPolicyArray(entry, "members")
				}
			}
			sortRawPolicyArray(policy, "bindings")
		}
	case models.ProfileProviderAzureBlob:
		if policies, ok := policy["storedAccessPolicies"].([]any); ok {
			for _, item := range policies {
				entry, ok := item.(map[string]any)
				if !ok {
					continue
				}
				for _, field := range []string{"start", "expiry"} {
					if value, ok := entry[field].(string); ok {
						if parsed, err := azureacl.ParseStoredPolicyTime(value); err == nil {
							entry[field] = parsed.UTC().Format(time.RFC3339Nano)
						}
					}
				}
			}
			sortRawPolicyArray(policy, "storedAccessPolicies")
		}
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible:
		statements, ok := policy["Statement"].([]any)
		if !ok {
			if statement, ok := policy["Statement"].(map[string]any); ok {
				statements = []any{statement}
				policy["Statement"] = statements
			}
		}
		for _, statement := range statements {
			entry, ok := statement.(map[string]any)
			if !ok {
				continue
			}
			for _, key := range []string{"Action", "NotAction", "Resource", "NotResource"} {
				if value, ok := entry[key].(string); ok {
					entry[key] = []any{value}
				}
				sortRawPolicyArray(entry, key)
			}
			for _, key := range []string{"Principal", "NotPrincipal"} {
				if principals, ok := entry[key].(map[string]any); ok {
					for kind, value := range principals {
						if text, ok := value.(string); ok {
							principals[kind] = []any{text}
						}
						sortRawPolicyArray(principals, kind)
					}
				}
			}
		}
		sortRawPolicyArray(policy, "Statement")
	}
}

func sortRawPolicyArray(object map[string]any, key string) {
	if values, ok := object[key].([]any); ok {
		sort.SliceStable(values, func(i, j int) bool {
			left, _ := json.Marshal(values[i])
			right, _ := json.Marshal(values[j])
			return bytes.Compare(left, right) < 0
		})
	}
}

func (svc bucketPolicyHTTPService) readRawPolicyBeforeChange(r *http.Request, provider models.ProfileProvider) *models.BucketPolicyResponse {
	switch provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible, models.ProfileProviderAzureBlob:
	case models.ProfileProviderGcpGcs:
		if r.Method == http.MethodDelete {
			return nil
		}
	default:
		return nil
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	observed, _, callErr, upstream, status, _, _, _, err := svc.executeGet(r.WithContext(ctx))
	if err != nil || callErr != nil || upstream.Status != 0 || status != 0 {
		return nil
	}
	return observed
}

// Counts and existence only: never record principals, policy text, IDs or signed URLs.
func rawPolicyAuditSummary(observed *models.BucketPolicyResponse) map[string]any {
	summary := map[string]any{"known": observed != nil}
	if observed == nil {
		return summary
	}
	summary["exists"] = observed.Exists
	if !observed.Exists {
		return summary
	}
	var policy map[string]any
	if json.Unmarshal(observed.Policy, &policy) != nil || policy == nil {
		summary["known"] = false
		return summary
	}
	for _, field := range []string{"Statement", "bindings", "storedAccessPolicies"} {
		if items, ok := policy[field].([]any); ok {
			summary[field+"_count"] = len(items)
		}
	}
	if _, ok := policy["Statement"].(map[string]any); ok {
		summary["Statement_count"] = 1
	}
	return summary
}
