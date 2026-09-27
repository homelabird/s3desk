package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"s3desk/internal/bucketgov"
	"s3desk/internal/models"
)

func TestBucketVersioningHTTPService_HandleGetBucketVersioning_ReturnsMissingProfile(t *testing.T) {
	t.Parallel()

	svc := newBucketVersioningHTTPService(&server{})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/governance/versioning", nil)
	req = withBucketParam(req, "demo")
	rec := httptest.NewRecorder()

	svc.handleGetBucketVersioning(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusBadRequest)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "missing_profile" {
		t.Fatalf("resp.Error.Code=%q, want missing_profile", resp.Error.Code)
	}
}

func TestBucketVersioningHTTPService_HandlePutBucketVersioning_ReturnsInvalidJSON(t *testing.T) {
	t.Parallel()

	svc := newBucketVersioningHTTPService(&server{bucketGov: bucketgov.NewService(bucketgov.NewDefaultRegistry())})
	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/versioning", bytes.NewBufferString("{"))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rec := httptest.NewRecorder()

	svc.handlePutBucketVersioning(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusBadRequest)
	}
	var resp models.ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != "invalid_json" {
		t.Fatalf("resp.Error.Code=%q, want invalid_json", resp.Error.Code)
	}
}

type versioningReadbackAdapter struct {
	fakeGovernanceAdapter
	reads, writes                 int
	beforeErr, afterErr, writeErr error
	afterStatus                   models.BucketVersioningStatus
	cancelWrite                   context.CancelFunc
	readContext                   context.Context
	readContextErr                error
}

func (a *versioningReadbackAdapter) GetVersioning(ctx context.Context, _ models.ProfileSecrets, _ string) (models.BucketVersioningView, error) {
	a.reads++
	if a.reads == 1 {
		return models.BucketVersioningView{Status: models.BucketVersioningStatusSuspended}, a.beforeErr
	}
	a.readContext = ctx
	a.readContextErr = ctx.Err()
	if err := ctx.Err(); err != nil {
		return models.BucketVersioningView{}, err
	}
	return models.BucketVersioningView{Status: a.afterStatus}, a.afterErr
}
func (a *versioningReadbackAdapter) PutVersioning(context.Context, models.ProfileSecrets, string, models.BucketVersioningPutRequest) error {
	a.writes++
	if a.cancelWrite != nil {
		a.cancelWrite()
	}
	return a.writeErr
}

func TestVersioningReadbackSurvivesCallerCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	adapter := &versioningReadbackAdapter{cancelWrite: cancel, writeErr: context.Canceled, afterStatus: models.BucketVersioningStatusEnabled}
	registry := bucketgov.NewRegistry()
	registry.Register(models.ProfileProviderAwsS3, adapter)
	svc := newBucketVersioningHTTPService(&server{bucketGov: bucketgov.NewService(registry)})
	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/versioning", bytes.NewBufferString(`{"status":"enabled"}`)).WithContext(ctx)
	req = withBucketParam(withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3}), "demo")
	_, _, _, _, err := svc.executePut(req)
	if !errors.Is(err, context.Canceled) || adapter.reads != 2 || adapter.writes != 1 || adapter.readContextErr != nil {
		t.Fatalf("err=%v reads=%d writes=%d", err, adapter.reads, adapter.writes)
	}
	deadline, ok := adapter.readContext.Deadline()
	if !ok || time.Until(deadline) <= 0 || time.Until(deadline) > 10*time.Second {
		t.Fatal("readback must have a bounded independent deadline")
	}
	if _, ok := profileFromContext(adapter.readContext); !ok {
		t.Fatal("readback lost authenticated context")
	}
}

func TestVersioningWriteRequiresObservedState(t *testing.T) {
	for _, tc := range []struct {
		name                          string
		beforeErr, afterErr, writeErr error
		after                         models.BucketVersioningStatus
		status, writes                int
	}{
		{name: "write denied despite matching read", writeErr: bucketgov.AccessDeniedError("demo", "PutBucketVersioning"), after: models.BucketVersioningStatusEnabled, status: 403, writes: 1},
		{name: "write and read fail", writeErr: bucketgov.AccessDeniedError("demo", "PutBucketVersioning"), afterErr: errors.New("read unavailable"), status: 403, writes: 1},
		{name: "matching", after: models.BucketVersioningStatusEnabled, status: 204, writes: 1},
		{name: "mismatch", after: models.BucketVersioningStatusSuspended, status: 502, writes: 1},
		{name: "readback failure", afterErr: errors.New("read unavailable"), status: 502, writes: 1},
		{name: "initial failure", beforeErr: errors.New("read unavailable"), status: 502},
	} {
		t.Run(tc.name, func(t *testing.T) {
			adapter := &versioningReadbackAdapter{beforeErr: tc.beforeErr, afterErr: tc.afterErr, afterStatus: tc.after, writeErr: tc.writeErr}
			registry := bucketgov.NewRegistry()
			registry.Register(models.ProfileProviderAwsS3, adapter)
			svc := newBucketVersioningHTTPService(&server{bucketGov: bucketgov.NewService(registry)})
			req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/versioning", bytes.NewBufferString(`{"status":"enabled"}`))
			req = withBucketParam(withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3}), "demo")
			rec := httptest.NewRecorder()
			svc.handlePutBucketVersioning(rec, req)
			wantReads := 2
			if tc.beforeErr != nil {
				wantReads = 1
			}
			if adapter.reads != wantReads {
				t.Fatalf("reads=%d want=%d", adapter.reads, wantReads)
			}
			if rec.Code != tc.status || adapter.writes != tc.writes {
				t.Fatalf("status=%d writes=%d body=%s", rec.Code, adapter.writes, rec.Body.String())
			}
		})
	}
}
