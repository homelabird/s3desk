package bucketgov

import (
	"context"
	"errors"
	"fmt"
	"s3desk/internal/models"
	"s3desk/internal/ocicli"
	"testing"
)

func TestOCIRetentionChecksVersioningBeforeWriting(t *testing.T) {
	for _, state := range []string{"Enabled", "Suspended", "Disabled", "", "Unknown", "read_error"} {
		t.Run(state, func(t *testing.T) {
			writes := 0
			a := &ociAdapter{
				getBucket: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
					if state == "read_error" {
						return ocicli.Response{}, errors.New("read failed")
					}
					return ocicli.Response{Body: []byte(fmt.Sprintf(`{"data":{"versioning":%q}}`, state))}, nil
				},
				listRetentionRules: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
					body := `{"data":[]}`
					if writes > 0 {
						body = `{"data":[{"id":"new","display-name":"new","duration":{"time-amount":7,"time-unit":"DAYS"}}]}`
					}
					return ocicli.Response{Body: []byte(body)}, nil
				},
				createRetentionRule: func(context.Context, models.ProfileSecrets, string, int, string, string) (ocicli.Response, error) {
					writes++
					return ocicli.Response{Body: []byte(`{"data":{"id":"new"}}`)}, nil
				},
			}
			days := 7
			err := a.PutProtection(context.Background(), models.ProfileSecrets{}, "demo", models.BucketProtectionPutRequest{Retention: &models.BucketRetentionView{Enabled: true, Rules: []models.BucketRetentionRuleView{{DisplayName: "new", Days: &days}}}})
			allowed := state == "Suspended" || state == "Disabled"
			if (err == nil) != allowed || (writes == 1) != allowed {
				t.Fatalf("writes=%d err=%v allowed=%v", writes, err, allowed)
			}
		})
	}
}

func TestOCIVersioningChecksRetentionBeforeEnabling(t *testing.T) {
	for _, body := range []string{`{"data":[]}`, `{"data":[{"id":"active"}]}`, `{"data":null}`, `{}`, `read_error`} {
		t.Run(body, func(t *testing.T) {
			for _, status := range []models.BucketVersioningStatus{models.BucketVersioningStatusEnabled, models.BucketVersioningStatusSuspended} {
				reads, writes := 0, 0
				a := &ociAdapter{
					listRetentionRules: func(context.Context, models.ProfileSecrets, string) (ocicli.Response, error) {
						reads++
						if body == "read_error" {
							return ocicli.Response{}, errors.New("read failed")
						}
						return ocicli.Response{Body: []byte(body)}, nil
					},
					updateBucket: func(context.Context, models.ProfileSecrets, string, string, string) (ocicli.Response, error) {
						writes++
						return ocicli.Response{Body: []byte(`{"data":{}}`)}, nil
					},
				}
				err := a.PutVersioning(context.Background(), models.ProfileSecrets{}, "demo", models.BucketVersioningPutRequest{Status: status})
				allowed := status == models.BucketVersioningStatusSuspended || body == `{"data":[]}`
				if (err == nil) != allowed || (writes == 1) != allowed {
					t.Fatalf("status=%s writes=%d err=%v", status, writes, err)
				}
				if (reads == 0) != (status == models.BucketVersioningStatusSuspended) {
					t.Fatalf("unexpected reads=%d", reads)
				}
			}
		})
	}
}
