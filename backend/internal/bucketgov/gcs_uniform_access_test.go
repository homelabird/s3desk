package bucketgov

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"s3desk/internal/gcsbucket"
	"s3desk/internal/gcsiam"
	"s3desk/internal/models"
)

func TestGCSUniformAccessDisablePreflight(t *testing.T) {
	future := time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339)
	past := time.Now().Add(-24 * time.Hour).UTC().Format(time.RFC3339)
	for _, tc := range []struct {
		name, metadata, policy string
		readFailure, wantError bool
		wantPolicyReads        int
	}{
		{name: "allowed", metadata: fmt.Sprintf(`{"iamConfiguration":{"uniformBucketLevelAccess":{"enabled":true,"lockedTime":%q}}}`, future), policy: `{"etag":"revision","bindings":[]}`, wantPolicyReads: 1},
		{name: "already disabled", metadata: `{"iamConfiguration":{"uniformBucketLevelAccess":{"enabled":false}}}`},
		{name: "hierarchical namespace", metadata: `{"hierarchicalNamespace":{"enabled":true},"iamConfiguration":{"uniformBucketLevelAccess":{"enabled":true}}}`, wantError: true},
		{name: "unknown state", metadata: `{}`, wantError: true},
		{name: "locked", metadata: fmt.Sprintf(`{"iamConfiguration":{"uniformBucketLevelAccess":{"enabled":true,"lockedTime":%q}}}`, past), wantError: true},
		{name: "missing deadline", metadata: `{"iamConfiguration":{"uniformBucketLevelAccess":{"enabled":true}}}`, wantError: true},
		{name: "invalid deadline", metadata: `{"iamConfiguration":{"uniformBucketLevelAccess":{"enabled":true,"lockedTime":"invalid"}}}`, wantError: true},
		{name: "IAM read failure", readFailure: true, wantError: true, wantPolicyReads: 1},
		{name: "missing IAM revision", policy: `{}`, wantError: true, wantPolicyReads: 1},
		{name: "conditional IAM", policy: `{"version":3,"etag":"revision","bindings":[{"role":"roles/storage.objectViewer","members":["user:reader@example.com"],"condition":{"title":"time","expression":"request.time < timestamp('2030-01-01T00:00:00Z')"}}]}`, wantError: true, wantPolicyReads: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if tc.metadata == "" {
				tc.metadata = fmt.Sprintf(`{"iamConfiguration":{"uniformBucketLevelAccess":{"enabled":true,"lockedTime":%q}}}`, future)
			}
			writes, policyReads := 0, 0
			a := &gcsAdapter{
				getBucket: func(context.Context, models.ProfileSecrets, string) (gcsbucket.Response, error) {
					body := tc.metadata
					if writes > 0 {
						body = `{"iamConfiguration":{"uniformBucketLevelAccess":{"enabled":false}}}`
					}
					return gcsbucket.Response{Status: 200, Body: []byte(body)}, nil
				},
				getPolicy: func(context.Context, models.ProfileSecrets, string) (gcsiam.Response, error) {
					policyReads++
					if tc.readFailure {
						return gcsiam.Response{}, errors.New("read failed")
					}
					return gcsiam.Response{Status: 200, Body: []byte(tc.policy)}, nil
				},
				patchBucket: func(context.Context, models.ProfileSecrets, string, []byte) (gcsbucket.Response, error) {
					writes++
					return gcsbucket.Response{Status: 200}, nil
				},
			}
			err := a.PutProtection(context.Background(), models.ProfileSecrets{}, "demo", models.BucketProtectionPutRequest{UniformAccess: boolPtr(false), Retention: &models.BucketRetentionView{Enabled: false}})
			if (err != nil) != tc.wantError {
				t.Fatalf("err=%v", err)
			}
			wantWrites := 1
			if tc.wantError {
				wantWrites = 0
			}
			if writes != wantWrites || policyReads != tc.wantPolicyReads {
				t.Fatalf("writes=%d policyReads=%d", writes, policyReads)
			}
		})
	}
}
