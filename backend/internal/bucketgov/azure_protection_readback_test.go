package bucketgov

import (
	"context"
	"errors"
	"s3desk/internal/azurearmimmutability"
	"s3desk/internal/models"
	"testing"
)

func TestAzureImmutabilityReadback(t *testing.T) {
	for _, action := range []string{"create", "delete", "extend", "lock"} {
		for _, outcome := range []string{"match", "mismatch", "read failure", "write failure"} {
			t.Run(action+"/"+outcome, func(t *testing.T) {
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				days := 7
				req := models.BucketImmutabilityView{Enabled: true, Days: &days, Mode: "unlocked", ETag: "before"}
				current := &azurearmimmutability.Policy{ETag: "before", Properties: azurearmimmutability.PolicyProperties{State: "Unlocked", ImmutabilityPeriodSinceCreationInDays: 3}}
				switch action {
				case "create":
					current = nil
					req.ETag = ""
				case "delete":
					req.Enabled = false
				case "extend":
					current.Properties.State = "Locked"
					req.Mode = "locked"
				case "lock":
					req.Mode = "locked"
				}
				reads, writes := 0, 0
				write := func() (azurearmimmutability.Response, error) {
					writes++
					cancel()
					if outcome == "write failure" {
						return azurearmimmutability.Response{}, errors.New("write failed")
					}
					return azurearmimmutability.Response{Status: 200, Body: []byte(`{"etag":"after","properties":{"state":"Unlocked","immutabilityPeriodSinceCreationInDays":7}}`)}, nil
				}
				a := &azureAdapter{
					putImmutabilityPolicy: func(context.Context, models.ProfileSecrets, string, azurearmimmutability.PutPolicyRequest) (azurearmimmutability.Response, error) {
						return write()
					},
					deleteImmutabilityPolicy: func(context.Context, models.ProfileSecrets, string, string) (azurearmimmutability.Response, error) {
						return write()
					},
					lockImmutabilityPolicy: func(context.Context, models.ProfileSecrets, string, string) (azurearmimmutability.Response, error) {
						return write()
					},
					extendImmutabilityPolicy: func(context.Context, models.ProfileSecrets, string, azurearmimmutability.ExtendPolicyRequest) (azurearmimmutability.Response, error) {
						return write()
					},
					getImmutabilityPolicy: func(readCtx context.Context, _ models.ProfileSecrets, _ string) (azurearmimmutability.Response, error) {
						reads++
						if readCtx.Err() != nil {
							t.Fatal("cancelled readback")
						}
						if _, ok := readCtx.Deadline(); !ok {
							t.Fatal("unbounded readback")
						}
						if outcome == "read failure" {
							return azurearmimmutability.Response{}, errors.New("read failed")
						}
						if action == "delete" && outcome != "mismatch" {
							return azurearmimmutability.Response{Status: 404}, nil
						}
						if outcome == "mismatch" {
							return azurearmimmutability.Response{Status: 200, Body: []byte(`{"properties":{"state":"Unlocked","immutabilityPeriodSinceCreationInDays":3}}`)}, nil
						}
						state := "Unlocked"
						if req.Mode == "locked" {
							state = "Locked"
						}
						return azurearmimmutability.Response{Status: 200, Body: []byte(`{"etag":"observed","properties":{"state":"` + state + `","immutabilityPeriodSinceCreationInDays":7}}`)}, nil
					},
				}
				err := a.putAzureProtectionImmutability(ctx, models.ProfileSecrets{}, "demo", current, req)
				if outcome == "match" {
					if err != nil {
						t.Fatal(err)
					}
				} else {
					want := "bucket_protection_unconfirmed"
					if outcome == "write failure" {
						want = "bucket_protection_error"
					}
					var op *OperationError
					if !errors.As(err, &op) || op.Code != want {
						t.Fatalf("err=%v want=%s", err, want)
					}
				}
				wantWrites := 1
				if action == "lock" && outcome != "write failure" {
					wantWrites = 2
				}
				if reads != 1 || writes != wantWrites {
					t.Fatalf("reads=%d writes=%d", reads, writes)
				}
			})
		}
	}
}

func TestAzureLegalHoldReadback(t *testing.T) {
	for _, outcome := range []string{"match", "mismatch", "read failure", "write failure"} {
		t.Run(outcome, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			reads, writes := 0, 0
			a := &azureAdapter{
				setLegalHold: func(context.Context, models.ProfileSecrets, string, azurearmimmutability.LegalHoldRequest) (azurearmimmutability.Response, error) {
					writes++
					cancel()
					if outcome == "write failure" {
						return azurearmimmutability.Response{}, errors.New("write failed")
					}
					return azurearmimmutability.Response{Status: 200}, nil
				},
				getContainer: func(ctx context.Context, _ models.ProfileSecrets, _ string) (azurearmimmutability.Response, error) {
					reads++
					if ctx.Err() != nil {
						t.Fatal("cancelled readback")
					}
					if _, ok := ctx.Deadline(); !ok {
						t.Fatal("unbounded readback")
					}
					if outcome == "read failure" {
						return azurearmimmutability.Response{}, errors.New("read failed")
					}
					body := `{"properties":{"legalHold":{"hasLegalHold":true,"tags":[{"tag":"tag2"},{"tag":"tag1"}]}}}`
					if outcome == "mismatch" {
						body = `{"properties":{"legalHold":{"tags":[]}}}`
					}
					return azurearmimmutability.Response{Status: 200, Body: []byte(body)}, nil
				},
			}
			err := a.putAzureLegalHold(ctx, models.ProfileSecrets{}, "demo", &azureLegalHold{}, []string{"TAG1", "tag2"})
			if outcome == "match" {
				if err != nil {
					t.Fatal(err)
				}
			} else {
				want := "bucket_protection_unconfirmed"
				if outcome == "write failure" {
					want = "bucket_protection_error"
				}
				var op *OperationError
				if !errors.As(err, &op) || op.Code != want {
					t.Fatalf("err=%v want=%s", err, want)
				}
			}
			if reads != 1 || writes != 1 {
				t.Fatalf("reads=%d writes=%d", reads, writes)
			}
		})
	}
}

func TestAzureImmutabilityRevisionPreflight(t *testing.T) {
	for _, revision := range []string{"", "stale", "removed"} {
		t.Run(revision, func(t *testing.T) {
			a := &azureAdapter{
				getImmutabilityPolicy: func(context.Context, models.ProfileSecrets, string) (azurearmimmutability.Response, error) {
					if revision == "removed" {
						return azurearmimmutability.Response{Status: 404}, nil
					}
					return azurearmimmutability.Response{Status: 200, Body: []byte(`{"etag":"current","properties":{"state":"Unlocked","immutabilityPeriodSinceCreationInDays":3}}`)}, nil
				},
			}
			days := 7
			profile := models.ProfileSecrets{AzureSubscriptionID: "sub", AzureResourceGroup: "rg", AzureTenantID: "tenant", AzureClientID: "client", AzureClientSecret: "fixture"}
			err := a.PutProtection(context.Background(), profile, "demo", models.BucketProtectionPutRequest{
				SoftDelete:   &models.BucketSoftDeleteView{Enabled: true, Days: &days},
				Immutability: &models.BucketImmutabilityView{Enabled: true, Days: &days, ETag: revision},
			})
			if err == nil {
				t.Fatal("unreviewed revision accepted")
			}
			if revision != "" {
				var op *OperationError
				if !errors.As(err, &op) || op.Code != "bucket_policy_conflict" {
					t.Fatalf("err=%v", err)
				}
			}
		})
	}
}

func TestAzureImmutabilityConflictAndMissingLockRevision(t *testing.T) {
	a := &azureAdapter{putImmutabilityPolicy: func(context.Context, models.ProfileSecrets, string, azurearmimmutability.PutPolicyRequest) (azurearmimmutability.Response, error) {
		return azurearmimmutability.Response{Status: 412}, nil
	}}
	_, err := a.putAzureImmutability(context.Background(), models.ProfileSecrets{}, "demo", azurearmimmutability.PutPolicyRequest{IfMatch: "edited"}, "put", "bucket_protection_error")
	var op *OperationError
	if !errors.As(err, &op) || op.Code != "bucket_policy_conflict" {
		t.Fatalf("err=%v", err)
	}
	a.lockImmutabilityPolicy = func(context.Context, models.ProfileSecrets, string, string) (azurearmimmutability.Response, error) {
		t.Fatal("missing revision reached lock")
		return azurearmimmutability.Response{}, nil
	}
	if err := a.lockAzureImmutability(context.Background(), models.ProfileSecrets{}, "demo", "", "lock", "bucket_protection_error"); err == nil {
		t.Fatal("missing revision accepted")
	}
}
