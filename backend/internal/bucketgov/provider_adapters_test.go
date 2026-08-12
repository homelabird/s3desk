package bucketgov

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	"s3desk/internal/azureacl"
	"s3desk/internal/azurearmimmutability"
	"s3desk/internal/gcsbucket"
	"s3desk/internal/gcsiam"
	"s3desk/internal/models"
	"s3desk/internal/ocicli"
)

func TestNewDefaultRegistryWithOptionsThreadsAllowRemoteToProviderAdapters(t *testing.T) {
	t.Parallel()

	registry := NewDefaultRegistryWithOptions(DefaultRegistryOptions{AllowRemote: true})
	cases := []struct {
		name     string
		provider models.ProfileProvider
		run      func(Adapter) error
	}{
		{
			name:     "aws",
			provider: models.ProfileProviderAwsS3,
			run: func(adapter Adapter) error {
				_, err := adapter.(publicExposureSection).GetPublicExposure(context.Background(), models.ProfileSecrets{
					Provider:        models.ProfileProviderAwsS3,
					Endpoint:        "http://127.0.0.1:9000",
					Region:          "us-east-1",
					AccessKeyID:     "access",
					SecretAccessKey: "secret",
				}, "demo")
				return err
			},
		},
		{
			name:     "azure",
			provider: models.ProfileProviderAzureBlob,
			run: func(adapter Adapter) error {
				_, err := adapter.(accessSection).GetAccess(context.Background(), models.ProfileSecrets{
					Provider:         models.ProfileProviderAzureBlob,
					AzureAccountName: "acct",
					AzureAccountKey:  base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef")),
					AzureEndpoint:    "http://127.0.0.1:10000/acct",
				}, "demo")
				return err
			},
		},
		{
			name:     "gcs",
			provider: models.ProfileProviderGcpGcs,
			run: func(adapter Adapter) error {
				_, err := adapter.(accessSection).GetAccess(context.Background(), models.ProfileSecrets{
					Provider:     models.ProfileProviderGcpGcs,
					GcpAnonymous: true,
					GcpEndpoint:  "http://127.0.0.1:4443",
				}, "demo")
				return err
			},
		},
		{
			name:     "oci",
			provider: models.ProfileProviderOciObjectStorage,
			run: func(adapter Adapter) error {
				_, err := adapter.(publicExposureSection).GetPublicExposure(context.Background(), models.ProfileSecrets{
					Provider:     models.ProfileProviderOciObjectStorage,
					OciNamespace: "namespace",
					OciEndpoint:  "http://127.0.0.1:8080/opc/v1",
				}, "demo")
				return err
			},
		},
	}

	for _, tt := range cases {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			adapter, err := registry.Resolve(tt.provider)
			if err != nil {
				t.Fatalf("Resolve err=%v", err)
			}
			assertLoopbackOperationError(t, tt.run(adapter))
		})
	}
}

func assertLoopbackOperationError(t *testing.T, err error) {
	t.Helper()

	var opErr *OperationError
	if !errors.As(err, &opErr) {
		t.Fatalf("err=%T, want OperationError", err)
	}
	if got, _ := opErr.Details["error"].(string); !strings.Contains(got, "loopback or link-local") {
		t.Fatalf("details.error=%q, want loopback rejection", got)
	}
}

func TestGCSAdapterGetAccessAndPublicExposure(t *testing.T) {
	t.Parallel()

	adapter := &gcsAdapter{
		getPolicy: func(context.Context, models.ProfileSecrets, string) (gcsiam.Response, error) {
			return gcsiam.Response{
				Status: 200,
				Body: []byte(`{
					"version": 3,
					"etag": "etag-123",
					"bindings": [
						{
							"role": "roles/storage.objectViewer",
							"members": ["allUsers"]
						},
						{
							"role": "roles/storage.objectAdmin",
							"members": ["user:alice@example.com"],
							"condition": {"title":"expires-soon"}
						}
					]
				}`),
			}, nil
		},
		putPolicy: func(context.Context, models.ProfileSecrets, string, []byte) (gcsiam.Response, error) {
			return gcsiam.Response{Status: 200}, nil
		},
	}

	access, err := adapter.GetAccess(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetAccess err=%v", err)
	}
	if access.ETag != "etag-123" {
		t.Fatalf("etag=%q, want etag-123", access.ETag)
	}
	if len(access.Bindings) != 2 {
		t.Fatalf("bindings=%d, want 2", len(access.Bindings))
	}
	if len(access.Bindings[1].Condition) == 0 {
		t.Fatalf("condition=%s, want preserved condition", string(access.Bindings[1].Condition))
	}
	if len(access.Warnings) == 0 {
		t.Fatalf("warnings=%v, want public/etag warning set", access.Warnings)
	}

	publicExposure, err := adapter.GetPublicExposure(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetPublicExposure err=%v", err)
	}
	if publicExposure.Mode != models.BucketPublicExposureModePublic {
		t.Fatalf("mode=%q, want public", publicExposure.Mode)
	}
}

func TestGCSAdapterPutAccessPreservesCurrentVersionAndETag(t *testing.T) {
	t.Parallel()

	var body []byte
	adapter := &gcsAdapter{
		getPolicy: func(context.Context, models.ProfileSecrets, string) (gcsiam.Response, error) {
			return gcsiam.Response{
				Status: 200,
				Body:   []byte(`{"version":3,"etag":"etag-current","bindings":[]}`),
			}, nil
		},
		putPolicy: func(_ context.Context, _ models.ProfileSecrets, _ string, next []byte) (gcsiam.Response, error) {
			body = append([]byte(nil), next...)
			return gcsiam.Response{Status: 200}, nil
		},
	}

	err := adapter.PutAccess(context.Background(), models.ProfileSecrets{}, "demo", models.BucketAccessPutRequest{
		Bindings: []models.BucketAccessBinding{
			{
				Role:      "roles/storage.objectViewer",
				Members:   []string{"user:alice@example.com"},
				Condition: []byte(`{"title":"if-approved"}`),
			},
		},
	})
	if err != nil {
		t.Fatalf("PutAccess err=%v", err)
	}

	var policy gcsIAMPolicy
	if err := json.Unmarshal(body, &policy); err != nil {
		t.Fatalf("decode put body err=%v", err)
	}
	if policy.Version != 3 {
		t.Fatalf("version=%d, want 3", policy.Version)
	}
	if policy.ETag != "etag-current" {
		t.Fatalf("etag=%q, want etag-current", policy.ETag)
	}
	if len(policy.Bindings) != 1 || policy.Bindings[0].Role != "roles/storage.objectViewer" {
		t.Fatalf("bindings=%+v, want preserved binding", policy.Bindings)
	}
}

func TestGCSAdapterPutPublicExposurePrivateRemovesPublicMembers(t *testing.T) {
	t.Parallel()

	var body []byte
	adapter := &gcsAdapter{
		getPolicy: func(context.Context, models.ProfileSecrets, string) (gcsiam.Response, error) {
			return gcsiam.Response{
				Status: 200,
				Body: []byte(`{
					"version": 3,
					"etag": "etag-current",
					"bindings": [
						{"role":"roles/storage.objectViewer","members":["allUsers","user:alice@example.com"]},
						{"role":"roles/storage.objectAdmin","members":["allAuthenticatedUsers"]}
					]
				}`),
			}, nil
		},
		putPolicy: func(_ context.Context, _ models.ProfileSecrets, _ string, next []byte) (gcsiam.Response, error) {
			body = append([]byte(nil), next...)
			return gcsiam.Response{Status: 200}, nil
		},
	}

	err := adapter.PutPublicExposure(context.Background(), models.ProfileSecrets{}, "demo", models.BucketPublicExposurePutRequest{
		Mode: models.BucketPublicExposureModePrivate,
	})
	if err != nil {
		t.Fatalf("PutPublicExposure err=%v", err)
	}

	var policy gcsIAMPolicy
	if err := json.Unmarshal(body, &policy); err != nil {
		t.Fatalf("decode put body err=%v", err)
	}
	if len(policy.Bindings) != 1 {
		t.Fatalf("bindings=%+v, want single non-public binding", policy.Bindings)
	}
	if got := policy.Bindings[0].Members; len(got) != 1 || got[0] != "user:alice@example.com" {
		t.Fatalf("members=%v, want non-public member only", got)
	}
}

func TestGCSAdapterPutPublicExposureAllowsPAPOnly(t *testing.T) {
	t.Parallel()

	policyCalls := 0
	var patchBody []byte
	adapter := &gcsAdapter{
		getPolicy: func(context.Context, models.ProfileSecrets, string) (gcsiam.Response, error) {
			policyCalls++
			return gcsiam.Response{Status: 200, Body: []byte(`{"bindings":[]}`)}, nil
		},
		putPolicy: func(context.Context, models.ProfileSecrets, string, []byte) (gcsiam.Response, error) {
			policyCalls++
			return gcsiam.Response{Status: 200}, nil
		},
		patchBucket: func(_ context.Context, _ models.ProfileSecrets, _ string, body []byte) (gcsbucket.Response, error) {
			patchBody = append([]byte(nil), body...)
			return gcsbucket.Response{Status: 200}, nil
		},
	}

	err := adapter.PutPublicExposure(context.Background(), models.ProfileSecrets{}, "demo", models.BucketPublicExposurePutRequest{
		PublicAccessPrevention: boolPtr(true),
	})
	if err != nil {
		t.Fatalf("PutPublicExposure err=%v", err)
	}
	if policyCalls != 0 {
		t.Fatalf("policyCalls=%d, want no IAM mutation for PAP-only request", policyCalls)
	}

	var patch map[string]any
	if err := json.Unmarshal(patchBody, &patch); err != nil {
		t.Fatalf("decode patch err=%v", err)
	}
	iamConfiguration, _ := patch["iamConfiguration"].(map[string]any)
	if got := iamConfiguration["publicAccessPrevention"]; got != "enforced" {
		t.Fatalf("publicAccessPrevention=%v, want enforced", got)
	}
}

func TestGCSAdapterGetProtectionAndVersioning(t *testing.T) {
	t.Parallel()

	adapter := &gcsAdapter{
		getBucket: func(context.Context, models.ProfileSecrets, string) (gcsbucket.Response, error) {
			return gcsbucket.Response{
				Status: 200,
				Body: []byte(`{
					"versioning":{"enabled":true},
					"iamConfiguration":{
						"uniformBucketLevelAccess":{"enabled":true},
						"publicAccessPrevention":"enforced"
					},
					"retentionPolicy":{
						"retentionPeriod":"90000",
						"effectiveTime":"2026-01-01T00:00:00Z",
						"isLocked":true
					}
				}`),
			}, nil
		},
	}

	protection, err := adapter.GetProtection(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetProtection err=%v", err)
	}
	if protection.UniformAccess == nil || !*protection.UniformAccess {
		t.Fatalf("uniformAccess=%v, want true", protection.UniformAccess)
	}
	if protection.Retention == nil || !protection.Retention.Enabled || protection.Retention.Days == nil || *protection.Retention.Days != 2 {
		t.Fatalf("retention=%+v, want rounded two-day retention", protection.Retention)
	}
	if len(protection.Warnings) == 0 {
		t.Fatalf("warnings=%v, want rounding/locked warnings", protection.Warnings)
	}

	versioning, err := adapter.GetVersioning(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetVersioning err=%v", err)
	}
	if versioning.Status != models.BucketVersioningStatusEnabled {
		t.Fatalf("status=%q, want enabled", versioning.Status)
	}

	publicExposure, err := adapter.GetPublicExposure(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetPublicExposure err=%v", err)
	}
	if publicExposure.PublicAccessPrevention == nil || !*publicExposure.PublicAccessPrevention {
		t.Fatalf("publicAccessPrevention=%v, want true", publicExposure.PublicAccessPrevention)
	}
}

func TestGCSAdapterPutProtectionAndVersioning(t *testing.T) {
	t.Parallel()

	var protectionBody []byte
	var versioningBody []byte
	days := 3
	callCount := 0
	adapter := &gcsAdapter{
		getBucket: func(context.Context, models.ProfileSecrets, string) (gcsbucket.Response, error) {
			callCount++
			if callCount == 1 {
				return gcsbucket.Response{
					Status: 200,
					Body: []byte(`{
						"iamConfiguration":{"uniformBucketLevelAccess":{"enabled":false}},
						"retentionPolicy":{"retentionPeriod":"86400","isLocked":false}
					}`),
				}, nil
			}
			return gcsbucket.Response{
				Status: 200,
				Body:   []byte(`{"versioning":{"enabled":false}}`),
			}, nil
		},
		patchBucket: func(_ context.Context, _ models.ProfileSecrets, _ string, body []byte) (gcsbucket.Response, error) {
			if len(protectionBody) == 0 {
				protectionBody = append([]byte(nil), body...)
			} else {
				versioningBody = append([]byte(nil), body...)
			}
			return gcsbucket.Response{Status: 200, Body: body}, nil
		},
	}

	err := adapter.PutProtection(context.Background(), models.ProfileSecrets{}, "demo", models.BucketProtectionPutRequest{
		UniformAccess: boolPtr(true),
		Retention: &models.BucketRetentionView{
			Enabled: true,
			Days:    &days,
		},
	})
	if err != nil {
		t.Fatalf("PutProtection err=%v", err)
	}

	err = adapter.PutVersioning(context.Background(), models.ProfileSecrets{}, "demo", models.BucketVersioningPutRequest{
		Status: models.BucketVersioningStatusEnabled,
	})
	if err != nil {
		t.Fatalf("PutVersioning err=%v", err)
	}

	var protectionPatch map[string]any
	if err := json.Unmarshal(protectionBody, &protectionPatch); err != nil {
		t.Fatalf("decode protection patch err=%v", err)
	}
	iamConfiguration, _ := protectionPatch["iamConfiguration"].(map[string]any)
	uniformBucketLevelAccess, _ := iamConfiguration["uniformBucketLevelAccess"].(map[string]any)
	if got := uniformBucketLevelAccess["enabled"]; got != true {
		t.Fatalf("uniform access patch=%v, want true", got)
	}
	retentionPolicy, _ := protectionPatch["retentionPolicy"].(map[string]any)
	if got := retentionPolicy["retentionPeriod"]; got != "259200" {
		t.Fatalf("retentionPeriod=%v, want 259200", got)
	}

	var versioningPatch map[string]any
	if err := json.Unmarshal(versioningBody, &versioningPatch); err != nil {
		t.Fatalf("decode versioning patch err=%v", err)
	}
	versioning, _ := versioningPatch["versioning"].(map[string]any)
	if got := versioning["enabled"]; got != true {
		t.Fatalf("versioning patch=%v, want true", got)
	}
}

func TestAzureAdapterGetAccessAndPublicExposure(t *testing.T) {
	t.Parallel()

	adapter := &azureAdapter{
		getPolicy: func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error) {
			return azureacl.Response{
				Status: 200,
				Body: []byte(`{
					"publicAccess": "blob",
					"storedAccessPolicies": [
						{"id":"reader","start":"2026-01-01T00:00:00Z","expiry":"2026-01-02T00:00:00Z","permission":"rl"}
					]
				}`),
			}, nil
		},
		putPolicy: func(context.Context, models.ProfileSecrets, string, []byte) (azureacl.Response, error) {
			return azureacl.Response{Status: 200}, nil
		},
	}

	access, err := adapter.GetAccess(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetAccess err=%v", err)
	}
	if len(access.StoredAccessPolicies) != 1 || access.StoredAccessPolicies[0].ID != "reader" {
		t.Fatalf("storedAccessPolicies=%+v, want reader policy", access.StoredAccessPolicies)
	}

	publicExposure, err := adapter.GetPublicExposure(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetPublicExposure err=%v", err)
	}
	if publicExposure.Mode != models.BucketPublicExposureModeBlob || publicExposure.Visibility != "blob" {
		t.Fatalf("publicExposure=%+v, want blob visibility", publicExposure)
	}
}

func TestAzureAdapterPutAccessPreservesPublicAccess(t *testing.T) {
	t.Parallel()

	var body []byte
	adapter := &azureAdapter{
		getPolicy: func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error) {
			return azureacl.Response{
				Status: 200,
				Body:   []byte(`{"publicAccess":"container","storedAccessPolicies":[]}`),
			}, nil
		},
		putPolicy: func(_ context.Context, _ models.ProfileSecrets, _ string, next []byte) (azureacl.Response, error) {
			body = append([]byte(nil), next...)
			return azureacl.Response{Status: 200}, nil
		},
	}

	err := adapter.PutAccess(context.Background(), models.ProfileSecrets{}, "demo", models.BucketAccessPutRequest{
		StoredAccessPolicies: []models.BucketStoredAccessPolicy{
			{ID: "reader", Permission: "rl"},
		},
	})
	if err != nil {
		t.Fatalf("PutAccess err=%v", err)
	}

	var policy azureacl.Policy
	if err := json.Unmarshal(body, &policy); err != nil {
		t.Fatalf("decode put body err=%v", err)
	}
	if policy.PublicAccess != "container" {
		t.Fatalf("publicAccess=%q, want container", policy.PublicAccess)
	}
	if len(policy.StoredAccessPolicies) != 1 || policy.StoredAccessPolicies[0].ID != "reader" {
		t.Fatalf("storedAccessPolicies=%+v, want reader policy", policy.StoredAccessPolicies)
	}
}

func TestAzureAdapterPutPublicExposurePreservesPolicies(t *testing.T) {
	t.Parallel()

	var body []byte
	adapter := &azureAdapter{
		getPolicy: func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error) {
			return azureacl.Response{
				Status: 200,
				Body:   []byte(`{"publicAccess":"private","storedAccessPolicies":[{"id":"reader","permission":"rl"}]}`),
			}, nil
		},
		putPolicy: func(_ context.Context, _ models.ProfileSecrets, _ string, next []byte) (azureacl.Response, error) {
			body = append([]byte(nil), next...)
			return azureacl.Response{Status: 200}, nil
		},
	}

	err := adapter.PutPublicExposure(context.Background(), models.ProfileSecrets{}, "demo", models.BucketPublicExposurePutRequest{
		Visibility: "blob",
	})
	if err != nil {
		t.Fatalf("PutPublicExposure err=%v", err)
	}

	var policy azureacl.Policy
	if err := json.Unmarshal(body, &policy); err != nil {
		t.Fatalf("decode put body err=%v", err)
	}
	if policy.PublicAccess != "blob" {
		t.Fatalf("publicAccess=%q, want blob", policy.PublicAccess)
	}
	if len(policy.StoredAccessPolicies) != 1 || policy.StoredAccessPolicies[0].ID != "reader" {
		t.Fatalf("storedAccessPolicies=%+v, want preserved policy", policy.StoredAccessPolicies)
	}
}

func TestAzureAdapterGetProtectionAndVersioning(t *testing.T) {
	t.Parallel()

	adapter := &azureAdapter{
		getServiceProperties: func(context.Context, models.ProfileSecrets) (azureacl.Response, error) {
			return azureacl.Response{
				Status: 200,
				Body:   []byte(`{"isVersioningEnabled":true,"deleteRetentionPolicy":{"enabled":true,"days":14}}`),
			}, nil
		},
		getContainerProperties: func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error) {
			return azureacl.Response{
				Status: 200,
				Body:   []byte(`{"hasImmutabilityPolicy":true,"hasLegalHold":false}`),
			}, nil
		},
	}

	protection, err := adapter.GetProtection(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetProtection err=%v", err)
	}
	if protection.SoftDelete == nil || !protection.SoftDelete.Enabled || protection.SoftDelete.Days == nil || *protection.SoftDelete.Days != 14 {
		t.Fatalf("softDelete=%+v, want enabled 14 days", protection.SoftDelete)
	}
	if protection.Immutability == nil || !protection.Immutability.Enabled {
		t.Fatalf("immutability=%+v, want enabled", protection.Immutability)
	}
	if len(protection.Warnings) == 0 {
		t.Fatalf("warnings=%v, want scope warning", protection.Warnings)
	}

	versioning, err := adapter.GetVersioning(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetVersioning err=%v", err)
	}
	if versioning.Status != models.BucketVersioningStatusEnabled {
		t.Fatalf("status=%q, want enabled", versioning.Status)
	}
	if len(versioning.Warnings) == 0 {
		t.Fatalf("warnings=%v, want account-level warning", versioning.Warnings)
	}
}

func TestAzureAdapterGetProtectionIncludesLegalHoldTags(t *testing.T) {
	t.Parallel()

	profile := models.ProfileSecrets{
		AzureSubscriptionID: "subscription",
		AzureResourceGroup:  "resource-group",
		AzureTenantID:       "tenant",
		AzureClientID:       "client",
		AzureClientSecret:   "secret",
	}
	adapter := &azureAdapter{
		getServiceProperties: func(context.Context, models.ProfileSecrets) (azureacl.Response, error) {
			return azureacl.Response{Status: 200, Body: []byte(`{"deleteRetentionPolicy":{"enabled":false}}`)}, nil
		},
		getContainerProperties: func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error) {
			return azureacl.Response{Status: 200, Body: []byte(`{"hasImmutabilityPolicy":false,"hasLegalHold":true}`)}, nil
		},
		getContainer: func(context.Context, models.ProfileSecrets, string) (azurearmimmutability.Response, error) {
			return azurearmimmutability.Response{
				Status: 200,
				Body:   []byte(`{"properties":{"legalHold":{"hasLegalHold":true,"tags":[{"tag":"Case123"},{"tag":"retention9"}]}}}`),
			}, nil
		},
		getImmutabilityPolicy: func(context.Context, models.ProfileSecrets, string) (azurearmimmutability.Response, error) {
			return azurearmimmutability.Response{Status: 404}, nil
		},
	}

	protection, err := adapter.GetProtection(context.Background(), profile, "demo")
	if err != nil {
		t.Fatalf("GetProtection err=%v", err)
	}
	if protection.Immutability == nil || !protection.Immutability.LegalHold || !protection.Immutability.LegalHoldEditable {
		t.Fatalf("immutability=%+v, want editable legal hold", protection.Immutability)
	}
	if !reflect.DeepEqual(protection.Immutability.LegalHoldTags, []string{"case123", "retention9"}) {
		t.Fatalf("legalHoldTags=%v, want normalized tags", protection.Immutability.LegalHoldTags)
	}
}

func TestAzureAdapterPutProtectionUpdatesLegalHoldTagSet(t *testing.T) {
	t.Parallel()

	profile := models.ProfileSecrets{
		AzureSubscriptionID: "subscription",
		AzureResourceGroup:  "resource-group",
		AzureTenantID:       "tenant",
		AzureClientID:       "client",
		AzureClientSecret:   "secret",
	}
	var cleared []string
	var set []string
	adapter := &azureAdapter{
		getContainer: func(context.Context, models.ProfileSecrets, string) (azurearmimmutability.Response, error) {
			return azurearmimmutability.Response{
				Status: 200,
				Body:   []byte(`{"properties":{"legalHold":{"hasLegalHold":true,"tags":[{"tag":"tag1"},{"tag":"tag2"}]}}}`),
			}, nil
		},
		clearLegalHold: func(_ context.Context, _ models.ProfileSecrets, _ string, req azurearmimmutability.LegalHoldRequest) (azurearmimmutability.Response, error) {
			cleared = append([]string(nil), req.Tags...)
			return azurearmimmutability.Response{Status: 200}, nil
		},
		setLegalHold: func(_ context.Context, _ models.ProfileSecrets, _ string, req azurearmimmutability.LegalHoldRequest) (azurearmimmutability.Response, error) {
			set = append([]string(nil), req.Tags...)
			return azurearmimmutability.Response{Status: 200}, nil
		},
	}

	err := adapter.PutProtection(context.Background(), profile, "demo", models.BucketProtectionPutRequest{
		LegalHoldTags: []string{"TAG2", "tag3"},
	})
	if err != nil {
		t.Fatalf("PutProtection err=%v", err)
	}
	if !reflect.DeepEqual(cleared, []string{"tag1"}) {
		t.Fatalf("cleared=%v, want [tag1]", cleared)
	}
	if !reflect.DeepEqual(set, []string{"tag3"}) {
		t.Fatalf("set=%v, want [tag3]", set)
	}
}

func TestAzureAdapterPutProtectionRestoresLegalHoldWhenSetFails(t *testing.T) {
	t.Parallel()

	profile := models.ProfileSecrets{
		AzureSubscriptionID: "subscription",
		AzureResourceGroup:  "resource-group",
		AzureTenantID:       "tenant",
		AzureClientID:       "client",
		AzureClientSecret:   "secret",
	}
	var setCalls [][]string
	var clearCalls [][]string
	adapter := &azureAdapter{
		getContainer: func(context.Context, models.ProfileSecrets, string) (azurearmimmutability.Response, error) {
			return azurearmimmutability.Response{
				Status: 200,
				Body:   []byte(`{"properties":{"legalHold":{"hasLegalHold":true,"tags":[{"tag":"tag1"},{"tag":"tag2"}]}}}`),
			}, nil
		},
		clearLegalHold: func(_ context.Context, _ models.ProfileSecrets, _ string, req azurearmimmutability.LegalHoldRequest) (azurearmimmutability.Response, error) {
			clearCalls = append(clearCalls, append([]string(nil), req.Tags...))
			return azurearmimmutability.Response{Status: 200}, nil
		},
		setLegalHold: func(_ context.Context, _ models.ProfileSecrets, _ string, req azurearmimmutability.LegalHoldRequest) (azurearmimmutability.Response, error) {
			setCalls = append(setCalls, append([]string(nil), req.Tags...))
			if len(setCalls) == 1 {
				return azurearmimmutability.Response{}, errors.New("set legal hold failed")
			}
			return azurearmimmutability.Response{Status: 200}, nil
		},
	}

	err := adapter.PutProtection(context.Background(), profile, "demo", models.BucketProtectionPutRequest{
		LegalHoldTags: []string{"tag2", "tag3"},
	})
	if err == nil {
		t.Fatal("PutProtection error=nil, want set failure")
	}
	if !reflect.DeepEqual(setCalls, [][]string{{"tag3"}, {"tag1"}}) {
		t.Fatalf("setCalls=%v, want failed update followed by restoration", setCalls)
	}
	if !reflect.DeepEqual(clearCalls, [][]string{{"tag1"}, {"tag3"}}) {
		t.Fatalf("clearCalls=%v, want removed tag clear followed by ambiguous-set cleanup", clearCalls)
	}
}

func TestAzureAdapterPutProtectionRollsBackSoftDeleteWhenLegalHoldFails(t *testing.T) {
	t.Parallel()

	profile := models.ProfileSecrets{
		AzureSubscriptionID: "subscription",
		AzureResourceGroup:  "resource-group",
		AzureTenantID:       "tenant",
		AzureClientID:       "client",
		AzureClientSecret:   "secret",
	}
	var servicePropertyBodies [][]byte
	adapter := &azureAdapter{
		getContainer: func(context.Context, models.ProfileSecrets, string) (azurearmimmutability.Response, error) {
			return azurearmimmutability.Response{
				Status: 200,
				Body:   []byte(`{"properties":{"legalHold":{"tags":[]}}}`),
			}, nil
		},
		setLegalHold: func(context.Context, models.ProfileSecrets, string, azurearmimmutability.LegalHoldRequest) (azurearmimmutability.Response, error) {
			return azurearmimmutability.Response{}, errors.New("set legal hold failed")
		},
		getServiceProperties: func(context.Context, models.ProfileSecrets) (azureacl.Response, error) {
			return azureacl.Response{Status: 200, Body: []byte(`{"isVersioningEnabled":true,"deleteRetentionPolicy":{"enabled":false}}`)}, nil
		},
		putServiceProperties: func(_ context.Context, _ models.ProfileSecrets, body []byte) (azureacl.Response, error) {
			servicePropertyBodies = append(servicePropertyBodies, append([]byte(nil), body...))
			return azureacl.Response{Status: 202}, nil
		},
	}

	days := 7
	err := adapter.PutProtection(context.Background(), profile, "demo", models.BucketProtectionPutRequest{
		SoftDelete:    &models.BucketSoftDeleteView{Enabled: true, Days: &days},
		LegalHoldTags: []string{"tag1"},
	})
	if err == nil {
		t.Fatal("PutProtection error=nil, want legal hold failure")
	}
	if len(servicePropertyBodies) != 2 {
		t.Fatalf("service property PUTs=%d, want initial change plus rollback", len(servicePropertyBodies))
	}

	var restored azureacl.ServiceProperties
	if err := json.Unmarshal(servicePropertyBodies[1], &restored); err != nil {
		t.Fatalf("decode restored service properties: %v", err)
	}
	if !restored.IsVersioningEnabled || restored.DeleteRetentionPolicy == nil || restored.DeleteRetentionPolicy.Enabled {
		t.Fatalf("restored service properties=%+v, want original versioning and disabled retention", restored)
	}
}

func TestAzureAdapterPutProtectionRejectsInvalidLegalHoldTagsBeforeMutation(t *testing.T) {
	t.Parallel()

	profile := models.ProfileSecrets{
		AzureSubscriptionID: "subscription",
		AzureResourceGroup:  "resource-group",
		AzureTenantID:       "tenant",
		AzureClientID:       "client",
		AzureClientSecret:   "secret",
	}
	getCalls := 0
	setCalls := 0
	adapter := &azureAdapter{
		getContainer: func(context.Context, models.ProfileSecrets, string) (azurearmimmutability.Response, error) {
			getCalls++
			return azurearmimmutability.Response{Status: 200, Body: []byte(`{"properties":{"legalHold":{"tags":[]}}}`)}, nil
		},
		setLegalHold: func(context.Context, models.ProfileSecrets, string, azurearmimmutability.LegalHoldRequest) (azurearmimmutability.Response, error) {
			setCalls++
			return azurearmimmutability.Response{Status: 200}, nil
		},
	}

	err := adapter.PutProtection(context.Background(), profile, "demo", models.BucketProtectionPutRequest{
		LegalHoldTags: []string{"bad tag"},
	})
	if err == nil {
		t.Fatal("PutProtection error=nil, want invalid tag error")
	}
	if getCalls != 1 || setCalls != 0 {
		t.Fatalf("getCalls=%d setCalls=%d, want read once and no mutation", getCalls, setCalls)
	}
}

func TestAzureAdapterPutProtectionAndVersioning(t *testing.T) {
	t.Parallel()

	var protectionBody []byte
	var versioningBody []byte
	callCount := 0
	adapter := &azureAdapter{
		getServiceProperties: func(context.Context, models.ProfileSecrets) (azureacl.Response, error) {
			return azureacl.Response{
				Status: 200,
				Body:   []byte(`{"isVersioningEnabled":false,"deleteRetentionPolicy":{"enabled":false}}`),
			}, nil
		},
		putServiceProperties: func(_ context.Context, _ models.ProfileSecrets, body []byte) (azureacl.Response, error) {
			callCount++
			if callCount == 1 {
				protectionBody = append([]byte(nil), body...)
			} else {
				versioningBody = append([]byte(nil), body...)
			}
			return azureacl.Response{Status: 202}, nil
		},
	}

	days := 7
	err := adapter.PutProtection(context.Background(), models.ProfileSecrets{}, "demo", models.BucketProtectionPutRequest{
		SoftDelete: &models.BucketSoftDeleteView{
			Enabled: true,
			Days:    &days,
		},
	})
	if err != nil {
		t.Fatalf("PutProtection err=%v", err)
	}
	err = adapter.PutVersioning(context.Background(), models.ProfileSecrets{}, "demo", models.BucketVersioningPutRequest{
		Status: models.BucketVersioningStatusEnabled,
	})
	if err != nil {
		t.Fatalf("PutVersioning err=%v", err)
	}

	var protectionProps azureacl.ServiceProperties
	if err := json.Unmarshal(protectionBody, &protectionProps); err != nil {
		t.Fatalf("decode protection body err=%v", err)
	}
	if protectionProps.DeleteRetentionPolicy == nil || !protectionProps.DeleteRetentionPolicy.Enabled || protectionProps.DeleteRetentionPolicy.Days == nil || *protectionProps.DeleteRetentionPolicy.Days != 7 {
		t.Fatalf("deleteRetentionPolicy=%+v, want enabled 7 days", protectionProps.DeleteRetentionPolicy)
	}

	var versioningProps azureacl.ServiceProperties
	if err := json.Unmarshal(versioningBody, &versioningProps); err != nil {
		t.Fatalf("decode versioning body err=%v", err)
	}
	if !versioningProps.IsVersioningEnabled {
		t.Fatalf("versioning props=%+v, want enabled", versioningProps)
	}
}

func TestAzureAdapterPutProtectionValidatesARMBeforeSoftDelete(t *testing.T) {
	t.Parallel()

	putCalls := 0
	adapter := &azureAdapter{
		getServiceProperties: func(context.Context, models.ProfileSecrets) (azureacl.Response, error) {
			return azureacl.Response{
				Status: 200,
				Body:   []byte("{\"deleteRetentionPolicy\":{\"enabled\":false}}"),
			}, nil
		},
		putServiceProperties: func(context.Context, models.ProfileSecrets, []byte) (azureacl.Response, error) {
			putCalls++
			return azureacl.Response{Status: 202}, nil
		},
	}

	days := 7
	err := adapter.PutProtection(context.Background(), models.ProfileSecrets{}, "demo", models.BucketProtectionPutRequest{
		SoftDelete: &models.BucketSoftDeleteView{
			Enabled: true,
			Days:    &days,
		},
		Immutability: &models.BucketImmutabilityView{
			Enabled: true,
			Days:    &days,
		},
	})
	if err == nil {
		t.Fatal("PutProtection error=nil, want missing ARM configuration error")
	}
	if putCalls != 0 {
		t.Fatalf("putCalls=%d, want 0 before ARM validation", putCalls)
	}
}

func TestAzureAdapterPutProtectionPreflightsLockedImmutabilityBeforeSoftDelete(t *testing.T) {
	t.Parallel()

	daysToShorten := 7
	daysToKeep := 30
	cases := []struct {
		name         string
		immutability models.BucketImmutabilityView
	}{
		{name: "disable", immutability: models.BucketImmutabilityView{}},
		{
			name: "shorten",
			immutability: models.BucketImmutabilityView{
				Enabled: true,
				Mode:    "locked",
				Days:    &daysToShorten,
			},
		},
		{
			name: "change append setting",
			immutability: models.BucketImmutabilityView{
				Enabled:                    true,
				Mode:                       "locked",
				Days:                       &daysToKeep,
				AllowProtectedAppendWrites: true,
			},
		},
	}

	profile := models.ProfileSecrets{
		AzureSubscriptionID: "subscription",
		AzureResourceGroup:  "resource-group",
		AzureTenantID:       "tenant",
		AzureClientID:       "client",
		AzureClientSecret:   "secret",
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			softDeletePutCalls := 0
			adapter := &azureAdapter{
				getImmutabilityPolicy: func(context.Context, models.ProfileSecrets, string) (azurearmimmutability.Response, error) {
					return azurearmimmutability.Response{
						Status: 200,
						Body:   []byte(`{"etag":"etag-current","properties":{"state":"Locked","immutabilityPeriodSinceCreationInDays":30}}`),
					}, nil
				},
				getServiceProperties: func(context.Context, models.ProfileSecrets) (azureacl.Response, error) {
					return azureacl.Response{Status: 200, Body: []byte(`{"deleteRetentionPolicy":{"enabled":false}}`)}, nil
				},
				putServiceProperties: func(context.Context, models.ProfileSecrets, []byte) (azureacl.Response, error) {
					softDeletePutCalls++
					return azureacl.Response{Status: 202}, nil
				},
			}

			days := 7
			err := adapter.PutProtection(context.Background(), profile, "demo", models.BucketProtectionPutRequest{
				SoftDelete:   &models.BucketSoftDeleteView{Enabled: true, Days: &days},
				Immutability: &tc.immutability,
			})
			if err == nil {
				t.Fatal("PutProtection error=nil, want locked immutability validation error")
			}
			if softDeletePutCalls != 0 {
				t.Fatalf("softDeletePutCalls=%d, want 0 before locked-policy validation", softDeletePutCalls)
			}
		})
	}
}

func TestAzureAdapterPutProtectionRollsBackSoftDeleteWhenImmutabilityFails(t *testing.T) {
	t.Parallel()

	profile := models.ProfileSecrets{
		AzureSubscriptionID: "subscription",
		AzureResourceGroup:  "resource-group",
		AzureTenantID:       "tenant",
		AzureClientID:       "client",
		AzureClientSecret:   "secret",
	}
	var servicePropertyBodies [][]byte
	adapter := &azureAdapter{
		getImmutabilityPolicy: func(context.Context, models.ProfileSecrets, string) (azurearmimmutability.Response, error) {
			return azurearmimmutability.Response{Status: 404}, nil
		},
		putImmutabilityPolicy: func(context.Context, models.ProfileSecrets, string, azurearmimmutability.PutPolicyRequest) (azurearmimmutability.Response, error) {
			return azurearmimmutability.Response{}, errors.New("arm immutability failed")
		},
		getServiceProperties: func(context.Context, models.ProfileSecrets) (azureacl.Response, error) {
			return azureacl.Response{
				Status: 200,
				Body:   []byte(`{"isVersioningEnabled":true,"deleteRetentionPolicy":{"enabled":false}}`),
			}, nil
		},
		putServiceProperties: func(_ context.Context, _ models.ProfileSecrets, body []byte) (azureacl.Response, error) {
			servicePropertyBodies = append(servicePropertyBodies, append([]byte(nil), body...))
			return azureacl.Response{Status: 202}, nil
		},
	}

	days := 7
	err := adapter.PutProtection(context.Background(), profile, "demo", models.BucketProtectionPutRequest{
		SoftDelete: &models.BucketSoftDeleteView{Enabled: true, Days: &days},
		Immutability: &models.BucketImmutabilityView{
			Enabled: true,
			Days:    &days,
		},
	})
	if err == nil {
		t.Fatal("PutProtection error=nil, want ARM immutability failure")
	}
	if len(servicePropertyBodies) != 2 {
		t.Fatalf("service property PUTs=%d, want initial change plus rollback", len(servicePropertyBodies))
	}

	var applied azureacl.ServiceProperties
	if err := json.Unmarshal(servicePropertyBodies[0], &applied); err != nil {
		t.Fatalf("decode applied service properties: %v", err)
	}
	if applied.DeleteRetentionPolicy == nil || !applied.DeleteRetentionPolicy.Enabled {
		t.Fatalf("applied delete retention policy=%+v, want enabled", applied.DeleteRetentionPolicy)
	}

	var restored azureacl.ServiceProperties
	if err := json.Unmarshal(servicePropertyBodies[1], &restored); err != nil {
		t.Fatalf("decode restored service properties: %v", err)
	}
	if restored.IsVersioningEnabled != true || restored.DeleteRetentionPolicy == nil || restored.DeleteRetentionPolicy.Enabled {
		t.Fatalf("restored service properties=%+v, want original versioning and disabled retention", restored)
	}
}

func TestOCIAdapterGetGovernanceIncludesTypedControls(t *testing.T) {
	t.Parallel()

	adapter := &ociAdapter{
		getBucket: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
			return ocicli.Response{Body: []byte(`{"data":{"public-access-type":"ObjectReadWithoutList","versioning":"Enabled"}}`)}, nil
		},
		listRetentionRules: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
			return ocicli.Response{Body: []byte(`{"data":[{"id":"rule-1","time-rule-locked":true,"duration":{"time-amount":30,"time-unit":"DAYS"}}]}`)}, nil
		},
		listPreauthenticatedRequests: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
			return ocicli.Response{Body: []byte(`{"data":[]}`)}, nil
		},
	}
	view, err := adapter.GetGovernance(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetGovernance err=%v", err)
	}
	if view.Provider != models.ProfileProviderOciObjectStorage {
		t.Fatalf("provider=%q, want %q", view.Provider, models.ProfileProviderOciObjectStorage)
	}
	if view.PublicExposure == nil || view.PublicExposure.Visibility != "object_read_without_list" {
		t.Fatalf("publicExposure=%+v, want object_read_without_list", view.PublicExposure)
	}
	if view.Versioning == nil || view.Versioning.Status != models.BucketVersioningStatusEnabled {
		t.Fatalf("versioning=%+v, want enabled", view.Versioning)
	}
	if view.Protection == nil || view.Protection.Retention == nil || view.Protection.Retention.Days == nil || *view.Protection.Retention.Days != 30 {
		t.Fatalf("protection=%+v, want 30 day retention", view.Protection)
	}
	if view.Protection == nil || len(view.Protection.Warnings) == 0 {
		t.Fatalf("protection warnings=%+v, want locked-rule warning", view.Protection)
	}
}

func TestOCIAdapterPutPublicExposureVersioningAndProtection(t *testing.T) {
	t.Parallel()

	var publicExposureType string
	var versioningState string
	var createdDays int
	adapter := &ociAdapter{
		updateBucket: func(_ context.Context, _ models.ProfileSecrets, _ string, publicAccessType string, versioning string) (ocicli.Response, error) {
			if publicAccessType != "" {
				publicExposureType = publicAccessType
			}
			if versioning != "" {
				versioningState = versioning
			}
			return ocicli.Response{Body: []byte(`{"data":{"public-access-type":"NoPublicAccess","versioning":"Disabled"}}`)}, nil
		},
		listRetentionRules: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
			return ocicli.Response{Body: []byte(`{"data":[]}`)}, nil
		},
		createRetentionRule: func(_ context.Context, _ models.ProfileSecrets, _ string, days int, _ string) (ocicli.Response, error) {
			createdDays = days
			return ocicli.Response{Body: []byte(`{"data":{"id":"rule-1","duration":{"time-amount":7,"time-unit":"DAYS"}}}`)}, nil
		},
	}

	err := adapter.PutPublicExposure(context.Background(), models.ProfileSecrets{}, "demo", models.BucketPublicExposurePutRequest{
		Visibility: "object_read",
	})
	if err != nil {
		t.Fatalf("PutPublicExposure err=%v", err)
	}
	err = adapter.PutVersioning(context.Background(), models.ProfileSecrets{}, "demo", models.BucketVersioningPutRequest{
		Status: models.BucketVersioningStatusDisabled,
	})
	if err != nil {
		t.Fatalf("PutVersioning err=%v", err)
	}
	days := 7
	err = adapter.PutProtection(context.Background(), models.ProfileSecrets{}, "demo", models.BucketProtectionPutRequest{
		Retention: &models.BucketRetentionView{
			Enabled: true,
			Days:    &days,
		},
	})
	if err != nil {
		t.Fatalf("PutProtection err=%v", err)
	}

	if publicExposureType != "ObjectRead" {
		t.Fatalf("publicAccessType=%q, want ObjectRead", publicExposureType)
	}
	if versioningState != "Disabled" {
		t.Fatalf("versioning=%q, want Disabled", versioningState)
	}
	if createdDays != 7 {
		t.Fatalf("createdDays=%d, want 7", createdDays)
	}
}

func TestOCIAdapterPutProtectionKeepsExistingRulesWhenCreateFails(t *testing.T) {
	t.Parallel()

	deleteCalls := 0
	adapter := &ociAdapter{
		listRetentionRules: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
			return ocicli.Response{Body: []byte("{\"data\":[{\"id\":\"rule-old\",\"time-rule-locked\":false,\"duration\":{\"time-amount\":30,\"time-unit\":\"DAYS\"}}]}")}, nil
		},
		createRetentionRule: func(context.Context, models.ProfileSecrets, string, int, string) (ocicli.Response, error) {
			return ocicli.Response{}, errors.New("create failed")
		},
		deleteRetentionRule: func(context.Context, models.ProfileSecrets, string, string) (ocicli.Response, error) {
			deleteCalls++
			return ocicli.Response{}, nil
		},
	}

	days := 7
	err := adapter.PutProtection(context.Background(), models.ProfileSecrets{}, "demo", models.BucketProtectionPutRequest{
		Retention: &models.BucketRetentionView{
			Enabled: true,
			Rules: []models.BucketRetentionRuleView{{
				DisplayName: "new",
				Days:        &days,
			}},
		},
	})
	if err == nil {
		t.Fatal("PutProtection error=nil, want create failure")
	}
	if deleteCalls != 0 {
		t.Fatalf("deleteCalls=%d, want 0 when create fails", deleteCalls)
	}
}

func TestOCIAdapterPutProtectionRollsBackCreatedRulesWhenLaterCreateFails(t *testing.T) {
	t.Parallel()

	var deletedIDs []string
	createCalls := 0
	updateCalls := 0
	adapter := &ociAdapter{
		listRetentionRules: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
			return ocicli.Response{Body: []byte(`{"data":[{"id":"rule-existing","display-name":"existing","duration":{"time-amount":30,"time-unit":"DAYS"}}]}`)}, nil
		},
		createRetentionRule: func(context.Context, models.ProfileSecrets, string, int, string) (ocicli.Response, error) {
			createCalls++
			if createCalls == 1 {
				return ocicli.Response{Body: []byte(`{"data":{"id":"rule-new"}}`)}, nil
			}
			return ocicli.Response{}, errors.New("create failed")
		},
		updateRetentionRule: func(context.Context, models.ProfileSecrets, string, string, int, string) (ocicli.Response, error) {
			updateCalls++
			return ocicli.Response{Body: []byte(`{"data":{}}`)}, nil
		},
		deleteRetentionRule: func(_ context.Context, _ models.ProfileSecrets, _ string, id string) (ocicli.Response, error) {
			deletedIDs = append(deletedIDs, id)
			return ocicli.Response{}, nil
		},
	}

	days := 7
	existingDays := 60
	err := adapter.PutProtection(context.Background(), models.ProfileSecrets{}, "demo", models.BucketProtectionPutRequest{
		Retention: &models.BucketRetentionView{
			Enabled: true,
			Rules: []models.BucketRetentionRuleView{
				{ID: "rule-existing", Days: &existingDays},
				{DisplayName: "first", Days: &days},
				{DisplayName: "second", Days: &days},
			},
		},
	})
	if err == nil {
		t.Fatal("PutProtection error=nil, want later create failure")
	}
	if len(deletedIDs) != 1 || deletedIDs[0] != "rule-new" {
		t.Fatalf("deletedIDs=%v, want [rule-new]", deletedIDs)
	}
	if updateCalls != 0 {
		t.Fatalf("updateCalls=%d, want 0 before all new rules are created", updateCalls)
	}
}

func TestOCIAdapterPutProtectionRollsBackCreatedRulesWhenExistingUpdateFails(t *testing.T) {
	t.Parallel()

	var deletedIDs []string
	adapter := &ociAdapter{
		listRetentionRules: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
			return ocicli.Response{Body: []byte(`{"data":[{"id":"rule-existing","duration":{"time-amount":30,"time-unit":"DAYS"}}]}`)}, nil
		},
		createRetentionRule: func(context.Context, models.ProfileSecrets, string, int, string) (ocicli.Response, error) {
			return ocicli.Response{Body: []byte(`{"data":{"id":"rule-new"}}`)}, nil
		},
		updateRetentionRule: func(context.Context, models.ProfileSecrets, string, string, int, string) (ocicli.Response, error) {
			return ocicli.Response{}, errors.New("update failed")
		},
		deleteRetentionRule: func(_ context.Context, _ models.ProfileSecrets, _ string, id string) (ocicli.Response, error) {
			deletedIDs = append(deletedIDs, id)
			return ocicli.Response{}, nil
		},
	}

	existingDays := 60
	newDays := 7
	err := adapter.PutProtection(context.Background(), models.ProfileSecrets{}, "demo", models.BucketProtectionPutRequest{
		Retention: &models.BucketRetentionView{
			Enabled: true,
			Rules: []models.BucketRetentionRuleView{
				{ID: "rule-existing", Days: &existingDays},
				{DisplayName: "new", Days: &newDays},
			},
		},
	})
	if err == nil {
		t.Fatal("PutProtection error=nil, want existing update failure")
	}
	if len(deletedIDs) != 1 || deletedIDs[0] != "rule-new" {
		t.Fatalf("deletedIDs=%v, want [rule-new]", deletedIDs)
	}
}

func TestOCIAdapterPutProtectionValidatesNewRulesBeforeMutation(t *testing.T) {
	t.Parallel()

	updateCalls := 0
	adapter := &ociAdapter{
		listRetentionRules: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
			return ocicli.Response{Body: []byte("{\"data\":[{\"id\":\"rule-existing\",\"time-rule-locked\":false,\"duration\":{\"time-amount\":30,\"time-unit\":\"DAYS\"}}]}")}, nil
		},
		updateRetentionRule: func(context.Context, models.ProfileSecrets, string, string, int, string) (ocicli.Response, error) {
			updateCalls++
			return ocicli.Response{Body: []byte("{\"data\":{}}")}, nil
		},
	}

	existingDays := 60
	invalidDays := 0
	err := adapter.PutProtection(context.Background(), models.ProfileSecrets{}, "demo", models.BucketProtectionPutRequest{
		Retention: &models.BucketRetentionView{
			Enabled: true,
			Rules: []models.BucketRetentionRuleView{
				{ID: "rule-existing", Days: &existingDays},
				{DisplayName: "invalid", Days: &invalidDays},
			},
		},
	})
	if err == nil {
		t.Fatal("PutProtection error=nil, want invalid new rule error")
	}
	if updateCalls != 0 {
		t.Fatalf("updateCalls=%d, want 0 before new-rule validation", updateCalls)
	}
}

func TestOCIAdapterPutSharingKeepsExistingPARsWhenCreateFails(t *testing.T) {
	t.Parallel()

	deleteCalls := 0
	adapter := &ociAdapter{
		listPreauthenticatedRequests: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
			return ocicli.Response{Body: []byte(`{"data":[{"id":"par-old","name":"old"}]}`)}, nil
		},
		createPreauthenticatedRequest: func(context.Context, models.ProfileSecrets, string, string, string, string, string, string) (ocicli.Response, error) {
			return ocicli.Response{}, errors.New("create failed")
		},
		deletePreauthenticatedRequest: func(context.Context, models.ProfileSecrets, string, string) (ocicli.Response, error) {
			deleteCalls++
			return ocicli.Response{}, nil
		},
	}

	_, err := adapter.PutSharing(context.Background(), models.ProfileSecrets{}, "demo", models.BucketSharingPutRequest{
		PreauthenticatedRequests: []models.BucketPreauthenticatedRequestView{{
			Name:        "new",
			AccessType:  "AnyObjectRead",
			TimeExpires: "2030-01-01T00:00:00Z",
		}},
	})
	if err == nil {
		t.Fatal("PutSharing error=nil, want create failure")
	}
	if deleteCalls != 0 {
		t.Fatalf("deleteCalls=%d, want 0 when create fails", deleteCalls)
	}
}

func TestOCIAdapterPutSharingRollsBackCreatedPARsWhenLaterCreateFails(t *testing.T) {
	t.Parallel()

	var deletedIDs []string
	createCalls := 0
	adapter := &ociAdapter{
		listPreauthenticatedRequests: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
			return ocicli.Response{Body: []byte(`{"data":[]}`)}, nil
		},
		createPreauthenticatedRequest: func(context.Context, models.ProfileSecrets, string, string, string, string, string, string) (ocicli.Response, error) {
			createCalls++
			if createCalls == 1 {
				return ocicli.Response{Body: []byte(`{"data":{"id":"par-new"}}`)}, nil
			}
			return ocicli.Response{}, errors.New("create failed")
		},
		deletePreauthenticatedRequest: func(_ context.Context, _ models.ProfileSecrets, _ string, id string) (ocicli.Response, error) {
			deletedIDs = append(deletedIDs, id)
			return ocicli.Response{}, nil
		},
	}

	_, err := adapter.PutSharing(context.Background(), models.ProfileSecrets{}, "demo", models.BucketSharingPutRequest{
		PreauthenticatedRequests: []models.BucketPreauthenticatedRequestView{
			{Name: "first", AccessType: "AnyObjectRead", TimeExpires: "2030-01-01T00:00:00Z"},
			{Name: "second", AccessType: "AnyObjectRead", TimeExpires: "2030-01-01T00:00:00Z"},
		},
	})
	if err == nil {
		t.Fatal("PutSharing error=nil, want later create failure")
	}
	if len(deletedIDs) != 1 || deletedIDs[0] != "par-new" {
		t.Fatalf("deletedIDs=%v, want [par-new]", deletedIDs)
	}
}

func TestOCIAdapterPutSharingRollsBackCreatedPARsWhenExistingDeleteFails(t *testing.T) {
	t.Parallel()

	var deletedIDs []string
	adapter := &ociAdapter{
		listPreauthenticatedRequests: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
			return ocicli.Response{Body: []byte(`{"data":[{"id":"par-old"}]}`)}, nil
		},
		createPreauthenticatedRequest: func(context.Context, models.ProfileSecrets, string, string, string, string, string, string) (ocicli.Response, error) {
			return ocicli.Response{Body: []byte(`{"data":{"id":"par-new"}}`)}, nil
		},
		deletePreauthenticatedRequest: func(_ context.Context, _ models.ProfileSecrets, _ string, id string) (ocicli.Response, error) {
			deletedIDs = append(deletedIDs, id)
			if id == "par-old" {
				return ocicli.Response{}, errors.New("delete failed")
			}
			return ocicli.Response{}, nil
		},
	}

	_, err := adapter.PutSharing(context.Background(), models.ProfileSecrets{}, "demo", models.BucketSharingPutRequest{
		PreauthenticatedRequests: []models.BucketPreauthenticatedRequestView{{
			Name:        "new",
			AccessType:  "AnyObjectRead",
			TimeExpires: "2030-01-01T00:00:00Z",
		}},
	})
	if err == nil {
		t.Fatal("PutSharing error=nil, want existing delete failure")
	}
	if len(deletedIDs) != 2 || deletedIDs[0] != "par-old" || deletedIDs[1] != "par-new" {
		t.Fatalf("deletedIDs=%v, want [par-old par-new]", deletedIDs)
	}
}
