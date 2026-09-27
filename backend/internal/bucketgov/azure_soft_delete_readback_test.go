package bucketgov

import (
	"context"
	"errors"
	"s3desk/internal/azureacl"
	"s3desk/internal/models"
	"testing"
)

func TestAzureSoftDeleteReadback(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		status     int
		want       string
	}{
		{"match", `{"deleteRetentionPolicy":{"enabled":true,"days":7}}`, 202, ""},
		{"disabled", `{"deleteRetentionPolicy":{"enabled":false}}`, 202, "bucket_protection_unconfirmed"},
		{"wrong days", `{"deleteRetentionPolicy":{"enabled":true,"days":8}}`, 202, "bucket_protection_unconfirmed"},
		{"missing", `{}`, 202, "bucket_protection_unconfirmed"},
		{"missing enabled", `{"deleteRetentionPolicy":{"days":7}}`, 202, "bucket_protection_unconfirmed"},
		{"read failure", "", 202, "bucket_protection_unconfirmed"},
		{"write failure wins", "", 403, "bucket_protection_error"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			reads, writes := 0, 0
			a := &azureAdapter{
				getServiceProperties: func(ctx context.Context, _ models.ProfileSecrets) (azureacl.Response, error) {
					reads++
					if reads == 1 {
						return azureacl.Response{Status: 200, Body: []byte(`{"deleteRetentionPolicy":{"enabled":false}}`)}, nil
					}
					if ctx.Err() != nil {
						t.Fatal("cancelled readback")
					}
					if _, ok := ctx.Deadline(); !ok {
						t.Fatal("unbounded readback")
					}
					if tc.body == "" {
						return azureacl.Response{}, errors.New("read failed")
					}
					return azureacl.Response{Status: 200, Body: []byte(tc.body)}, nil
				},
				putServiceProperties: func(context.Context, models.ProfileSecrets, []byte) (azureacl.Response, error) {
					writes++
					cancel()
					return azureacl.Response{Status: tc.status}, nil
				},
			}
			days := 7
			err := a.PutProtection(ctx, models.ProfileSecrets{}, "demo", models.BucketProtectionPutRequest{SoftDelete: &models.BucketSoftDeleteView{Enabled: true, Days: &days}})
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
			if reads != 2 || writes != 1 {
				t.Fatalf("reads=%d writes=%d", reads, writes)
			}
		})
	}
}

func TestAzureSoftDeleteMissingInitialStateBlocksWrite(t *testing.T) {
	a := &azureAdapter{
		getServiceProperties: func(context.Context, models.ProfileSecrets) (azureacl.Response, error) {
			return azureacl.Response{Status: 200, Body: []byte(`{}`)}, nil
		},
		putServiceProperties: func(context.Context, models.ProfileSecrets, []byte) (azureacl.Response, error) {
			t.Fatal("unknown initial state reached write")
			return azureacl.Response{}, nil
		},
	}
	if err := a.PutProtection(context.Background(), models.ProfileSecrets{}, "demo", models.BucketProtectionPutRequest{SoftDelete: &models.BucketSoftDeleteView{Enabled: false}}); err == nil {
		t.Fatal("unknown state accepted")
	}
}
