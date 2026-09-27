package api

import (
	"encoding/json"
	"strings"
	"testing"

	"s3desk/internal/models"
)

func TestGCSMembersRejectsMalformedTypes(t *testing.T) {
	for _, members := range []string{`[]`, `null`, `"allUsers"`, `{}`, `[42]`, `[null]`, `[""]`, `["allUsers", false]`} {
		t.Run(members, func(t *testing.T) {
			var policy any
			if err := json.Unmarshal([]byte(`{"bindings":[{"role":"roles/storage.objectViewer","members":`+members+`}]}`), &policy); err != nil {
				t.Fatal(err)
			}
			errs, _ := validateBucketPolicyStatic(models.ProfileProviderGcpGcs, "demo", policy)
			if !containsSubstring(errs, "members") {
				t.Fatalf("malformed members accepted: %s", members)
			}
		})
	}
}

func TestValidateBucketPolicyStaticGCS(t *testing.T) {
	t.Parallel()

	t.Run("valid policy with public grant emits warnings only", func(t *testing.T) {
		t.Parallel()
		policy := map[string]any{
			"etag": "loaded-revision",
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
		if !containsSubstring(errs, "permission must use distinct lowercase Blob") {
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

func TestGCSConditionsValidation(t *testing.T) {
	for _, tc := range []struct {
		name, version, condition string
		valid                    bool
	}{
		{"valid", `3`, `{"title":"limited","expression":"request.time < timestamp('2030-01-01T00:00:00Z')"}`, true},
		{"legacy version", `1`, `{"title":"limited","expression":"true"}`, false},
		{"string version", `"3"`, `{"title":"limited","expression":"true"}`, false},
		{"fractional version", `3.5`, `{"title":"limited","expression":"true"}`, false},
		{"null version", `null`, `{"title":"limited","expression":"true"}`, false},
		{"null condition", `3`, `null`, false},
		{"array condition", `3`, `[]`, false},
		{"missing expression", `3`, `{"title":"limited"}`, false},
		{"missing title", `3`, `{"expression":"true"}`, false},
		{"wrong description", `3`, `{"title":"limited","expression":"true","description":42}`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var policy any
			if err := json.Unmarshal([]byte(`{"etag":"loaded-revision","version":`+tc.version+`,"bindings":[{"role":"roles/storage.objectViewer","members":["user:reader@example.test"],"condition":`+tc.condition+`}]}`), &policy); err != nil {
				t.Fatal(err)
			}
			errs, _ := validateBucketPolicyStatic(models.ProfileProviderGcpGcs, "demo", policy)
			if (len(errs) == 0) != tc.valid {
				t.Fatalf("valid=%v, errors=%v", tc.valid, errs)
			}
		})
	}
}

func TestAzureStoredPolicyFieldTypes(t *testing.T) {
	for _, field := range []string{"start", "expiry", "permission"} {
		for _, value := range []any{nil, float64(42), false, []any{}, map[string]any{}} {
			policy := map[string]any{"publicAccess": "private", "storedAccessPolicies": []any{
				map[string]any{"id": "reader", field: value},
			}}
			errs, _ := validateBucketPolicyStatic(models.ProfileProviderAzureBlob, "demo", policy)
			if !containsSubstring(errs, field+" must be a string") {
				t.Errorf("field=%s value=%#v: expected type error, got %v", field, value, errs)
			}
		}
	}
}

func TestS3PolicyEffectValidation(t *testing.T) {
	for _, provider := range []models.ProfileProvider{models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible} {
		for _, effect := range []any{nil, "", "allow", "DENY", " Allow", "Permit", true, float64(1), "Allow", "Deny"} {
			statement := map[string]any{"Action": "s3:GetObject", "Resource": "arn:aws:s3:::demo/*", "Principal": "*"}
			if effect != nil {
				statement["Effect"] = effect
			}
			policy := map[string]any{"Version": "2012-10-17", "Statement": []any{statement}}
			errs, _ := validateBucketPolicyStatic(provider, "demo", policy)
			valid := effect == "Allow" || effect == "Deny"
			if (len(errs) == 0) != valid {
				t.Errorf("provider=%s effect=%v errors=%v", provider, effect, errs)
			}
		}
	}
}

func TestS3StatementAlternatives(t *testing.T) {
	for _, field := range []string{"Action", "Resource", "Principal"} {
		for _, mode := range []string{"positive", "negative", "missing", "both"} {
			t.Run(field+"/"+mode, func(t *testing.T) {
				stmt := map[string]any{"Effect": "Deny", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::demo/*", "Principal": "*"}
				value := stmt[field]
				if mode == "negative" || mode == "missing" {
					delete(stmt, field)
				}
				if mode == "negative" || mode == "both" {
					stmt["Not"+field] = value
				}
				errs, warns := validateBucketPolicyStatic(models.ProfileProviderAwsS3, "demo", map[string]any{
					"Version": "2012-10-17", "Statement": []any{stmt},
				})
				valid := mode == "positive" || mode == "negative"
				if (len(errs) == 0) != valid {
					t.Fatalf("valid=%v errors=%v", valid, errs)
				}
				if valid && len(warns) != 0 {
					t.Fatalf("valid alternative was warned: %v", warns)
				}
			})
		}
	}
}

func TestS3StatementValueTypes(t *testing.T) {
	for _, field := range []string{"Action", "NotAction", "Resource", "NotResource", "Principal", "NotPrincipal"} {
		for _, value := range []any{nil, false, float64(42), "", []any{}, []any{"*", nil}, map[string]any{}} {
			stmt := map[string]any{"Effect": "Allow", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::demo/*", "Principal": "*"}
			delete(stmt, strings.TrimPrefix(field, "Not"))
			stmt[field] = value
			errs, _ := validateS3BucketPolicyStatic("demo", map[string]any{"Statement": []any{stmt}})
			if len(errs) == 0 {
				t.Errorf("accepted %s=%#v", field, value)
			}
		}
	}
	for _, principal := range []any{"*", map[string]any{"AWS": "arn:aws:iam::123456789012:root"}, map[string]any{"Service": []any{"cloudtrail.amazonaws.com"}}} {
		errs, _ := validateS3BucketPolicyStatic("demo", map[string]any{"Statement": []any{map[string]any{
			"Effect": "Allow", "Action": []any{"s3:GetObject"}, "Resource": []any{"arn:aws:s3:::demo/*"}, "Principal": principal,
		}}})
		if len(errs) != 0 {
			t.Errorf("valid principal=%#v rejected: %v", principal, errs)
		}
	}
}

func TestS3PolicyRequiresStatement(t *testing.T) {
	errs, _ := validateS3BucketPolicyStatic("demo", map[string]any{"Version": "2012-10-17"})
	if !containsSubstring(errs, "Statement is required") {
		t.Fatalf("errors=%v", errs)
	}
}

func TestAzurePolicyRejectsUnknownFields(t *testing.T) {
	for _, policy := range []string{
		`{"publicAccess":"private","storedAccessPolicies":[],"unknown":true}`,
		`{"publicAccess":"private","storedAccessPolicies":[{"id":"reader","permissions":"r"}]}`,
	} {
		var value any
		if err := json.Unmarshal([]byte(policy), &value); err != nil {
			t.Fatal(err)
		}
		errs, _ := validateAzureContainerPolicyStatic(value)
		if !containsSubstring(errs, "unsupported field") {
			t.Fatalf("errors=%v", errs)
		}
	}
}

func TestAzurePolicyRequiresExplicitReplacementFields(t *testing.T) {
	for _, fixture := range []struct {
		policy string
		valid  bool
	}{
		{`{}`, false},
		{`{"publicAccess":"private"}`, false},
		{`{"storedAccessPolicies":[]}`, false},
		{`{"publicAccess":"","storedAccessPolicies":[]}`, false},
		{`{"publicAccess":"private","storedAccessPolicies":null}`, false},
		{`{"publicAccess":"private","storedAccessPolicies":[]}`, true},
	} {
		var policy any
		if err := json.Unmarshal([]byte(fixture.policy), &policy); err != nil {
			t.Fatal(err)
		}
		errs, _ := validateAzureContainerPolicyStatic(policy)
		if (len(errs) == 0) != fixture.valid {
			t.Errorf("policy=%s errors=%v", fixture.policy, errs)
		}
	}
}

func TestPolicyVersionAndETagTypes(t *testing.T) {
	for _, version := range []any{nil, 2012, "", "latest", "2012-10-17 ", "2008-10-17", "2012-10-17"} {
		errs, _ := validateS3BucketPolicyStatic("demo", map[string]any{"Version": version, "Statement": []any{}})
		valid := version == "2008-10-17" || version == "2012-10-17"
		if (len(errs) == 0) != valid {
			t.Errorf("version=%v errors=%v", version, errs)
		}
	}
	for _, etag := range []any{nil, 42, false, "", " ", "revision-1"} {
		errs, _ := validateGCSIamPolicyStatic(map[string]any{"etag": etag, "bindings": []any{}})
		if (len(errs) == 0) != (etag == "revision-1") {
			t.Errorf("etag=%v errors=%v", etag, errs)
		}
	}
}

func TestAzureStoredPolicyIdentifierConstraints(t *testing.T) {
	for _, tc := range []struct {
		name    string
		ids     []string
		invalid bool
	}{
		{"boundary", []string{strings.Repeat("x", 64)}, false},
		{"unicode boundary", []string{strings.Repeat("한", 64)}, false},
		{"too long", []string{strings.Repeat("x", 65)}, true},
		{"duplicate", []string{"read", " read "}, true},
		{"case distinct", []string{"read", "Read"}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			policies := []any{}
			for _, id := range tc.ids {
				policies = append(policies, map[string]any{"id": id})
			}
			errs, _ := validateAzureContainerPolicyStatic(map[string]any{"publicAccess": "private", "storedAccessPolicies": policies})
			if (len(errs) > 0) != tc.invalid {
				t.Fatalf("errors=%v, invalid=%v", errs, tc.invalid)
			}
		})
	}
}

func TestGCSIAMPolicyVersionValidation(t *testing.T) {
	for _, tc := range []struct {
		raw     string
		invalid bool
	}{
		{`0`, false}, {`1`, false}, {`3`, false}, {`2`, true}, {`4`, true},
		{`-1`, true}, {`1.5`, true}, {`"3"`, true}, {`null`, true}, {`true`, true},
	} {
		var policy map[string]any
		if err := json.Unmarshal([]byte(`{"etag":"loaded-revision","version":`+tc.raw+`,"bindings":[]}`), &policy); err != nil {
			t.Fatal(err)
		}
		errs, _ := validateGCSIamPolicyStatic(policy)
		if (len(errs) > 0) != tc.invalid {
			t.Errorf("version=%s errors=%v", tc.raw, errs)
		}
	}
	errs, _ := validateGCSIamPolicyStatic(map[string]any{"etag": "loaded-revision", "bindings": []any{}})
	if len(errs) != 0 {
		t.Fatalf("omitted version: %v", errs)
	}
}

func TestS3ConditionShape(t *testing.T) {
	for _, tc := range []struct {
		raw     string
		invalid bool
	}{
		{`{"Bool":{"aws:SecureTransport":false}}`, false},
		{`{"NumericLessThan":{"s3:max-keys":10}}`, false},
		{`{"StringEquals":{"s3:prefix":["", "public/"]}}`, false},
		{`null`, true}, {`[]`, true}, {`"true"`, true}, {`{}`, true},
		{`{"Bool":false}`, true}, {`{"Bool":{}}`, true},
		{`{"Bool":{"aws:SecureTransport":null}}`, true},
		{`{"StringEquals":{"s3:prefix":[]}}`, true},
		{`{"StringEquals":{"s3:prefix":[["public/"]]}}`, true},
	} {
		var condition any
		if err := json.Unmarshal([]byte(tc.raw), &condition); err != nil {
			t.Fatal(err)
		}
		statement := map[string]any{"Effect": "Allow", "Action": "s3:GetObject", "Resource": "*", "Principal": "*", "Condition": condition}
		errs, _ := validateS3BucketPolicyStatic("demo", map[string]any{"Statement": statement})
		if (len(errs) > 0) != tc.invalid {
			t.Errorf("condition=%s errors=%v", tc.raw, errs)
		}
	}
}

func TestS3ResourceLintRespectsBucketNameBoundary(t *testing.T) {
	for _, tc := range []struct {
		resource string
		warning  bool
	}{
		{"arn:aws:s3:::demo", false}, {"arn:aws:s3:::demo/*", false},
		{"arn:aws:s3:::demo-backup/*", true}, {"arn:aws:s3:::other/demo", true},
		{"arn:aws:s3:::demo*", true},
	} {
		policy := map[string]any{"Statement": []any{map[string]any{"Effect": "Allow", "Principal": "*", "Action": "s3:GetObject", "Resource": tc.resource}}}
		errs, warnings := validateS3BucketPolicyStatic("demo", policy)
		if len(errs) != 0 {
			t.Fatalf("unexpected errors: %v", errs)
		}
		if containsSubstring(warnings, "does not explicitly reference") != tc.warning {
			t.Fatalf("resource=%s warnings=%v", tc.resource, warnings)
		}
	}
}

func TestS3PrincipalTypeNames(t *testing.T) {
	for _, field := range []string{"Principal", "NotPrincipal"} {
		for _, kind := range []string{"AWS", "Service", "Federated", "CanonicalUser", "aws", "User", "", "Unknown"} {
			policy := map[string]any{"Statement": []any{map[string]any{"Effect": "Deny", field: map[string]any{kind: "example"}, "Action": "s3:GetObject", "Resource": "arn:aws:s3:::demo/*"}}}
			errs, _ := validateS3BucketPolicyStatic("demo", policy)
			valid := kind == "AWS" || kind == "Service" || kind == "Federated" || kind == "CanonicalUser"
			if (len(errs) == 0) != valid {
				t.Fatalf("%s.%s errors=%v", field, kind, errs)
			}
		}
	}
}
