package bucketgov

import (
	"context"
	"encoding/json"
	"errors"
	"s3desk/internal/gcsiam"
	"s3desk/internal/models"
	"testing"
)

func TestGCSIAMReadback(t *testing.T) {
	const requested = `{"version":3,"etag":"before","bindings":[{"role":"roles/storage.objectViewer","members":["user:a@example.test","user:b@example.test"],"condition":{"title":"approved","expression":"true"}}]}`
	for _, tc := range []struct {
		name, body string
		status     int
		want       string
	}{
		{"match reordered", `{"version":3,"etag":"after","bindings":[{"role":"roles/storage.objectViewer","members":["user:b@example.test","user:a@example.test"],"condition":{"expression":"true","title":"approved"}}]}`, 200, ""},
		{"binding missing", `{"etag":"after","bindings":[]}`, 200, "bucket_access_unconfirmed"},
		{"condition removed", `{"etag":"after","bindings":[{"role":"roles/storage.objectViewer","members":["user:a@example.test","user:b@example.test"]}]}`, 200, "bucket_access_unconfirmed"},
		{"revision missing", `{"bindings":[]}`, 200, "bucket_access_unconfirmed"},
		{"null", `null`, 200, "bucket_access_unconfirmed"},
		{"read failed", "", 200, "bucket_access_unconfirmed"},
		{"conflict retained", requested, 412, "bucket_policy_conflict"},
		{"write failed", requested, 403, "bucket_access_error"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			reads, writes := 0, 0
			a := &gcsAdapter{
				putPolicy: func(context.Context, models.ProfileSecrets, string, []byte) (gcsiam.Response, error) {
					writes++
					cancel()
					return gcsiam.Response{Status: tc.status}, nil
				},
				getPolicy: func(ctx context.Context, _ models.ProfileSecrets, _ string) (gcsiam.Response, error) {
					reads++
					if ctx.Err() != nil {
						t.Fatal("readback cancelled")
					}
					if _, ok := ctx.Deadline(); !ok {
						t.Fatal("readback unbounded")
					}
					if tc.body == "" {
						return gcsiam.Response{}, errors.New("unavailable")
					}
					return gcsiam.Response{Status: 200, Body: []byte(tc.body)}, nil
				},
			}
			var policy gcsIAMPolicy
			if err := json.Unmarshal([]byte(requested), &policy); err != nil {
				t.Fatal(err)
			}
			err := a.putIAMPolicy(ctx, models.ProfileSecrets{}, "demo", policy, "save access", "bucket_access_error")
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
