package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"reflect"
	"s3desk/internal/models"
	"strings"
	"testing"
	"time"
)

func TestGovernanceAuditSummaryExcludesSensitiveFields(t *testing.T) {
	views := []any{
		models.BucketAccessView{Bindings: []models.BucketAccessBinding{{Role: "secret-role", Members: []string{"secret-member"}, Condition: json.RawMessage(`{"secret":true}`)}}, ETag: "secret-etag", Warnings: []string{"secret-warning"}},
		models.BucketEncryptionView{Mode: models.BucketEncryptionModeSSEKMS, KMSKeyID: "secret-key"},
		models.BucketLifecycleView{Rules: json.RawMessage(`[{"ID":"secret-rule"}]`)},
		models.BucketProtectionView{Immutability: &models.BucketImmutabilityView{ETag: "secret-etag", LegalHoldTags: []string{"secret-tag"}}},
		models.BucketSharingView{PreauthenticatedRequests: []models.BucketPreauthenticatedRequestView{{ID: "secret-id", Name: "secret-name"}}},
	}
	for _, view := range views {
		summary := governanceAuditSummary(view, nil)
		data, err := json.Marshal(summary)
		if err != nil {
			t.Fatal(err)
		}
		if summary["known"] != true || strings.Contains(string(data), "secret") {
			t.Fatalf("unsafe summary: %s", data)
		}
		if failed := governanceAuditSummary(view, errors.New("secret-provider-response")); !reflect.DeepEqual(failed, map[string]any{"known": false}) {
			t.Fatalf("failed summary: %v", failed)
		}
	}
	if got := changedGovernanceSummaryFields(map[string]any{"mode": "a", "count": 1}, map[string]any{"mode": "b", "count": 1}); !reflect.DeepEqual(got, []string{"mode"}) {
		t.Fatalf("changed=%v", got)
	}
}

func TestGovernanceAuditReadsAfterCanceledWrite(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req := httptest.NewRequest("PUT", "/api/v1/buckets/demo/governance/encryption", nil).WithContext(ctx)
	reads := 0
	get := func(ctx context.Context, _ models.ProfileSecrets, _ string) (models.BucketEncryptionView, error) {
		reads++
		if ctx.Err() != nil {
			t.Fatalf("read context canceled: %v", ctx.Err())
		}
		deadline, ok := ctx.Deadline()
		if !ok || time.Until(deadline) > 10*time.Second {
			t.Fatal("read must have bounded deadline")
		}
		return models.BucketEncryptionView{}, nil
	}
	finish := beginGovernanceAudit(&server{}, req, models.ProfileSecrets{}, "demo", "encryption", get)
	cancel()
	finish(context.Canceled)
	if reads != 2 {
		t.Fatalf("reads=%d", reads)
	}
}
