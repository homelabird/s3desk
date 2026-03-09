package api

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"s3desk/internal/bucketgov"
	"s3desk/internal/models"
)

type fakeGovernanceAdapter struct {
	governance      models.BucketGovernanceView
	access          models.BucketAccessView
	publicExposure  models.BucketPublicExposureView
	protection      models.BucketProtectionView
	versioning      models.BucketVersioningView
	encryption      models.BucketEncryptionView
	lifecycle       models.BucketLifecycleView
	putAccessReq    *models.BucketAccessPutRequest
	putReq          *models.BucketPublicExposurePutRequest
	putProtection   *models.BucketProtectionPutRequest
	putVersioning   *models.BucketVersioningPutRequest
	putEncryption   *models.BucketEncryptionPutRequest
	putLifecycle    *models.BucketLifecyclePutRequest
	putAccessErr    error
	putReqErr       error
	putProtectErr   error
	putVersionErr   error
	putEncryptErr   error
	putLifecycleErr error
	err             error
}

func (f *fakeGovernanceAdapter) GetGovernance(_ context.Context, _ models.ProfileSecrets, _ string) (models.BucketGovernanceView, error) {
	return f.governance, f.err
}

func (f *fakeGovernanceAdapter) GetAccess(context.Context, models.ProfileSecrets, string) (models.BucketAccessView, error) {
	return f.access, f.err
}

func (f *fakeGovernanceAdapter) PutAccess(_ context.Context, _ models.ProfileSecrets, _ string, req models.BucketAccessPutRequest) error {
	f.putAccessReq = &req
	if f.putAccessErr != nil {
		return f.putAccessErr
	}
	return f.err
}

func (f *fakeGovernanceAdapter) GetPublicExposure(context.Context, models.ProfileSecrets, string) (models.BucketPublicExposureView, error) {
	return f.publicExposure, f.err
}

func (f *fakeGovernanceAdapter) PutPublicExposure(_ context.Context, _ models.ProfileSecrets, _ string, req models.BucketPublicExposurePutRequest) error {
	f.putReq = &req
	if f.putReqErr != nil {
		return f.putReqErr
	}
	return f.err
}

func (f *fakeGovernanceAdapter) GetProtection(context.Context, models.ProfileSecrets, string) (models.BucketProtectionView, error) {
	return f.protection, f.err
}

func (f *fakeGovernanceAdapter) PutProtection(_ context.Context, _ models.ProfileSecrets, _ string, req models.BucketProtectionPutRequest) error {
	f.putProtection = &req
	if f.putProtectErr != nil {
		return f.putProtectErr
	}
	return f.err
}

func (f *fakeGovernanceAdapter) GetVersioning(context.Context, models.ProfileSecrets, string) (models.BucketVersioningView, error) {
	return f.versioning, f.err
}

func (f *fakeGovernanceAdapter) PutVersioning(_ context.Context, _ models.ProfileSecrets, _ string, req models.BucketVersioningPutRequest) error {
	f.putVersioning = &req
	if f.putVersionErr != nil {
		return f.putVersionErr
	}
	return f.err
}

func (f *fakeGovernanceAdapter) GetEncryption(context.Context, models.ProfileSecrets, string) (models.BucketEncryptionView, error) {
	return f.encryption, f.err
}

func (f *fakeGovernanceAdapter) PutEncryption(_ context.Context, _ models.ProfileSecrets, _ string, req models.BucketEncryptionPutRequest) error {
	f.putEncryption = &req
	if f.putEncryptErr != nil {
		return f.putEncryptErr
	}
	return f.err
}

func (f *fakeGovernanceAdapter) GetLifecycle(context.Context, models.ProfileSecrets, string) (models.BucketLifecycleView, error) {
	return f.lifecycle, f.err
}

func (f *fakeGovernanceAdapter) PutLifecycle(_ context.Context, _ models.ProfileSecrets, _ string, req models.BucketLifecyclePutRequest) error {
	f.putLifecycle = &req
	if f.putLifecycleErr != nil {
		return f.putLifecycleErr
	}
	return f.err
}

func newGovernanceTestService(provider models.ProfileProvider, adapter bucketgov.Adapter) *bucketgov.Service {
	registry := bucketgov.NewRegistry()
	registry.Register(provider, adapter)
	return bucketgov.NewService(registry)
}

func TestHandleGetBucketGovernanceAWS(t *testing.T) {
	t.Parallel()

	adapter := &fakeGovernanceAdapter{
		governance: models.BucketGovernanceView{
			Provider: models.ProfileProviderAwsS3,
			Bucket:   "demo",
			Capabilities: models.BucketGovernanceCapabilities{
				models.BucketGovernanceCapabilityAccessRawPolicy:   {Enabled: true},
				models.BucketGovernanceCapabilityPublicAccessBlock: {Enabled: true},
			},
			PublicExposure: &models.BucketPublicExposureView{
				Provider: models.ProfileProviderAwsS3,
				Bucket:   "demo",
				Mode:     models.BucketPublicExposureModePrivate,
			},
			Access: &models.BucketAccessView{
				Provider: models.ProfileProviderAwsS3,
				Bucket:   "demo",
				ObjectOwnership: &models.BucketObjectOwnershipView{
					Supported: true,
					Mode:      models.BucketObjectOwnershipBucketOwnerEnforced,
				},
				Advanced: &models.BucketAdvancedView{
					RawPolicySupported: true,
					RawPolicyEditable:  true,
				},
			},
			Versioning: &models.BucketVersioningView{
				Provider: models.ProfileProviderAwsS3,
				Bucket:   "demo",
				Status:   models.BucketVersioningStatusEnabled,
			},
			Encryption: &models.BucketEncryptionView{
				Provider: models.ProfileProviderAwsS3,
				Bucket:   "demo",
				Mode:     models.BucketEncryptionModeSSEKMS,
				KMSKeyID: "alias/demo",
			},
			Lifecycle: &models.BucketLifecycleView{
				Provider: models.ProfileProviderAwsS3,
				Bucket:   "demo",
				Rules:    []byte(`[{"id":"expire-logs","status":"enabled","prefix":"logs/"}]`),
			},
			Advanced: &models.BucketAdvancedView{
				RawPolicySupported: true,
				RawPolicyEditable:  true,
			},
		},
	}
	srv := &server{
		bucketGov: newGovernanceTestService(models.ProfileProviderAwsS3, adapter),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/governance", nil)
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handleGetBucketGovernance(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var view models.BucketGovernanceView
	decodeJSONResponse(t, res, &view)

	if view.Provider != models.ProfileProviderAwsS3 {
		t.Fatalf("provider=%q, want %q", view.Provider, models.ProfileProviderAwsS3)
	}
	if view.Bucket != "demo" {
		t.Fatalf("bucket=%q, want demo", view.Bucket)
	}
	if !view.Capabilities[models.BucketGovernanceCapabilityAccessRawPolicy].Enabled {
		t.Fatalf("capabilities=%+v, want raw policy enabled", view.Capabilities)
	}
	if view.Access == nil || view.Access.ObjectOwnership == nil || view.Access.ObjectOwnership.Mode != models.BucketObjectOwnershipBucketOwnerEnforced {
		t.Fatalf("access=%+v, want object ownership in summary", view.Access)
	}
	if view.PublicExposure == nil || view.PublicExposure.Mode != models.BucketPublicExposureModePrivate {
		t.Fatalf("publicExposure=%+v, want private", view.PublicExposure)
	}
	if view.Versioning == nil || view.Versioning.Status != models.BucketVersioningStatusEnabled {
		t.Fatalf("versioning=%+v, want enabled", view.Versioning)
	}
	if view.Encryption == nil || view.Encryption.Mode != models.BucketEncryptionModeSSEKMS || view.Encryption.KMSKeyID != "alias/demo" {
		t.Fatalf("encryption=%+v, want sse_kms alias/demo", view.Encryption)
	}
	if view.Lifecycle == nil || string(view.Lifecycle.Rules) == "" {
		t.Fatalf("lifecycle=%+v, want lifecycle rules in summary", view.Lifecycle)
	}
	if view.Advanced == nil || !view.Advanced.RawPolicySupported || !view.Advanced.RawPolicyEditable {
		t.Fatalf("advanced=%+v, want raw policy support", view.Advanced)
	}
}

func TestHandleGetBucketGovernanceRejectsUnsupportedProvider(t *testing.T) {
	t.Parallel()

	srv := &server{
		bucketGov: bucketgov.NewService(bucketgov.NewDefaultRegistry()),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/governance", nil)
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderS3Compatible})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handleGetBucketGovernance(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if errResp.Error.Code != "bucket_governance_unsupported" {
		t.Fatalf("code=%q, want bucket_governance_unsupported", errResp.Error.Code)
	}
	if got := errResp.Error.Details["provider"]; got != string(models.ProfileProviderS3Compatible) {
		t.Fatalf("provider=%v, want %q", got, models.ProfileProviderS3Compatible)
	}
}

func TestHandleGetBucketPublicExposureAWS(t *testing.T) {
	t.Parallel()

	adapter := &fakeGovernanceAdapter{
		publicExposure: models.BucketPublicExposureView{
			Provider: models.ProfileProviderAwsS3,
			Bucket:   "demo",
			Mode:     models.BucketPublicExposureModePrivate,
			BlockPublicAccess: &models.BucketBlockPublicAccess{
				BlockPublicAcls:       true,
				IgnorePublicAcls:      true,
				BlockPublicPolicy:     true,
				RestrictPublicBuckets: true,
			},
		},
	}
	srv := &server{
		bucketGov: newGovernanceTestService(models.ProfileProviderAwsS3, adapter),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/governance/public-exposure", nil)
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handleGetBucketPublicExposure(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var view models.BucketPublicExposureView
	decodeJSONResponse(t, res, &view)
	if view.BlockPublicAccess == nil || !view.BlockPublicAccess.BlockPublicAcls {
		t.Fatalf("blockPublicAccess=%+v, want populated BPA", view.BlockPublicAccess)
	}
}

func TestHandleGetBucketAccessAWS(t *testing.T) {
	t.Parallel()

	adapter := &fakeGovernanceAdapter{
		access: models.BucketAccessView{
			Provider: models.ProfileProviderAwsS3,
			Bucket:   "demo",
			ObjectOwnership: &models.BucketObjectOwnershipView{
				Supported: true,
				Mode:      models.BucketObjectOwnershipBucketOwnerPreferred,
			},
			Advanced: &models.BucketAdvancedView{
				RawPolicySupported: true,
				RawPolicyEditable:  true,
			},
		},
	}
	srv := &server{
		bucketGov: newGovernanceTestService(models.ProfileProviderAwsS3, adapter),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/governance/access", nil)
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handleGetBucketAccess(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var view models.BucketAccessView
	decodeJSONResponse(t, res, &view)
	if view.ObjectOwnership == nil || view.ObjectOwnership.Mode != models.BucketObjectOwnershipBucketOwnerPreferred {
		t.Fatalf("objectOwnership=%+v, want bucket_owner_preferred", view.ObjectOwnership)
	}
	if view.Advanced == nil || !view.Advanced.RawPolicySupported {
		t.Fatalf("advanced=%+v, want raw policy support", view.Advanced)
	}
}

func TestHandlePutBucketAccessAWS(t *testing.T) {
	t.Parallel()

	adapter := &fakeGovernanceAdapter{}
	srv := &server{
		bucketGov: newGovernanceTestService(models.ProfileProviderAwsS3, adapter),
	}

	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/access", bytes.NewReader([]byte(`{
		"objectOwnership": "object_writer"
	}`)))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handlePutBucketAccess(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusNoContent)
	}
	if adapter.putAccessReq == nil || adapter.putAccessReq.ObjectOwnership == nil {
		t.Fatal("expected access request to reach adapter")
	}
	if *adapter.putAccessReq.ObjectOwnership != models.BucketObjectOwnershipObjectWriter {
		t.Fatalf("objectOwnership=%q, want %q", *adapter.putAccessReq.ObjectOwnership, models.BucketObjectOwnershipObjectWriter)
	}
}

func TestHandlePutBucketPublicExposureAWS(t *testing.T) {
	t.Parallel()

	adapter := &fakeGovernanceAdapter{}
	srv := &server{
		bucketGov: newGovernanceTestService(models.ProfileProviderAwsS3, adapter),
	}

	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/public-exposure", bytes.NewReader([]byte(`{
		"blockPublicAccess": {
			"blockPublicAcls": true,
			"ignorePublicAcls": true,
			"blockPublicPolicy": false,
			"restrictPublicBuckets": true
		}
	}`)))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handlePutBucketPublicExposure(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusNoContent)
	}
	if adapter.putReq == nil || adapter.putReq.BlockPublicAccess == nil {
		t.Fatal("expected public exposure request to reach adapter")
	}
	if adapter.putReq.BlockPublicAccess.BlockPublicPolicy {
		t.Fatalf("request=%+v, want blockPublicPolicy=false", adapter.putReq.BlockPublicAccess)
	}
}

func TestHandleGetBucketProtectionGCS(t *testing.T) {
	t.Parallel()

	days := 7
	uniformAccess := true
	adapter := &fakeGovernanceAdapter{
		protection: models.BucketProtectionView{
			Provider:      models.ProfileProviderGcpGcs,
			Bucket:        "demo",
			UniformAccess: &uniformAccess,
			Retention: &models.BucketRetentionView{
				Enabled: true,
				Days:    &days,
			},
		},
	}
	srv := &server{
		bucketGov: newGovernanceTestService(models.ProfileProviderGcpGcs, adapter),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/governance/protection", nil)
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderGcpGcs})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handleGetBucketProtection(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var view models.BucketProtectionView
	decodeJSONResponse(t, res, &view)
	if view.UniformAccess == nil || !*view.UniformAccess {
		t.Fatalf("uniformAccess=%v, want true", view.UniformAccess)
	}
	if view.Retention == nil || view.Retention.Days == nil || *view.Retention.Days != 7 {
		t.Fatalf("retention=%+v, want 7 days", view.Retention)
	}
}

func TestHandlePutBucketProtectionGCS(t *testing.T) {
	t.Parallel()

	adapter := &fakeGovernanceAdapter{}
	srv := &server{
		bucketGov: newGovernanceTestService(models.ProfileProviderGcpGcs, adapter),
	}

	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/protection", bytes.NewReader([]byte(`{
		"uniformAccess": true,
		"retention": {"enabled": true, "days": 14}
	}`)))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderGcpGcs})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handlePutBucketProtection(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusNoContent)
	}
	if adapter.putProtection == nil {
		t.Fatal("expected protection request to reach adapter")
	}
	if adapter.putProtection.UniformAccess == nil || !*adapter.putProtection.UniformAccess {
		t.Fatalf("uniformAccess=%v, want true", adapter.putProtection.UniformAccess)
	}
	if adapter.putProtection.Retention == nil || adapter.putProtection.Retention.Days == nil || *adapter.putProtection.Retention.Days != 14 {
		t.Fatalf("retention=%+v, want 14 days", adapter.putProtection.Retention)
	}
}

func TestHandleGetBucketVersioningAWS(t *testing.T) {
	t.Parallel()

	adapter := &fakeGovernanceAdapter{
		versioning: models.BucketVersioningView{
			Provider: models.ProfileProviderAwsS3,
			Bucket:   "demo",
			Status:   models.BucketVersioningStatusSuspended,
		},
	}
	srv := &server{
		bucketGov: newGovernanceTestService(models.ProfileProviderAwsS3, adapter),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/governance/versioning", nil)
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handleGetBucketVersioning(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var view models.BucketVersioningView
	decodeJSONResponse(t, res, &view)
	if view.Status != models.BucketVersioningStatusSuspended {
		t.Fatalf("status=%q, want %q", view.Status, models.BucketVersioningStatusSuspended)
	}
}

func TestHandlePutBucketVersioningAWS(t *testing.T) {
	t.Parallel()

	adapter := &fakeGovernanceAdapter{}
	srv := &server{
		bucketGov: newGovernanceTestService(models.ProfileProviderAwsS3, adapter),
	}

	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/versioning", bytes.NewReader([]byte(`{
		"status": "enabled"
	}`)))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handlePutBucketVersioning(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusNoContent)
	}
	if adapter.putVersioning == nil {
		t.Fatal("expected versioning request to reach adapter")
	}
	if adapter.putVersioning.Status != models.BucketVersioningStatusEnabled {
		t.Fatalf("status=%q, want %q", adapter.putVersioning.Status, models.BucketVersioningStatusEnabled)
	}
}

func TestHandleGetBucketEncryptionAWS(t *testing.T) {
	t.Parallel()

	adapter := &fakeGovernanceAdapter{
		encryption: models.BucketEncryptionView{
			Provider: models.ProfileProviderAwsS3,
			Bucket:   "demo",
			Mode:     models.BucketEncryptionModeSSES3,
		},
	}
	srv := &server{
		bucketGov: newGovernanceTestService(models.ProfileProviderAwsS3, adapter),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/governance/encryption", nil)
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handleGetBucketEncryption(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var view models.BucketEncryptionView
	decodeJSONResponse(t, res, &view)
	if view.Mode != models.BucketEncryptionModeSSES3 {
		t.Fatalf("mode=%q, want %q", view.Mode, models.BucketEncryptionModeSSES3)
	}
}

func TestHandlePutBucketEncryptionAWS(t *testing.T) {
	t.Parallel()

	adapter := &fakeGovernanceAdapter{}
	srv := &server{
		bucketGov: newGovernanceTestService(models.ProfileProviderAwsS3, adapter),
	}

	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/encryption", bytes.NewReader([]byte(`{
		"mode": "sse_kms",
		"kmsKeyId": "alias/demo"
	}`)))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handlePutBucketEncryption(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusNoContent)
	}
	if adapter.putEncryption == nil {
		t.Fatal("expected encryption request to reach adapter")
	}
	if adapter.putEncryption.Mode != models.BucketEncryptionModeSSEKMS {
		t.Fatalf("mode=%q, want %q", adapter.putEncryption.Mode, models.BucketEncryptionModeSSEKMS)
	}
	if adapter.putEncryption.KMSKeyID != "alias/demo" {
		t.Fatalf("kmsKeyId=%q, want alias/demo", adapter.putEncryption.KMSKeyID)
	}
}

func TestHandleGetBucketLifecycleAWS(t *testing.T) {
	t.Parallel()

	adapter := &fakeGovernanceAdapter{
		lifecycle: models.BucketLifecycleView{
			Provider: models.ProfileProviderAwsS3,
			Bucket:   "demo",
			Rules:    []byte(`[{"id":"expire-logs","status":"enabled","prefix":"logs/"}]`),
		},
	}
	srv := &server{
		bucketGov: newGovernanceTestService(models.ProfileProviderAwsS3, adapter),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/governance/lifecycle", nil)
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handleGetBucketLifecycle(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var view models.BucketLifecycleView
	decodeJSONResponse(t, res, &view)
	if string(view.Rules) != `[{"id":"expire-logs","status":"enabled","prefix":"logs/"}]` {
		t.Fatalf("rules=%s, want lifecycle rules", string(view.Rules))
	}
}

func TestHandlePutBucketLifecycleAWS(t *testing.T) {
	t.Parallel()

	adapter := &fakeGovernanceAdapter{}
	srv := &server{
		bucketGov: newGovernanceTestService(models.ProfileProviderAwsS3, adapter),
	}

	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/lifecycle", bytes.NewReader([]byte(`{
		"rules": [{"id":"expire-logs","status":"enabled","prefix":"logs/","expiration":{"days":30}}]
	}`)))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handlePutBucketLifecycle(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusNoContent)
	}
	if adapter.putLifecycle == nil || string(adapter.putLifecycle.Rules) == "" {
		t.Fatal("expected lifecycle request to reach adapter")
	}
}

func TestHandlePutBucketAccessRejectsUnsupportedBindingsForAWS(t *testing.T) {
	t.Parallel()

	srv := &server{
		bucketGov: bucketgov.NewService(bucketgov.NewDefaultRegistry()),
	}

	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/access", bytes.NewReader([]byte(`{
		"bindings": [{"role":"roles/storage.objectViewer","members":["allUsers"]}]
	}`)))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handlePutBucketAccess(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if errResp.Error.Code != "invalid_request" {
		t.Fatalf("code=%q, want invalid_request", errResp.Error.Code)
	}
	if got := errResp.Error.Details["field"]; got != "bindings" {
		t.Fatalf("field=%v, want bindings", got)
	}
	if got := errResp.Error.Details["capability"]; got != string(models.BucketGovernanceCapabilityAccessBindings) {
		t.Fatalf("capability=%v, want %q", got, models.BucketGovernanceCapabilityAccessBindings)
	}
	if got := errResp.Error.Details["reason"]; got != "Access bindings are supported only by gcp_gcs." {
		t.Fatalf("reason=%v, want gcp bindings reason", got)
	}
}

func TestHandlePutBucketPublicExposureRejectsUnsupportedVisibilityForAWS(t *testing.T) {
	t.Parallel()

	srv := &server{
		bucketGov: bucketgov.NewService(bucketgov.NewDefaultRegistry()),
	}

	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/public-exposure", bytes.NewReader([]byte(`{
		"visibility": "container"
	}`)))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handlePutBucketPublicExposure(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if got := errResp.Error.Details["field"]; got != "visibility" {
		t.Fatalf("field=%v, want visibility", got)
	}
	if got := errResp.Error.Details["capability"]; got != string(models.BucketGovernanceCapabilityAccessPublicToggle) {
		t.Fatalf("capability=%v, want %q", got, models.BucketGovernanceCapabilityAccessPublicToggle)
	}
}

func TestHandlePutBucketVersioningRejectsDisabledStatus(t *testing.T) {
	t.Parallel()

	srv := &server{
		bucketGov: bucketgov.NewService(bucketgov.NewDefaultRegistry()),
	}

	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/versioning", bytes.NewReader([]byte(`{
		"status": "disabled"
	}`)))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handlePutBucketVersioning(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if got := errResp.Error.Details["field"]; got != "status" {
		t.Fatalf("field=%v, want status", got)
	}
}

func TestHandlePutBucketEncryptionRejectsKMSKeyWithSSES3(t *testing.T) {
	t.Parallel()

	srv := &server{
		bucketGov: bucketgov.NewService(bucketgov.NewDefaultRegistry()),
	}

	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/encryption", bytes.NewReader([]byte(`{
		"mode": "sse_s3",
		"kmsKeyId": "alias/demo"
	}`)))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handlePutBucketEncryption(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if got := errResp.Error.Details["field"]; got != "kmsKeyId" {
		t.Fatalf("field=%v, want kmsKeyId", got)
	}
}

func TestHandleGetBucketVersioningUnsupportedProviderIncludesReason(t *testing.T) {
	t.Parallel()

	srv := &server{
		bucketGov: bucketgov.NewService(bucketgov.NewDefaultRegistry()),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/governance/versioning", nil)
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderS3Compatible})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handleGetBucketVersioning(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if errResp.Error.Code != "bucket_versioning_unsupported" {
		t.Fatalf("code=%q, want bucket_versioning_unsupported", errResp.Error.Code)
	}
	if got := errResp.Error.Details["capability"]; got != string(models.BucketGovernanceCapabilityVersioning) {
		t.Fatalf("capability=%v, want %q", got, models.BucketGovernanceCapabilityVersioning)
	}
	if got := errResp.Error.Details["reason"]; got == nil || got == "" {
		t.Fatalf("reason=%v, want populated reason", got)
	}
}

func TestHandlePutBucketLifecycleRejectsInvalidStatus(t *testing.T) {
	t.Parallel()

	srv := &server{
		bucketGov: bucketgov.NewService(bucketgov.NewDefaultRegistry()),
	}

	req := httptest.NewRequest(http.MethodPut, "/api/v1/buckets/demo/governance/lifecycle", bytes.NewReader([]byte(`{
		"rules": [{"id":"expire-logs","status":"paused","prefix":"logs/"}]
	}`)))
	req.Header.Set("Content-Type", "application/json")
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAwsS3})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handlePutBucketLifecycle(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if got := errResp.Error.Details["field"]; got != "rules[0].status" {
		t.Fatalf("field=%v, want rules[0].status", got)
	}
}

func TestHandleGetBucketLifecycleUnsupportedProviderIncludesReason(t *testing.T) {
	t.Parallel()

	srv := &server{
		bucketGov: bucketgov.NewService(bucketgov.NewDefaultRegistry()),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets/demo/governance/lifecycle", nil)
	req = withProfileSecrets(req, models.ProfileSecrets{Provider: models.ProfileProviderAzureBlob})
	req = withBucketParam(req, "demo")
	rr := httptest.NewRecorder()

	srv.handleGetBucketLifecycle(rr, req)

	res := rr.Result()
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if errResp.Error.Code != "bucket_lifecycle_unsupported" {
		t.Fatalf("code=%q, want bucket_lifecycle_unsupported", errResp.Error.Code)
	}
	if got := errResp.Error.Details["capability"]; got != string(models.BucketGovernanceCapabilityLifecycle) {
		t.Fatalf("capability=%v, want %q", got, models.BucketGovernanceCapabilityLifecycle)
	}
	if got := errResp.Error.Details["reason"]; got == nil || got == "" {
		t.Fatalf("reason=%v, want populated reason", got)
	}
}
