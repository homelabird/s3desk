package bucketgov

import (
	"context"
	"errors"
	"net/http"
	"s3desk/internal/gcsbucket"
	"s3desk/internal/models"
	"testing"
)

func TestGCSMetadataReadback(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		readErr    bool
		status     int
		want       string
	}{
		{name: "match", body: `{"versioning":{"enabled":false}}`, status: 200},
		{name: "mismatch", body: `{"versioning":{"enabled":true}}`, status: 200, want: "bucket_versioning_unconfirmed"},
		{name: "missing false", body: `{}`, status: 200, want: "bucket_versioning_unconfirmed"},
		{name: "null", body: `null`, status: 200, want: "bucket_versioning_unconfirmed"},
		{name: "read failure", readErr: true, status: 200, want: "bucket_versioning_unconfirmed"},
		{name: "write failure wins", readErr: true, status: 403, want: "bucket_versioning_error"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			reads, writes := 0, 0
			a := &gcsAdapter{
				patchBucket: func(context.Context, models.ProfileSecrets, string, []byte) (gcsbucket.Response, error) {
					writes++
					cancel()
					return gcsbucket.Response{Status: tc.status}, nil
				},
				getBucket: func(ctx context.Context, _ models.ProfileSecrets, _ string) (gcsbucket.Response, error) {
					reads++
					if ctx.Err() != nil {
						t.Fatal("cancelled readback")
					}
					if _, ok := ctx.Deadline(); !ok {
						t.Fatal("unbounded readback")
					}
					if tc.readErr {
						return gcsbucket.Response{}, errors.New("read failed")
					}
					return gcsbucket.Response{Status: http.StatusOK, Body: []byte(tc.body)}, nil
				},
			}
			err := a.PutVersioning(ctx, models.ProfileSecrets{}, "demo", models.BucketVersioningPutRequest{Status: models.BucketVersioningStatusDisabled})
			if tc.want == "" {
				if err != nil {
					t.Fatal(err)
				}
			} else {
				var op *OperationError
				if !errors.As(err, &op) || op.Code != tc.want {
					t.Fatalf("err=%v want=%s", err, tc.want)
				}
			}
			if reads != 1 || writes != 1 {
				t.Fatalf("reads=%d writes=%d", reads, writes)
			}
		})
	}
}

func TestGCSMetadataPatchComparison(t *testing.T) {
	for _, tc := range []struct {
		name            string
		observed, patch map[string]any
		want            bool
	}{
		{"retention seconds", map[string]any{"retentionPolicy": map[string]any{"retentionPeriod": "86401"}}, map[string]any{"retentionPolicy": map[string]any{"retentionPeriod": "172800"}}, false},
		{"retention removed", map[string]any{}, map[string]any{"retentionPolicy": nil}, true},
		{"retention remains", map[string]any{"retentionPolicy": map[string]any{"retentionPeriod": "86400"}}, map[string]any{"retentionPolicy": nil}, false},
		{"uniform false missing", map[string]any{}, map[string]any{"iamConfiguration": map[string]any{"uniformBucketLevelAccess": map[string]any{"enabled": false}}}, false},
		{"prevention mismatch", map[string]any{"iamConfiguration": map[string]any{"publicAccessPrevention": "inherited"}}, map[string]any{"iamConfiguration": map[string]any{"publicAccessPrevention": "enforced"}}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := gcsPatchFieldsMatch(tc.observed, tc.patch); got != tc.want {
				t.Fatalf("got=%v", got)
			}
		})
	}
}
