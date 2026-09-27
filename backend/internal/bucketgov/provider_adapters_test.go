package bucketgov

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"slices"
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
		getBucket: func(context.Context, models.ProfileSecrets, string) (gcsbucket.Response, error) {
			return gcsbucket.Response{Status: 200, Body: []byte(`{"iamConfiguration":{"publicAccessPrevention":"inherited"}}`)}, nil
		},
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
							"condition": {"title":"expires-soon","expression":"request.time < timestamp('2030-01-01T00:00:00Z')"}
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

func TestGCSAdapterGetGovernanceReusesProviderReads(t *testing.T) {
	t.Parallel()

	policyCalls := 0
	bucketCalls := 0
	adapter := &gcsAdapter{
		getPolicy: func(context.Context, models.ProfileSecrets, string) (gcsiam.Response, error) {
			policyCalls++
			return gcsiam.Response{
				Status: 200,
				Body:   []byte(`{"etag":"etag-123","bindings":[{"role":"roles/storage.objectViewer","members":["allUsers"]}]}`),
			}, nil
		},
		getBucket: func(context.Context, models.ProfileSecrets, string) (gcsbucket.Response, error) {
			bucketCalls++
			return gcsbucket.Response{
				Status: 200,
				Body:   []byte(`{"versioning":{"enabled":true},"iamConfiguration":{"uniformBucketLevelAccess":{"enabled":true},"publicAccessPrevention":"enforced"},"retentionPolicy":{"retentionPeriod":"86400"}}`),
			}, nil
		},
	}

	view, err := adapter.GetGovernance(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetGovernance err=%v", err)
	}
	if policyCalls != 1 || bucketCalls != 1 {
		t.Fatalf("policyCalls=%d bucketCalls=%d, want one read per resource", policyCalls, bucketCalls)
	}
	if view.Access == nil || view.Access.ETag != "etag-123" || len(view.Access.Bindings) != 1 {
		t.Fatalf("access=%+v, want shared IAM policy", view.Access)
	}
	if view.PublicExposure == nil || view.PublicExposure.Mode != models.BucketPublicExposureModePublic || view.PublicExposure.PublicAccessPrevention == nil || !*view.PublicExposure.PublicAccessPrevention {
		t.Fatalf("publicExposure=%+v, want public mode with prevention enabled", view.PublicExposure)
	}
	if view.Protection == nil || view.Protection.UniformAccess == nil || !*view.Protection.UniformAccess || view.Protection.Retention == nil || view.Protection.Retention.Days == nil || *view.Protection.Retention.Days != 1 {
		t.Fatalf("protection=%+v, want shared metadata controls", view.Protection)
	}
	if view.Versioning == nil || view.Versioning.Status != models.BucketVersioningStatusEnabled {
		t.Fatalf("versioning=%+v, want enabled", view.Versioning)
	}
}

func TestGCSAdapterPutAccessPreservesVersionAndEditedETag(t *testing.T) {
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
		ETag: "etag-edited",
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
	if policy.ETag != "etag-edited" {
		t.Fatalf("etag=%q, want etag-edited", policy.ETag)
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
		getPolicy: func(context.Context, models.ProfileSecrets, string) (gcsiam.Response, error) {
			return gcsiam.Response{Status: 200, Body: []byte(`{"version":1,"etag":"revision","bindings":[]}`)}, nil
		},
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

func TestAzureAdapterGetGovernanceReusesProviderReads(t *testing.T) {
	t.Parallel()

	profile := models.ProfileSecrets{
		AzureSubscriptionID: "subscription",
		AzureResourceGroup:  "resource-group",
		AzureTenantID:       "tenant",
		AzureClientID:       "client",
		AzureClientSecret:   "secret",
	}
	policyCalls := 0
	serviceCalls := 0
	containerPropertiesCalls := 0
	armContainerCalls := 0
	armPolicyCalls := 0
	adapter := &azureAdapter{
		getARMServiceProperties: func(context.Context, models.ProfileSecrets) (azurearmimmutability.Response, error) {
			return azurearmimmutability.Response{Status: 200, Body: []byte(`{"properties":{"isVersioningEnabled":true}}`)}, nil
		},
		getPolicy: func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error) {
			policyCalls++
			return azureacl.Response{
				Status: 200,
				Body:   []byte(`{"publicAccess":"blob","storedAccessPolicies":[{"id":"reader","permission":"rl"}]}`),
			}, nil
		},
		getServiceProperties: func(context.Context, models.ProfileSecrets) (azureacl.Response, error) {
			serviceCalls++
			return azureacl.Response{
				Status: 200,
				Body:   []byte(`{"isVersioningEnabled":true,"deleteRetentionPolicy":{"enabled":true,"days":14}}`),
			}, nil
		},
		getContainerProperties: func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error) {
			containerPropertiesCalls++
			return azureacl.Response{Status: 200, Body: []byte(`{"hasImmutabilityPolicy":true,"hasLegalHold":true}`)}, nil
		},
		getContainer: func(context.Context, models.ProfileSecrets, string) (azurearmimmutability.Response, error) {
			armContainerCalls++
			return azurearmimmutability.Response{
				Status: 200,
				Body:   []byte(`{"properties":{"legalHold":{"hasLegalHold":true,"tags":[{"tag":"Case123"}]}}}`),
			}, nil
		},
		getImmutabilityPolicy: func(context.Context, models.ProfileSecrets, string) (azurearmimmutability.Response, error) {
			armPolicyCalls++
			return azurearmimmutability.Response{}, errors.New("arm unavailable")
		},
	}

	view, err := adapter.GetGovernance(context.Background(), profile, "demo")
	if err != nil {
		t.Fatalf("GetGovernance err=%v", err)
	}
	if policyCalls != 1 || serviceCalls != 1 || containerPropertiesCalls != 1 || armContainerCalls != 1 || armPolicyCalls != 1 {
		t.Fatalf("calls policy=%d service=%d container=%d armContainer=%d armPolicy=%d, want one per resource", policyCalls, serviceCalls, containerPropertiesCalls, armContainerCalls, armPolicyCalls)
	}
	if view.Access == nil || len(view.Access.StoredAccessPolicies) != 1 || view.Access.StoredAccessPolicies[0].ID != "reader" {
		t.Fatalf("access=%+v, want shared container policy", view.Access)
	}
	if view.PublicExposure == nil || view.PublicExposure.Mode != models.BucketPublicExposureModeBlob {
		t.Fatalf("publicExposure=%+v, want blob visibility", view.PublicExposure)
	}
	if view.Protection == nil || view.Protection.SoftDelete == nil || !view.Protection.SoftDelete.Enabled || view.Protection.Immutability == nil || !reflect.DeepEqual(view.Protection.Immutability.LegalHoldTags, []string{"case123"}) {
		t.Fatalf("protection=%+v, want service and ARM controls", view.Protection)
	}
	if !view.Protection.Immutability.Enabled || view.Protection.Immutability.Editable {
		t.Fatalf("immutability=%+v, want detected protection retained with editing disabled", view.Protection.Immutability)
	}
	if !slices.Contains(view.Protection.Warnings, "Azure immutability policy lookup through ARM failed. Immutability editing is disabled until its current policy can be read safely.") {
		t.Fatalf("warnings=%v, want optional ARM failure warning", view.Protection.Warnings)
	}
	if view.Versioning == nil || view.Versioning.Status != models.BucketVersioningStatusEnabled {
		t.Fatalf("versioning=%+v, want enabled", view.Versioning)
	}
}

func TestAzureAdapterPutAccessPreservesPublicAccess(t *testing.T) {
	t.Parallel()

	var body []byte
	adapter := &azureAdapter{
		getPolicy: func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error) {
			if body != nil {
				return azureacl.Response{Status: 200, Body: body}, nil
			}
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
			if body != nil {
				return azureacl.Response{Status: 200, Body: body}, nil
			}
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
		getARMServiceProperties: func(context.Context, models.ProfileSecrets) (azurearmimmutability.Response, error) {
			return azurearmimmutability.Response{Status: 200, Body: []byte(`{"properties":{"isVersioningEnabled":true}}`)}, nil
		},
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

	versioning, err := adapter.GetVersioning(context.Background(), models.ProfileSecrets{AzureSubscriptionID: "sub", AzureResourceGroup: "rg", AzureTenantID: "tenant", AzureClientID: "client", AzureClientSecret: "test-secret"}, "demo")
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
	if restored.DeleteRetentionPolicy == nil || restored.DeleteRetentionPolicy.Enabled {
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
	var versioningEnabled bool

	adapter := &azureAdapter{
		getServiceProperties: func(context.Context, models.ProfileSecrets) (azureacl.Response, error) {
			return azureacl.Response{
				Status: 200,
				Body:   []byte(`{"isVersioningEnabled":false,"deleteRetentionPolicy":{"enabled":false}}`),
			}, nil
		},

		putServiceProperties: func(_ context.Context, _ models.ProfileSecrets, body []byte) (azureacl.Response, error) {
			protectionBody = append([]byte(nil), body...)
			return azureacl.Response{Status: 202}, nil
		},
		putARMVersioning: func(_ context.Context, _ models.ProfileSecrets, enabled bool) (azurearmimmutability.Response, error) {
			versioningEnabled = enabled
			return azurearmimmutability.Response{Status: 200, Body: []byte(`{"properties":{"isVersioningEnabled":true}}`)}, nil
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
	err = adapter.PutVersioning(context.Background(), models.ProfileSecrets{AzureSubscriptionID: "sub", AzureResourceGroup: "rg", AzureTenantID: "tenant", AzureClientID: "client", AzureClientSecret: "test-secret"}, "demo", models.BucketVersioningPutRequest{
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

	if !versioningEnabled {
		t.Fatal("ARM versioning was not enabled")
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
	if restored.DeleteRetentionPolicy == nil || restored.DeleteRetentionPolicy.Enabled {
		t.Fatalf("restored service properties=%+v, want original versioning and disabled retention", restored)
	}
}

func TestOCIAdapterGetGovernanceIncludesTypedControls(t *testing.T) {
	t.Parallel()

	bucketCalls := 0
	retentionCalls := 0
	sharingCalls := 0
	adapter := &ociAdapter{
		getBucket: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
			bucketCalls++
			return ocicli.Response{Body: []byte(`{"data":{"public-access-type":"ObjectReadWithoutList","versioning":"Enabled"}}`)}, nil
		},
		listRetentionRules: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
			retentionCalls++
			return ocicli.Response{Body: []byte(`{"data":[{"id":"rule-1","time-rule-locked":true,"duration":{"time-amount":30,"time-unit":"DAYS"}}]}`)}, nil
		},
		listPreauthenticatedRequests: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
			sharingCalls++
			return ocicli.Response{Body: []byte(`{"data":[]}`)}, nil
		},
	}
	view, err := adapter.GetGovernance(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetGovernance err=%v", err)
	}
	if bucketCalls != 1 || retentionCalls != 1 || sharingCalls != 1 {
		t.Fatalf("bucketCalls=%d retentionCalls=%d sharingCalls=%d, want one read per resource", bucketCalls, retentionCalls, sharingCalls)
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
		getBucket: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
			return ocicli.Response{Body: []byte(`{"data":{"public-access-type":"ObjectRead"}}`)}, nil
		},
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
		Status: models.BucketVersioningStatusSuspended,
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
	if versioningState != "Suspended" {
		t.Fatalf("versioning=%q, want Suspended", versioningState)
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

func TestGCSAccessPreservesEditedETagAndReportsConflict(t *testing.T) {
	for _, status := range []int{http.StatusConflict, http.StatusPreconditionFailed} {
		calls := 0
		adapter := &gcsAdapter{
			getPolicy: func(context.Context, models.ProfileSecrets, string) (gcsiam.Response, error) {
				return gcsiam.Response{Status: http.StatusOK, Body: []byte(`{"version":3,"etag":"newer-revision","bindings":[]}`)}, nil
			},
			putPolicy: func(_ context.Context, _ models.ProfileSecrets, _ string, body []byte) (gcsiam.Response, error) {
				calls++
				var sent gcsIAMPolicy
				if err := json.Unmarshal(body, &sent); err != nil {
					t.Fatal(err)
				}
				if sent.ETag != "edited-revision" {
					t.Fatalf("edited etag replaced: %q", sent.ETag)
				}
				return gcsiam.Response{Status: status}, nil
			},
		}
		err := adapter.PutAccess(t.Context(), models.ProfileSecrets{}, "demo", models.BucketAccessPutRequest{ETag: "edited-revision"})
		opErr, ok := err.(*OperationError)
		if !ok || opErr.Status != http.StatusConflict || opErr.Code != "bucket_policy_conflict" || calls != 1 {
			t.Fatalf("error=%v calls=%d", err, calls)
		}
	}
}

func TestGCSPublicReadPreservesConditionalBindings(t *testing.T) {
	for _, member := range []string{"user:reader@example.test", "allUsers"} {
		original := gcsIAMBinding{Role: "roles/storage.objectViewer", Members: []string{member}, Condition: json.RawMessage(`{"title":"restricted","expression":"false"}`)}
		bindings := []gcsIAMBinding{original}
		next := gcsEnsurePublicRead(bindings)
		if len(next) != 2 {
			t.Fatalf("member=%s: expected separate unconditional binding, got %+v", member, next)
		}
		if string(next[0].Condition) != string(original.Condition) || len(next[0].Members) != 1 || next[0].Members[0] != member {
			t.Fatalf("conditional binding changed: %+v", next[0])
		}
		if len(next[1].Condition) != 0 || len(next[1].Members) != 1 || next[1].Members[0] != "allUsers" {
			t.Fatalf("missing unconditional public read: %+v", next[1])
		}
		again := gcsEnsurePublicRead(next)
		if len(again) != 2 || len(again[1].Members) != 1 {
			t.Fatalf("repeated toggle duplicated public grant: %+v", again)
		}
	}
}

func TestGCSNullPolicyBlocksReadAndMutation(t *testing.T) {
	writes := 0
	adapter := &gcsAdapter{
		getPolicy: func(context.Context, models.ProfileSecrets, string) (gcsiam.Response, error) {
			return gcsiam.Response{Status: 200, Body: []byte("null")}, nil
		},
		putPolicy: func(context.Context, models.ProfileSecrets, string, []byte) (gcsiam.Response, error) {
			writes++
			return gcsiam.Response{Status: 200}, nil
		},
	}
	if _, err := adapter.GetAccess(context.Background(), models.ProfileSecrets{}, "demo"); err == nil {
		t.Fatal("null policy reported as empty access")
	}
	if err := adapter.PutPublicExposure(context.Background(), models.ProfileSecrets{}, "demo", models.BucketPublicExposurePutRequest{Mode: models.BucketPublicExposureModePublic}); err == nil {
		t.Fatal("null policy allowed public exposure mutation")
	}
	if err := adapter.PutAccess(context.Background(), models.ProfileSecrets{}, "demo", models.BucketAccessPutRequest{ETag: "loaded-revision"}); err == nil {
		t.Fatal("null policy allowed access mutation")
	}
	if writes != 0 {
		t.Fatalf("provider writes=%d, want 0", writes)
	}
}

func TestGCSMissingPolicyClientDoesNotReportEmptyPolicy(t *testing.T) {
	writes := 0
	adapter := &gcsAdapter{putPolicy: func(context.Context, models.ProfileSecrets, string, []byte) (gcsiam.Response, error) {
		writes++
		return gcsiam.Response{Status: 200}, nil
	}}
	if _, err := adapter.GetAccess(context.Background(), models.ProfileSecrets{}, "demo"); err == nil {
		t.Fatal("missing client reported empty policy")
	}
	if err := adapter.PutAccess(context.Background(), models.ProfileSecrets{}, "demo", models.BucketAccessPutRequest{ETag: "loaded-revision"}); err == nil {
		t.Fatal("missing read client allowed mutation")
	}
	if writes != 0 {
		t.Fatalf("writes=%d, want 0", writes)
	}
}

func TestGCSUnknownMetadataDoesNotReportDisabledProtection(t *testing.T) {
	for _, adapter := range []*gcsAdapter{
		{},
		{getBucket: func(context.Context, models.ProfileSecrets, string) (gcsbucket.Response, error) {
			return gcsbucket.Response{Status: 200, Body: []byte("null")}, nil
		}},
	} {
		if _, err := adapter.GetProtection(context.Background(), models.ProfileSecrets{}, "demo"); err == nil {
			t.Error("unknown metadata reported valid protection")
		}
		if _, err := adapter.GetVersioning(context.Background(), models.ProfileSecrets{}, "demo"); err == nil {
			t.Error("unknown metadata reported valid versioning")
		}
	}
}

func TestAzureUnknownPolicyBlocksReadAndMutation(t *testing.T) {
	for _, adapter := range []*azureAdapter{
		{},
		{getPolicy: func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error) {
			return azureacl.Response{Status: 200, Body: []byte("null")}, nil
		}},
	} {
		writes := 0
		adapter.putPolicy = func(context.Context, models.ProfileSecrets, string, []byte) (azureacl.Response, error) {
			writes++
			return azureacl.Response{Status: 200}, nil
		}
		if _, err := adapter.GetAccess(context.Background(), models.ProfileSecrets{}, "demo"); err == nil {
			t.Error("unknown policy returned empty access")
		}
		if _, err := adapter.GetPublicExposure(context.Background(), models.ProfileSecrets{}, "demo"); err == nil {
			t.Error("unknown policy returned private exposure")
		}
		if err := adapter.PutAccess(context.Background(), models.ProfileSecrets{}, "demo", models.BucketAccessPutRequest{}); err == nil {
			t.Error("unknown policy allowed access write")
		}
		if writes != 0 {
			t.Errorf("writes=%d, want 0", writes)
		}
	}
}

func TestAzureImmutabilityRejectsNullPolicy(t *testing.T) {
	adapter := &azureAdapter{
		getImmutabilityPolicy: func(context.Context, models.ProfileSecrets, string) (azurearmimmutability.Response, error) {
			return azurearmimmutability.Response{Status: 200, Body: []byte("null")}, nil
		},
		putImmutabilityPolicy: func(context.Context, models.ProfileSecrets, string, azurearmimmutability.PutPolicyRequest) (azurearmimmutability.Response, error) {
			return azurearmimmutability.Response{Status: 200, Body: []byte("null")}, nil
		},
	}
	if policy, err := adapter.getAzureImmutabilityPolicy(context.Background(), models.ProfileSecrets{}, "demo", "read", "test_error"); err == nil || policy != nil {
		t.Fatalf("read policy=%+v err=%v", policy, err)
	}
	if policy, err := adapter.putAzureImmutability(context.Background(), models.ProfileSecrets{}, "demo", azurearmimmutability.PutPolicyRequest{}, "write", "test_error"); err == nil || policy != nil {
		t.Fatalf("write policy=%+v err=%v", policy, err)
	}
}

func TestAzureMissingImmutabilityReaderBlocksCreation(t *testing.T) {
	writes := 0
	adapter := &azureAdapter{putImmutabilityPolicy: func(context.Context, models.ProfileSecrets, string, azurearmimmutability.PutPolicyRequest) (azurearmimmutability.Response, error) {
		writes++
		return azurearmimmutability.Response{Status: 200, Body: []byte(`{}`)}, nil
	}}
	profile := models.ProfileSecrets{AzureSubscriptionID: "subscription", AzureResourceGroup: "group", AzureTenantID: "tenant", AzureClientID: "client", AzureClientSecret: "test-secret"}
	days := 7
	err := adapter.PutProtection(context.Background(), profile, "demo", models.BucketProtectionPutRequest{Immutability: &models.BucketImmutabilityView{Enabled: true, Days: &days, Mode: "unlocked"}})
	if err == nil {
		t.Fatal("missing reader treated as absent policy")
	}
	if writes != 0 {
		t.Fatalf("writes=%d, want 0", writes)
	}
}

func TestAzureNullServicePropertiesBlocksMutation(t *testing.T) {
	writes := 0
	adapter := &azureAdapter{
		getServiceProperties: func(context.Context, models.ProfileSecrets) (azureacl.Response, error) {
			return azureacl.Response{Status: 200, Body: []byte("null")}, nil
		},
		putServiceProperties: func(context.Context, models.ProfileSecrets, []byte) (azureacl.Response, error) {
			writes++
			return azureacl.Response{Status: 200}, nil
		},
	}
	if _, err := adapter.GetVersioning(context.Background(), models.ProfileSecrets{}, "demo"); err == nil {
		t.Error("null properties reported as valid versioning")
	}
	if err := adapter.PutProtection(context.Background(), models.ProfileSecrets{}, "demo", models.BucketProtectionPutRequest{SoftDelete: &models.BucketSoftDeleteView{Enabled: false}}); err == nil {
		t.Error("null properties allowed soft delete mutation")
	}
	if writes != 0 {
		t.Fatalf("writes=%d, want 0", writes)
	}
}

func TestAzureUnknownContainerPropertiesFailsProtectionRead(t *testing.T) {
	for _, adapter := range []*azureAdapter{
		{},
		{getContainerProperties: func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error) {
			return azureacl.Response{Status: 200, Body: []byte("null")}, nil
		}},
	} {
		adapter.getServiceProperties = func(context.Context, models.ProfileSecrets) (azureacl.Response, error) {
			return azureacl.Response{Status: 200, Body: []byte(`{"isVersioningEnabled":true}`)}, nil
		}
		if _, err := adapter.GetProtection(context.Background(), models.ProfileSecrets{}, "demo"); err == nil {
			t.Fatal("unknown container protection reported as valid")
		}
	}
}

func TestAzureUnknownLegalHoldDoesNotBecomeEmptyTags(t *testing.T) {
	for _, adapter := range []*azureAdapter{
		{},
		{getContainer: func(context.Context, models.ProfileSecrets, string) (azurearmimmutability.Response, error) {
			return azurearmimmutability.Response{Status: 200, Body: []byte("null")}, nil
		}},
	} {
		hold, err := adapter.getAzureLegalHold(context.Background(), models.ProfileSecrets{}, "demo", "read", "test_error")
		if err == nil || hold != nil {
			t.Fatalf("hold=%+v err=%v, want unavailable", hold, err)
		}
	}
}

func TestAzureARMVersioningResponseContract(t *testing.T) {
	profile := models.ProfileSecrets{AzureSubscriptionID: "sub", AzureResourceGroup: "rg", AzureTenantID: "tenant", AzureClientID: "client", AzureClientSecret: "test-secret"}
	for _, tc := range []struct {
		body    string
		invalid bool
		enabled bool
	}{
		{`{"properties":{"isVersioningEnabled":true}}`, false, true},
		{`{"properties":{"isVersioningEnabled":false}}`, false, false},
		{`null`, true, false}, {`{}`, true, false}, {`{"properties":{}}`, true, false},
		{`{"properties":{"isVersioningEnabled":null}}`, true, false},
		{`{"properties":{"isVersioningEnabled":"false"}}`, true, false},
	} {
		adapter := &azureAdapter{getARMServiceProperties: func(context.Context, models.ProfileSecrets) (azurearmimmutability.Response, error) {
			return azurearmimmutability.Response{Status: 200, Body: []byte(tc.body)}, nil
		}}
		view, err := adapter.GetVersioning(context.Background(), profile, "demo")
		if (err != nil) != tc.invalid {
			t.Fatalf("body=%s err=%v", tc.body, err)
		}
		if !tc.invalid && (view.Status == models.BucketVersioningStatusEnabled) != tc.enabled {
			t.Fatalf("body=%s status=%s", tc.body, view.Status)
		}
	}
	for _, status := range []int{200, 401, 403, 409, 500} {
		calls := 0
		adapter := &azureAdapter{putARMVersioning: func(_ context.Context, _ models.ProfileSecrets, enabled bool) (azurearmimmutability.Response, error) {
			calls++
			if enabled {
				t.Error("disable request became enable")
			}
			return azurearmimmutability.Response{Status: status, Body: []byte(`{"properties":{"isVersioningEnabled":false}}`)}, nil
		}}
		err := adapter.PutVersioning(context.Background(), profile, "demo", models.BucketVersioningPutRequest{Status: models.BucketVersioningStatusDisabled})
		if (err == nil) != (status == 200) || calls != 1 {
			t.Fatalf("status=%d calls=%d err=%v", status, calls, err)
		}
	}
}

func TestAzureVersioningWriteRequiresMatchingResponse(t *testing.T) {
	profile := models.ProfileSecrets{AzureSubscriptionID: "sub", AzureResourceGroup: "rg", AzureTenantID: "tenant", AzureClientID: "client", AzureClientSecret: "test-secret"}
	for _, body := range []string{"", "null", "{}", `{"properties":{"isVersioningEnabled":null}}`, `{"properties":{"isVersioningEnabled":"true"}}`, `{"properties":{"isVersioningEnabled":false}}`} {
		calls := 0
		adapter := &azureAdapter{putARMVersioning: func(context.Context, models.ProfileSecrets, bool) (azurearmimmutability.Response, error) {
			calls++
			return azurearmimmutability.Response{Status: 200, Body: []byte(body)}, nil
		}}
		err := adapter.PutVersioning(context.Background(), profile, "demo", models.BucketVersioningPutRequest{Status: models.BucketVersioningStatusEnabled})
		if err == nil || calls != 1 {
			t.Fatalf("body=%q calls=%d err=%v", body, calls, err)
		}
	}
}

func TestGCSAccessMissingETagStopsBeforeProviderCalls(t *testing.T) {
	adapter := &gcsAdapter{
		getPolicy: func(context.Context, models.ProfileSecrets, string) (gcsiam.Response, error) {
			t.Fatal("unexpected policy read")
			return gcsiam.Response{}, nil
		},
		putPolicy: func(context.Context, models.ProfileSecrets, string, []byte) (gcsiam.Response, error) {
			t.Fatal("unexpected policy write")
			return gcsiam.Response{}, nil
		},
	}
	for _, etag := range []string{"", "  "} {
		if err := adapter.PutAccess(context.Background(), models.ProfileSecrets{}, "demo", models.BucketAccessPutRequest{ETag: etag}); err == nil {
			t.Fatal("missing ETag accepted")
		}
	}
}

func TestGCSPublicExposureRequiresPolicyRevision(t *testing.T) {
	for _, etag := range []string{"", "revision"} {
		writes := 0
		adapter := &gcsAdapter{
			getPolicy: func(context.Context, models.ProfileSecrets, string) (gcsiam.Response, error) {
				body, _ := json.Marshal(gcsIAMPolicy{Version: 1, ETag: etag})
				return gcsiam.Response{Status: 200, Body: body}, nil
			},
			putPolicy: func(_ context.Context, _ models.ProfileSecrets, _ string, body []byte) (gcsiam.Response, error) {
				writes++
				var policy gcsIAMPolicy
				if err := json.Unmarshal(body, &policy); err != nil {
					t.Fatal(err)
				}
				if policy.ETag != "revision" {
					t.Fatalf("etag=%q", policy.ETag)
				}
				return gcsiam.Response{Status: 412}, nil
			},
		}
		err := adapter.PutPublicExposure(context.Background(), models.ProfileSecrets{}, "demo", models.BucketPublicExposurePutRequest{Mode: models.BucketPublicExposureModePublic})
		if err == nil {
			t.Fatal("unconfirmed update succeeded")
		}
		if etag == "" && writes != 0 {
			t.Fatal("missing ETag reached provider")
		}
		if etag != "" {
			opErr, ok := err.(*OperationError)
			if !ok || opErr.Code != "bucket_policy_conflict" || writes != 1 {
				t.Fatalf("writes=%d err=%v", writes, err)
			}
		}
	}
}

func TestGCSPublicExposureReportsAcceptedIAMWhenMetadataFails(t *testing.T) {
	for _, mode := range []models.BucketPublicExposureMode{"", models.BucketPublicExposureModePrivate} {
		writes, patches := 0, 0
		adapter := &gcsAdapter{
			getPolicy: func(context.Context, models.ProfileSecrets, string) (gcsiam.Response, error) {
				return gcsiam.Response{Status: 200, Body: []byte(`{"etag":"revision","bindings":[]}`)}, nil
			},
			putPolicy: func(context.Context, models.ProfileSecrets, string, []byte) (gcsiam.Response, error) {
				writes++
				return gcsiam.Response{Status: 200}, nil
			},
			patchBucket: func(context.Context, models.ProfileSecrets, string, []byte) (gcsbucket.Response, error) {
				patches++
				return gcsbucket.Response{Status: 503}, nil
			},
		}
		prevention := true
		err := adapter.PutPublicExposure(context.Background(), models.ProfileSecrets{}, "demo", models.BucketPublicExposurePutRequest{Mode: mode, PublicAccessPrevention: &prevention})
		opErr, ok := err.(*OperationError)
		if !ok || patches != 1 {
			t.Fatalf("patches=%d err=%v", patches, err)
		}
		if mode != "" {
			if writes != 1 || opErr.Code != "bucket_public_exposure_partial" || opErr.Details["iamPolicyUpdateAccepted"] != true || opErr.Details["publicAccessPreventionState"] != "unknown" {
				t.Fatalf("writes=%d err=%+v", writes, opErr)
			}
		} else if writes != 0 || opErr.Code == "bucket_public_exposure_partial" {
			t.Fatalf("writes=%d err=%+v", writes, opErr)
		}
	}
}

func TestGCSAccessClearSendsExplicitEmptyBindings(t *testing.T) {
	writes := 0
	adapter := &gcsAdapter{
		getPolicy: func(context.Context, models.ProfileSecrets, string) (gcsiam.Response, error) {
			return gcsiam.Response{Status: 200, Body: []byte(`{"version":3,"etag":"revision","bindings":[{"role":"roles/storage.objectViewer","members":["allUsers"]}]}`)}, nil
		},
		putPolicy: func(_ context.Context, _ models.ProfileSecrets, _ string, body []byte) (gcsiam.Response, error) {
			writes++
			var policy map[string]json.RawMessage
			if err := json.Unmarshal(body, &policy); err != nil {
				t.Fatal(err)
			}
			if string(policy["bindings"]) != "[]" {
				t.Fatalf("bindings=%s; want explicit []", policy["bindings"])
			}
			return gcsiam.Response{Status: 200}, nil
		},
	}
	if err := adapter.PutAccess(context.Background(), models.ProfileSecrets{}, "demo", models.BucketAccessPutRequest{ETag: "revision"}); err != nil {
		t.Fatal(err)
	}
	if err := adapter.PutPublicExposure(context.Background(), models.ProfileSecrets{}, "demo", models.BucketPublicExposurePutRequest{Mode: models.BucketPublicExposureModePrivate}); err != nil {
		t.Fatal(err)
	}
	if writes != 2 {
		t.Fatalf("writes=%d", writes)
	}
}

func TestGCSUnknownPolicyVersionBlocksEdits(t *testing.T) {
	for _, version := range []int{-1, 2, 4} {
		adapter := &gcsAdapter{
			getPolicy: func(context.Context, models.ProfileSecrets, string) (gcsiam.Response, error) {
				body, _ := json.Marshal(gcsIAMPolicy{Version: version, ETag: "revision"})
				return gcsiam.Response{Status: 200, Body: body}, nil
			},
			putPolicy: func(context.Context, models.ProfileSecrets, string, []byte) (gcsiam.Response, error) {
				t.Fatal("unsupported policy version reached write")
				return gcsiam.Response{}, nil
			},
		}
		if _, err := adapter.GetAccess(context.Background(), models.ProfileSecrets{}, "demo"); err == nil {
			t.Fatalf("version %d accepted on read", version)
		}
		if err := adapter.PutAccess(context.Background(), models.ProfileSecrets{}, "demo", models.BucketAccessPutRequest{ETag: "revision"}); err == nil {
			t.Fatalf("version %d accepted on access write", version)
		}
		if err := adapter.PutPublicExposure(context.Background(), models.ProfileSecrets{}, "demo", models.BucketPublicExposurePutRequest{Mode: models.BucketPublicExposureModePrivate}); err == nil {
			t.Fatalf("version %d accepted on exposure write", version)
		}
	}
}

func TestGCSMalformedReadBindingBlocksPublicExposureWrite(t *testing.T) {
	for _, binding := range []string{
		`{"role":"","members":["user:reader@example.test"]}`,
		`{"role":"roles/storage.objectViewer","members":[]}`,
		`{"role":"roles/storage.objectViewer","members":[" "]}`,
		`{"role":"roles/storage.objectViewer","members":["allUsers"],"condition":{}}`,
	} {
		adapter := &gcsAdapter{
			getPolicy: func(context.Context, models.ProfileSecrets, string) (gcsiam.Response, error) {
				return gcsiam.Response{Status: 200, Body: []byte(`{"version":3,"etag":"revision","bindings":[` + binding + `]}`)}, nil
			},
			putPolicy: func(context.Context, models.ProfileSecrets, string, []byte) (gcsiam.Response, error) {
				t.Fatal("malformed read allowed policy replacement")
				return gcsiam.Response{}, nil
			},
		}
		if err := adapter.PutPublicExposure(context.Background(), models.ProfileSecrets{}, "demo", models.BucketPublicExposurePutRequest{Mode: models.BucketPublicExposureModePrivate}); err == nil {
			t.Fatalf("binding accepted: %s", binding)
		}
	}
}

func TestOCIVersioningStates(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		raw  string
		want models.BucketVersioningStatus
	}{
		{"Enabled", models.BucketVersioningStatusEnabled},
		{"Suspended", models.BucketVersioningStatusSuspended},
		{"Disabled", models.BucketVersioningStatusDisabled},
		{"", ""}, {"Unknown", ""},
	} {
		t.Run(tc.raw, func(t *testing.T) {
			adapter := &ociAdapter{getBucket: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
				body, _ := json.Marshal(map[string]any{"data": map[string]string{"versioning": tc.raw}})
				return ocicli.Response{Body: body}, nil
			}}
			view, err := adapter.GetVersioning(context.Background(), models.ProfileSecrets{}, "demo")
			if (err != nil) != (tc.want == "") || view.Status != tc.want {
				t.Fatalf("view=%+v err=%v", view, err)
			}
		})
	}
	ctx := ValidationContext{Provider: models.ProfileProviderOciObjectStorage, Capabilities: ProviderGovernanceCapabilities(models.ProfileProviderOciObjectStorage)}
	for _, status := range []models.BucketVersioningStatus{models.BucketVersioningStatusEnabled, models.BucketVersioningStatusSuspended, models.BucketVersioningStatusDisabled} {
		err := ValidateVersioningPut(ctx, models.BucketVersioningPutRequest{Status: status})
		if (err != nil) != (status == models.BucketVersioningStatusDisabled) {
			t.Fatalf("status=%s err=%v", status, err)
		}
	}
	adapter := &ociAdapter{}
	if err := adapter.PutVersioning(context.Background(), models.ProfileSecrets{}, "demo", models.BucketVersioningPutRequest{Status: models.BucketVersioningStatusDisabled}); err == nil {
		t.Fatal("disabled write accepted")
	}
}

func TestOCIVisibilityRequiresReadback(t *testing.T) {
	for _, state := range []string{"ObjectRead", "NoPublicAccess", ""} {
		t.Run(state, func(t *testing.T) {
			writes, reads := 0, 0
			adapter := &ociAdapter{
				updateBucket: func(context.Context, models.ProfileSecrets, string, string, string) (ocicli.Response, error) {
					writes++
					return ocicli.Response{Body: []byte(`{"data":{"public-access-type":"ObjectRead"}}`)}, nil
				},
				getBucket: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
					reads++
					body, _ := json.Marshal(map[string]any{"data": map[string]string{"public-access-type": state}})
					return ocicli.Response{Body: body}, nil
				},
			}
			err := adapter.PutPublicExposure(context.Background(), models.ProfileSecrets{}, "demo", models.BucketPublicExposurePutRequest{Visibility: "object_read"})
			if (err == nil) != (state == "ObjectRead") || writes != 1 || reads != 1 {
				t.Fatalf("state=%s err=%v writes=%d reads=%d", state, err, writes, reads)
			}
		})
	}
}

func TestOCIVisibilityUnknownIsNotPrivate(t *testing.T) {
	for _, tc := range []struct{ raw, want string }{
		{"NoPublicAccess", "private"}, {"ObjectRead", "object_read"}, {"ObjectReadWithoutList", "object_read_without_list"}, {"", ""}, {"FutureVisibility", ""},
	} {
		t.Run(tc.raw, func(t *testing.T) {
			adapter := &ociAdapter{getBucket: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
				body, _ := json.Marshal(map[string]any{"data": map[string]string{"public-access-type": tc.raw}})
				return ocicli.Response{Body: body}, nil
			}}
			view, err := adapter.GetPublicExposure(context.Background(), models.ProfileSecrets{}, "demo")
			if (err != nil) != (tc.want == "") || view.Visibility != tc.want {
				t.Fatalf("view=%+v err=%v", view, err)
			}
		})
	}
}

func TestAzureVisibilityRequiresReadback(t *testing.T) {
	for _, tc := range []struct {
		name string
		body string
		fail bool
	}{
		{"unchanged", `{"publicAccess":"private","storedAccessPolicies":[]}`, false},
		{"read failure", ``, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			reads, writes := 0, 0
			adapter := &azureAdapter{
				getPolicy: func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error) {
					reads++
					if reads > 1 && tc.fail {
						return azureacl.Response{}, errors.New("read failed")
					}
					return azureacl.Response{Status: 200, Body: []byte(tc.body)}, nil
				},
				putPolicy: func(context.Context, models.ProfileSecrets, string, []byte) (azureacl.Response, error) {
					writes++
					return azureacl.Response{Status: 200}, nil
				},
			}
			if tc.fail {
				adapter.getPolicy = func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error) {
					reads++
					if reads > 1 {
						return azureacl.Response{}, errors.New("read failed")
					}
					return azureacl.Response{Status: 200, Body: []byte(`{"publicAccess":"private","storedAccessPolicies":[]}`)}, nil
				}
			}
			err := adapter.PutPublicExposure(context.Background(), models.ProfileSecrets{}, "demo", models.BucketPublicExposurePutRequest{Visibility: "blob"})
			var opErr *OperationError
			if !errors.As(err, &opErr) || opErr.Code != "bucket_public_exposure_unconfirmed" || reads != 2 || writes != 1 {
				t.Fatalf("err=%v reads=%d writes=%d", err, reads, writes)
			}
		})
	}
}

func TestAzureContainerPolicyRejectsUnknownVisibility(t *testing.T) {
	for _, visibility := range []string{"private", "blob", "container", "", "future"} {
		t.Run(visibility, func(t *testing.T) {
			body, err := json.Marshal(azureacl.Policy{PublicAccess: visibility, StoredAccessPolicies: []azureacl.StoredAccessPolicy{}})
			if err != nil {
				t.Fatal(err)
			}
			adapter := &azureAdapter{
				getPolicy: func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error) {
					return azureacl.Response{Status: 200, Body: body}, nil
				},
			}
			policy, err := adapter.getContainerPolicy(context.Background(), models.ProfileSecrets{}, "demo", "read policy", "bucket_public_exposure_failed")
			invalid := visibility == "" || visibility == "future"
			if (err != nil) != invalid {
				t.Fatalf("visibility=%q policy=%+v err=%v", visibility, policy, err)
			}
			if !invalid && policy.PublicAccess != visibility {
				t.Fatalf("policy=%+v", policy)
			}
		})
	}
}

func TestAzureVisibilityReadbackChecksPreservedPolicies(t *testing.T) {
	original := []azureacl.StoredAccessPolicy{
		{ID: "reader", Permission: "r", Start: "2026-09-01T00:00:00Z", Expiry: "2026-10-01T00:00:00Z"},
		{ID: "writer", Permission: "w"},
	}
	for _, tc := range []struct {
		name      string
		policies  []azureacl.StoredAccessPolicy
		wantError bool
	}{
		{"preserved", original, false},
		{"reordered", []azureacl.StoredAccessPolicy{original[1], original[0]}, false},
		{"removed", nil, true},
		{"duplicate", []azureacl.StoredAccessPolicy{original[0], original[0]}, true},
		{"permission changed", []azureacl.StoredAccessPolicy{{ID: "reader", Permission: "rw", Start: original[0].Start, Expiry: original[0].Expiry}, original[1]}, true},
		{"expiry removed", []azureacl.StoredAccessPolicy{{ID: "reader", Permission: "r", Start: original[0].Start}, original[1]}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			reads, writes := 0, 0
			adapter := &azureAdapter{
				getPolicy: func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error) {
					reads++
					policy := azureacl.Policy{PublicAccess: "private", StoredAccessPolicies: original}
					if reads > 1 {
						policy = azureacl.Policy{PublicAccess: "blob", StoredAccessPolicies: tc.policies}
					}
					body, err := json.Marshal(policy)
					return azureacl.Response{Status: 200, Body: body}, err
				},
				putPolicy: func(context.Context, models.ProfileSecrets, string, []byte) (azureacl.Response, error) {
					writes++
					return azureacl.Response{Status: 200}, nil
				},
			}
			err := adapter.PutPublicExposure(context.Background(), models.ProfileSecrets{}, "demo", models.BucketPublicExposurePutRequest{Visibility: "blob"})
			if (err != nil) != tc.wantError || reads != 2 || writes != 1 {
				t.Fatalf("err=%v reads=%d writes=%d", err, reads, writes)
			}
			if tc.wantError {
				var opErr *OperationError
				if !errors.As(err, &opErr) || opErr.Code != "bucket_public_exposure_unconfirmed" {
					t.Fatalf("err=%v", err)
				}
			}
		})
	}
}

func TestAzureAccessRequiresReadback(t *testing.T) {
	for _, tc := range []struct {
		name                                        string
		observed                                    string
		readFail, writeFail, cancelWrite, wantError bool
	}{
		{name: "matching", observed: `{"publicAccess":"blob","storedAccessPolicies":[{"id":"reader","permission":"r","start":"2026-09-01T00:00:00Z"}]}`},
		{name: "equivalent timestamp", observed: `{"publicAccess":"blob","storedAccessPolicies":[{"id":"reader","permission":"r","start":"2026-09-01T01:00:00.000+01:00"}]}`},
		{name: "missing policy", observed: `{"publicAccess":"blob","storedAccessPolicies":[]}`, wantError: true},
		{name: "changed visibility", observed: `{"publicAccess":"private","storedAccessPolicies":[{"id":"reader","permission":"r","start":"2026-09-01"}]}`, wantError: true},
		{name: "read failed", readFail: true, wantError: true},
		{name: "canceled write", observed: `{"publicAccess":"blob","storedAccessPolicies":[{"id":"reader","permission":"r","start":"2026-09-01"}]}`, writeFail: true, cancelWrite: true, wantError: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			reads, writes := 0, 0
			adapter := &azureAdapter{
				getPolicy: func(readCtx context.Context, _ models.ProfileSecrets, _ string) (azureacl.Response, error) {
					reads++
					if reads == 1 {
						return azureacl.Response{Status: 200, Body: []byte(`{"publicAccess":"blob","storedAccessPolicies":[]}`)}, nil
					}
					if readCtx.Err() != nil {
						t.Fatalf("readback canceled: %v", readCtx.Err())
					}
					if _, ok := readCtx.Deadline(); !ok {
						t.Fatal("missing readback deadline")
					}
					if tc.readFail {
						return azureacl.Response{}, errors.New("read failed")
					}
					return azureacl.Response{Status: 200, Body: []byte(tc.observed)}, nil
				},
				putPolicy: func(context.Context, models.ProfileSecrets, string, []byte) (azureacl.Response, error) {
					writes++
					if tc.cancelWrite {
						cancel()
					}
					if tc.writeFail {
						return azureacl.Response{}, context.Canceled
					}
					return azureacl.Response{Status: 200}, nil
				},
			}
			err := adapter.PutAccess(ctx, models.ProfileSecrets{}, "demo", models.BucketAccessPutRequest{
				StoredAccessPolicies: []models.BucketStoredAccessPolicy{{ID: "reader", Permission: "r", Start: "2026-09-01"}},
			})
			if (err != nil) != tc.wantError || reads != 2 || writes != 1 {
				t.Fatalf("err=%v reads=%d writes=%d", err, reads, writes)
			}
			if tc.wantError {
				var opErr *OperationError
				code := "bucket_access_unconfirmed"
				if tc.writeFail {
					code = "bucket_access_error"
				}
				if !errors.As(err, &opErr) || opErr.Code != code {
					t.Fatalf("err=%v", err)
				}
			}
		})
	}
}

func TestAzureAccessRejectsMissingPolicyList(t *testing.T) {
	for _, body := range []string{`{"publicAccess":"private"}`, `{"publicAccess":"private","storedAccessPolicies":null}`} {
		for _, afterWrite := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/afterWrite=%v", body, afterWrite), func(t *testing.T) {
				reads, writes := 0, 0
				adapter := &azureAdapter{
					getPolicy: func(context.Context, models.ProfileSecrets, string) (azureacl.Response, error) {
						reads++
						if afterWrite && reads == 1 {
							return azureacl.Response{Status: 200, Body: []byte(`{"publicAccess":"private","storedAccessPolicies":[]}`)}, nil
						}
						return azureacl.Response{Status: 200, Body: []byte(body)}, nil
					},
					putPolicy: func(context.Context, models.ProfileSecrets, string, []byte) (azureacl.Response, error) {
						writes++
						return azureacl.Response{Status: 200}, nil
					},
				}
				err := adapter.PutAccess(context.Background(), models.ProfileSecrets{}, "demo", models.BucketAccessPutRequest{StoredAccessPolicies: []models.BucketStoredAccessPolicy{}})
				code, wantWrites := "bucket_access_error", 0
				if afterWrite {
					code, wantWrites = "bucket_access_unconfirmed", 1
				}
				var opErr *OperationError
				if !errors.As(err, &opErr) || opErr.Code != code || writes != wantWrites {
					t.Fatalf("err=%v writes=%d", err, writes)
				}
			})
		}
	}
}
