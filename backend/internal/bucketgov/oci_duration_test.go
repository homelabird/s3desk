package bucketgov

import (
	"context"
	"encoding/json"
	"s3desk/internal/models"
	"s3desk/internal/ocicli"
	"testing"
	"time"
)

func TestOCIRetentionNativeDurationRoundTrip(t *testing.T) {
	for _, tc := range []struct {
		name            string
		existing        bool
		before, desired *ociRetentionDuration
		locked, bad     bool
	}{
		{"create years", false, nil, &ociRetentionDuration{2, "YEARS"}, false, false},
		{"create indefinite", false, nil, nil, false, false},
		{"preserve years", true, &ociRetentionDuration{2, "YEARS"}, &ociRetentionDuration{2, "YEARS"}, false, false},
		{"years to days", true, &ociRetentionDuration{2, "YEARS"}, &ociRetentionDuration{800, "DAYS"}, false, false},
		{"days to indefinite", true, &ociRetentionDuration{7, "DAYS"}, nil, false, false},
		{"indefinite to years", true, nil, &ociRetentionDuration{3, "YEARS"}, false, false},
		{"locked extend years", true, &ociRetentionDuration{2, "YEARS"}, &ociRetentionDuration{3, "YEARS"}, true, false},
		{"locked shorten", true, &ociRetentionDuration{2, "YEARS"}, &ociRetentionDuration{1, "YEARS"}, true, true},
		{"locked change unit", true, &ociRetentionDuration{2, "YEARS"}, &ociRetentionDuration{900, "DAYS"}, true, true},
		{"locked remove duration", true, &ociRetentionDuration{2, "YEARS"}, nil, true, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rules := []ociRetentionRule{}
			if tc.existing {
				rules = append(rules, ociRetentionRule{ID: "id", DisplayName: "rule", Duration: tc.before})
			}
			if tc.locked {
				past := time.Now().Add(-time.Hour)
				rules[0].TimeRuleLocked = &past
			}
			writes := 0
			save := func(amount int, unit, name string) (ocicli.Response, error) {
				writes++
				rule := ociRetentionRule{ID: "id", DisplayName: name}
				if len(rules) > 0 {
					rule.TimeRuleLocked = rules[0].TimeRuleLocked
				}
				if unit != "" {
					rule.Duration = &ociRetentionDuration{amount, unit}
				}
				rules = []ociRetentionRule{rule}
				body, _ := json.Marshal(map[string]any{"data": rule})
				return ocicli.Response{Body: body}, nil
			}
			a := &ociAdapter{
				getBucket: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
					return ocicli.Response{Body: []byte(`{"data":{"versioning":"Suspended"}}`)}, nil
				},
				listRetentionRules: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
					body, _ := json.Marshal(ociRetentionRulesResponse{Data: rules})
					return ocicli.Response{Body: body}, nil
				},
				createRetentionRule: func(_ context.Context, _ models.ProfileSecrets, _ string, amount int, unit, name string) (ocicli.Response, error) {
					return save(amount, unit, name)
				},
				updateRetentionRule: func(_ context.Context, _ models.ProfileSecrets, _, _ string, amount int, unit, name string) (ocicli.Response, error) {
					return save(amount, unit, name)
				},
			}
			desired := toBucketRetentionRule(ociRetentionRule{DisplayName: "rule", Duration: tc.desired})
			if tc.existing {
				desired.ID = "id"
			}
			err := a.PutProtection(context.Background(), models.ProfileSecrets{}, "demo", models.BucketProtectionPutRequest{Retention: &models.BucketRetentionView{Enabled: true, Rules: []models.BucketRetentionRuleView{desired}}})
			if (err != nil) != tc.bad {
				t.Fatalf("err=%v", err)
			}
			if tc.bad {
				if writes != 0 {
					t.Fatal("invalid mutation reached writer")
				}
				return
			}
			view, err := a.GetProtection(context.Background(), models.ProfileSecrets{}, "demo")
			if err != nil {
				t.Fatal(err)
			}
			got := view.Retention.Rules[0]
			if tc.desired == nil {
				if !got.Indefinite || got.Days != nil || got.Years != nil {
					t.Fatalf("got=%+v", got)
				}
			} else if tc.desired.TimeUnit == "YEARS" {
				if got.Years == nil || *got.Years != tc.desired.TimeAmount || got.Days != nil {
					t.Fatalf("years converted: %+v", got)
				}
			} else if got.Days == nil || *got.Days != tc.desired.TimeAmount {
				t.Fatalf("got=%+v", got)
			}
		})
	}
}

func TestOCIRetentionRejectsAmbiguousDuration(t *testing.T) {
	n := 1
	for _, rule := range []models.BucketRetentionRuleView{{}, {Days: &n, Years: &n}, {Days: &n, Indefinite: true}, {Years: &n, Indefinite: true}} {
		if _, err := ociDesiredRetentionDuration(rule); err == nil {
			t.Fatalf("accepted ambiguous rule: %+v", rule)
		}
	}
}
