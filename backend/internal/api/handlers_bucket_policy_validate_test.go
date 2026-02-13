package api

import (
	"strings"
	"testing"

	"s3desk/internal/models"
)

func TestValidateBucketPolicyStaticGCS(t *testing.T) {
	t.Parallel()

	t.Run("valid policy with public grant emits warnings only", func(t *testing.T) {
		t.Parallel()
		policy := map[string]any{
			"bindings": []any{
				map[string]any{
					"role":    "roles/storage.objectViewer",
					"members": []any{"allUsers"},
				},
			},
		}

		errs, warns := validateBucketPolicyStatic(models.ProfileProviderGcpGcs, "demo", policy)
		if len(errs) != 0 {
			t.Fatalf("expected no errors, got %v", errs)
		}
		if !containsSubstring(warns, "etag") {
			t.Fatalf("expected etag warning, got %v", warns)
		}
		if !containsSubstring(warns, "public access via allUsers") {
			t.Fatalf("expected public access warning, got %v", warns)
		}
	})

	t.Run("missing bindings returns error", func(t *testing.T) {
		t.Parallel()
		policy := map[string]any{"version": 1}

		errs, _ := validateBucketPolicyStatic(models.ProfileProviderGcpGcs, "demo", policy)
		if !containsSubstring(errs, "must include bindings") {
			t.Fatalf("expected missing bindings error, got %v", errs)
		}
	})
}

func TestValidateBucketPolicyStaticAzure(t *testing.T) {
	t.Parallel()

	t.Run("invalid policy is rejected", func(t *testing.T) {
		t.Parallel()
		policy := map[string]any{
			"publicAccess": "invalid",
			"storedAccessPolicies": []any{
				map[string]any{"id": "", "permission": "invalid"},
				map[string]any{"id": "p2"},
				map[string]any{"id": "p3"},
				map[string]any{"id": "p4"},
				map[string]any{"id": "p5"},
				map[string]any{"id": "p6"},
			},
		}

		errs, _ := validateBucketPolicyStatic(models.ProfileProviderAzureBlob, "demo", policy)
		if !containsSubstring(errs, "publicAccess must be one of") {
			t.Fatalf("expected invalid publicAccess error, got %v", errs)
		}
		if !containsSubstring(errs, "maximum of 5 stored access policies") {
			t.Fatalf("expected max policies error, got %v", errs)
		}
		if !containsSubstring(errs, "stored access policy id is required") {
			t.Fatalf("expected id required error, got %v", errs)
		}
		if !containsSubstring(errs, "permission must be a combination") {
			t.Fatalf("expected permission format error, got %v", errs)
		}
	})

	t.Run("valid policy passes", func(t *testing.T) {
		t.Parallel()
		policy := map[string]any{
			"publicAccess": "private",
			"storedAccessPolicies": []any{
				map[string]any{
					"id":         "readonly",
					"start":      "2026-01-14T00:00:00Z",
					"expiry":     "2026-01-15T00:00:00Z",
					"permission": "r",
				},
			},
		}

		errs, warns := validateBucketPolicyStatic(models.ProfileProviderAzureBlob, "demo", policy)
		if len(errs) != 0 {
			t.Fatalf("expected no errors, got %v", errs)
		}
		if len(warns) != 0 {
			t.Fatalf("expected no warnings, got %v", warns)
		}
	})
}

func containsSubstring(items []string, needle string) bool {
	needle = strings.ToLower(strings.TrimSpace(needle))
	if needle == "" {
		return false
	}
	for _, item := range items {
		if strings.Contains(strings.ToLower(item), needle) {
			return true
		}
	}
	return false
}
