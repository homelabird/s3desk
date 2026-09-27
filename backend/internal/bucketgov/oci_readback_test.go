package bucketgov

import (
	"context"
	"encoding/json"
	"errors"
	"s3desk/internal/models"
	"s3desk/internal/ocicli"
	"testing"
)

func TestOCIRetentionLockTimestamp(t *testing.T) {
	for _, tc := range []struct {
		value       string
		locked, bad bool
	}{
		{`null`, false, false}, {`"2000-01-01T00:00:00Z"`, true, false}, {`"2999-01-01T00:00:00Z"`, false, false}, {`true`, false, true}, {`"invalid"`, false, true},
	} {
		var rule ociRetentionRule
		err := json.Unmarshal([]byte(`{"time-rule-locked":`+tc.value+`}`), &rule)
		if (err != nil) != tc.bad {
			t.Fatalf("value=%s err=%v", tc.value, err)
		}
		if err == nil && ociRetentionRuleLocked(rule) != tc.locked {
			t.Fatalf("value=%s lock mismatch", tc.value)
		}
	}
}

func TestOCIReadbackConfirmsDeletion(t *testing.T) {
	for _, section := range []string{"retention", "sharing"} {
		for _, body := range []string{`{"data":[]}`, `{}`, `{"data":null}`, `null`, `{"data":[{"id":"old"}]}`} {
			t.Run(section+body, func(t *testing.T) {
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				reads, writes := 0, 0
				list := func(ctx context.Context, _ models.ProfileSecrets, _ string) (ocicli.Response, error) {
					reads++
					if reads == 1 {
						return ocicli.Response{Body: []byte(`{"data":[{"id":"old","duration":{"time-amount":7,"time-unit":"DAYS"}}]}`)}, nil
					}
					if ctx.Err() != nil {
						t.Fatal("cancelled readback")
					}
					if _, ok := ctx.Deadline(); !ok {
						t.Fatal("unbounded readback")
					}
					return ocicli.Response{Body: []byte(body)}, nil
				}
				remove := func(context.Context, models.ProfileSecrets, string, string) (ocicli.Response, error) {
					writes++
					cancel()
					return ocicli.Response{}, nil
				}
				a := &ociAdapter{listRetentionRules: list, deleteRetentionRule: remove, listPreauthenticatedRequests: list, deletePreauthenticatedRequest: remove}
				var err error
				if section == "retention" {
					err = a.PutProtection(ctx, models.ProfileSecrets{}, "demo", models.BucketProtectionPutRequest{Retention: &models.BucketRetentionView{Enabled: false}})
				} else {
					_, err = a.PutSharing(ctx, models.ProfileSecrets{}, "demo", models.BucketSharingPutRequest{})
				}
				if body == `{"data":[]}` {
					if err != nil {
						t.Fatal(err)
					}
				} else {
					want := "bucket_protection_unconfirmed"
					if section == "sharing" {
						want = "bucket_sharing_unconfirmed"
					}
					var op *OperationError
					if !errors.As(err, &op) || op.Code != want {
						t.Fatalf("err=%v want=%s", err, want)
					}
				}
				if reads != 2 || writes != 1 {
					t.Fatalf("reads=%d writes=%d", reads, writes)
				}
			})
		}
	}
}

func TestOCICreatedSharingReadbackDoesNotRollback(t *testing.T) {
	for _, matches := range []bool{false, true} {
		reads, creates, deletes := 0, 0, 0
		a := &ociAdapter{
			listPreauthenticatedRequests: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
				reads++
				if reads == 1 || !matches {
					return ocicli.Response{Body: []byte(`{"data":[]}`)}, nil
				}
				return ocicli.Response{Body: []byte(`{"data":[{"id":"new","name":"PAR 1","access-type":"AnyObjectRead","bucket-listing-action":"Deny","time-expires":"2030-01-01T00:00:00Z"}]}`)}, nil
			},
			createPreauthenticatedRequest: func(context.Context, models.ProfileSecrets, string, string, string, string, string, string) (ocicli.Response, error) {
				creates++
				return ocicli.Response{Body: []byte(`{"data":{"id":"new","access-uri":"/fixture-link"}}`)}, nil
			},
			deletePreauthenticatedRequest: func(context.Context, models.ProfileSecrets, string, string) (ocicli.Response, error) {
				deletes++
				return ocicli.Response{}, nil
			},
		}
		view, err := a.PutSharing(context.Background(), models.ProfileSecrets{}, "demo", models.BucketSharingPutRequest{PreauthenticatedRequests: []models.BucketPreauthenticatedRequestView{{AccessType: "AnyObjectRead", TimeExpires: "2030-01-01T00:00:00Z"}}})
		if matches {
			if err != nil || len(view.PreauthenticatedRequests) != 1 || view.PreauthenticatedRequests[0].AccessURI != "/fixture-link" {
				t.Fatalf("matching readback failed: %v", err)
			}
		} else {
			var op *OperationError
			if !errors.As(err, &op) || op.Code != "bucket_sharing_unconfirmed" {
				t.Fatalf("err=%v", err)
			}
		}
		if reads != 2 || creates != 1 || deletes != 0 {
			t.Fatalf("reads=%d creates=%d deletes=%d", reads, creates, deletes)
		}
	}
}

func TestOCIRetentionComparisonRejectsChangedFields(t *testing.T) {
	days := 7
	desired := []models.BucketRetentionRuleView{{ID: "one", DisplayName: "keep", Days: &days}}
	for _, tc := range []struct {
		body string
		want bool
	}{
		{`[{"id":"one","display-name":"keep","duration":{"time-amount":7,"time-unit":"DAYS"}}]`, true},
		{`[{"id":"one","display-name":"changed","duration":{"time-amount":7,"time-unit":"DAYS"}}]`, false},
		{`[{"id":"one","display-name":"keep","duration":{"time-amount":8,"time-unit":"DAYS"}}]`, false},
		{`[{"id":"one","display-name":"keep","duration":{"time-amount":7,"time-unit":"YEARS"}}]`, false},
		{`[{"id":"one","display-name":"keep","time-rule-locked":"2999-01-01T00:00:00Z","duration":{"time-amount":7,"time-unit":"DAYS"}}]`, false},
	} {
		var observed []ociRetentionRule
		if err := json.Unmarshal([]byte(tc.body), &observed); err != nil {
			t.Fatal(err)
		}
		if got := ociRetentionRulesMatch(desired, nil, observed); got != tc.want {
			t.Fatalf("match=%v for %s", got, tc.body)
		}
	}
}

func TestOCIListsRejectAmbiguousIDs(t *testing.T) {
	for _, body := range []string{`{"data":[{}]}`, `{"data":[{"id":"same"},{"id":"same"}]}`} {
		list := func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
			return ocicli.Response{Body: []byte(body)}, nil
		}
		a := &ociAdapter{listRetentionRules: list, listPreauthenticatedRequests: list}
		if _, err := a.GetProtection(context.Background(), models.ProfileSecrets{}, "demo"); err == nil {
			t.Fatal("invalid retention IDs accepted")
		}
		if _, err := a.GetSharing(context.Background(), models.ProfileSecrets{}, "demo"); err == nil {
			t.Fatal("invalid sharing IDs accepted")
		}
	}
}

func TestOCISharingPreservesExactTarget(t *testing.T) {
	for _, target := range []string{"", " ", " 보고서/ ", "docs/+%2F\t"} {
		item := ociPreauthenticatedRequest{ID: "new", Name: "link", AccessType: "AnyObjectRead", BucketListingAction: "Deny", ObjectName: target, TimeExpires: "2030-01-01T00:00:00Z"}
		view := toBucketPreauthenticatedRequest(item)
		if view.ObjectName != target || existingPARChanged(item, view) {
			t.Fatalf("target changed: %q", target)
		}
		changed := view
		changed.ObjectName = target + " "
		if !existingPARChanged(item, changed) {
			t.Fatalf("changed scope accepted: %q", target)
		}
		reads := 0
		a := &ociAdapter{
			listPreauthenticatedRequests: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
				reads++
				if reads == 1 {
					return ocicli.Response{Body: []byte(`{"data":[]}`)}, nil
				}
				data, err := json.Marshal(map[string]any{"data": []ociPreauthenticatedRequest{item}})
				return ocicli.Response{Body: data}, err
			},
			createPreauthenticatedRequest: func(_ context.Context, _ models.ProfileSecrets, _, _, _, _, got, _ string) (ocicli.Response, error) {
				if got != target {
					t.Fatalf("create target=%q want=%q", got, target)
				}
				data, err := json.Marshal(map[string]any{"data": item})
				return ocicli.Response{Body: data}, err
			},
		}
		view.ID = ""
		result, err := a.PutSharing(context.Background(), models.ProfileSecrets{}, "demo", models.BucketSharingPutRequest{PreauthenticatedRequests: []models.BucketPreauthenticatedRequestView{view}})
		if err != nil || len(result.PreauthenticatedRequests) != 1 || result.PreauthenticatedRequests[0].ObjectName != target {
			t.Fatalf("target=%q result=%+v err=%v", target, result, err)
		}
	}
}

func TestOCISharingExpirationComparison(t *testing.T) {
	desired := models.BucketPreauthenticatedRequestView{Name: "link", AccessType: "AnyObjectRead", BucketListingAction: "Deny", TimeExpires: "2030-01-01T00:00:00Z"}
	for _, tc := range []struct {
		expiry  string
		changed bool
	}{
		{"2030-01-01T00:00:00.000000+00:00", false},
		{"2030-01-01T09:00:00+09:00", false},
		{"2030-01-01T00:00:00.000001Z", true},
		{"2030-01-01T00:00:01Z", true},
		{"", true}, {"invalid", true},
	} {
		current := ociPreauthenticatedRequest{Name: desired.Name, AccessType: desired.AccessType, BucketListingAction: desired.BucketListingAction, TimeExpires: tc.expiry}
		if got := existingPARChanged(current, desired); got != tc.changed {
			t.Fatalf("expiry=%q changed=%v", tc.expiry, got)
		}
	}
}
