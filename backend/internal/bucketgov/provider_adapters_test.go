package bucketgov

import (
	"context"
	"encoding/json"
	"testing"

	"s3desk/internal/azureacl"
	"s3desk/internal/gcsbucket"
	"s3desk/internal/gcsiam"
	"s3desk/internal/models"
	"s3desk/internal/ocicli"
)

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
