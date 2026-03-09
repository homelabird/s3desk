package bucketgov

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"s3desk/internal/models"
)

func TestApplyCreateDefaultsAWSLiveRoundTrip(t *testing.T) {
	t.Parallel()

	fakeS3 := &fakeAWSGovernanceServer{
		t: t,
		publicAccessBlock: fakePublicAccessBlockState{
			BlockPublicAcls:       false,
			IgnorePublicAcls:      false,
			BlockPublicPolicy:     false,
			RestrictPublicBuckets: false,
		},
	}
	srv := httptest.NewServer(fakeS3)
	defer srv.Close()

	service := NewService(NewDefaultRegistry())
	profile := models.ProfileSecrets{
		Provider:              models.ProfileProviderAwsS3,
		Endpoint:              srv.URL,
		Region:                "us-east-1",
		AccessKeyID:           "access",
		SecretAccessKey:       "secret",
		ForcePathStyle:        true,
		TLSInsecureSkipVerify: false,
	}

	defaults := &models.BucketCreateDefaults{
		PublicExposure: &models.BucketPublicExposurePutRequest{
			BlockPublicAccess: &models.BucketBlockPublicAccess{
				BlockPublicAcls:       true,
				IgnorePublicAcls:      true,
				BlockPublicPolicy:     true,
				RestrictPublicBuckets: true,
			},
		},
		Access: &models.BucketAccessPutRequest{
			ObjectOwnership: bucketObjectOwnershipPtr(models.BucketObjectOwnershipBucketOwnerPreferred),
		},
		Versioning: &models.BucketVersioningPutRequest{
			Status: models.BucketVersioningStatusEnabled,
		},
		Encryption: &models.BucketEncryptionPutRequest{
			Mode:     models.BucketEncryptionModeSSEKMS,
			KMSKeyID: "alias/demo",
		},
	}

	if err := ValidateCreateDefaults(models.ProfileProviderAwsS3, defaults); err != nil {
		t.Fatalf("ValidateCreateDefaults err=%v", err)
	}
	if err := ApplyCreateDefaults(context.Background(), service, profile, "demo", defaults); err != nil {
		t.Fatalf("ApplyCreateDefaults err=%v", err)
	}

	view, err := service.GetGovernance(context.Background(), profile, "demo")
	if err != nil {
		t.Fatalf("GetGovernance err=%v", err)
	}
	if view.PublicExposure == nil || view.PublicExposure.Mode != models.BucketPublicExposureModePrivate {
		t.Fatalf("publicExposure=%+v, want private", view.PublicExposure)
	}
	if view.Access == nil || view.Access.ObjectOwnership == nil || view.Access.ObjectOwnership.Mode != models.BucketObjectOwnershipBucketOwnerPreferred {
		t.Fatalf("access=%+v, want bucket_owner_preferred", view.Access)
	}
	if view.Versioning == nil || view.Versioning.Status != models.BucketVersioningStatusEnabled {
		t.Fatalf("versioning=%+v, want enabled", view.Versioning)
	}
	if view.Encryption == nil || view.Encryption.Mode != models.BucketEncryptionModeSSEKMS || view.Encryption.KMSKeyID != "alias/demo" {
		t.Fatalf("encryption=%+v, want sse_kms alias/demo", view.Encryption)
	}

	fakeS3.assertSawQuery(t, "publicAccessBlock")
	fakeS3.assertSawQuery(t, "ownershipControls")
	fakeS3.assertSawQuery(t, "versioning")
	fakeS3.assertSawQuery(t, "encryption")
}

func TestApplyCreateDefaultsGCSLiveRoundTrip(t *testing.T) {
	t.Parallel()

	fakeGCS := &fakeGCSIAMServer{
		t: t,
		policy: gcsIAMPolicy{
			Version: 3,
			ETag:    "etag-current",
			Bindings: []gcsIAMBinding{
				{
					Role:    "roles/storage.objectViewer",
					Members: []string{"allUsers"},
				},
			},
		},
	}
	srv := httptest.NewServer(fakeGCS)
	defer srv.Close()

	service := NewService(NewDefaultRegistry())
	defaults := &models.BucketCreateDefaults{
		PublicExposure: &models.BucketPublicExposurePutRequest{
			Mode: models.BucketPublicExposureModePrivate,
		},
		Access: &models.BucketAccessPutRequest{
			Bindings: []models.BucketAccessBinding{
				{
					Role:      "roles/storage.objectAdmin",
					Members:   []string{"user:alice@example.com"},
					Condition: []byte(`{"title":"if-approved"}`),
				},
			},
		},
	}
	profile := models.ProfileSecrets{
		Provider:         models.ProfileProviderGcpGcs,
		GcpEndpoint:      srv.URL,
		GcpAnonymous:     true,
		GcpProjectNumber: "123456789",
	}

	if err := ValidateCreateDefaults(models.ProfileProviderGcpGcs, defaults); err != nil {
		t.Fatalf("ValidateCreateDefaults err=%v", err)
	}
	if err := ApplyCreateDefaults(context.Background(), service, profile, "demo", defaults); err != nil {
		t.Fatalf("ApplyCreateDefaults err=%v", err)
	}

	view, err := service.GetGovernance(context.Background(), profile, "demo")
	if err != nil {
		t.Fatalf("GetGovernance err=%v", err)
	}
	if view.PublicExposure == nil || view.PublicExposure.Mode != models.BucketPublicExposureModePrivate {
		t.Fatalf("publicExposure=%+v, want private", view.PublicExposure)
	}
	if view.Access == nil {
		t.Fatal("access=nil, want bindings")
	}
	if view.Access.ETag != "etag-current" {
		t.Fatalf("etag=%q, want etag-current", view.Access.ETag)
	}
	if len(view.Access.Bindings) != 1 {
		t.Fatalf("bindings=%d, want 1", len(view.Access.Bindings))
	}
	if view.Access.Bindings[0].Role != "roles/storage.objectAdmin" {
		t.Fatalf("role=%q, want roles/storage.objectAdmin", view.Access.Bindings[0].Role)
	}
	if got := view.Access.Bindings[0].Members; len(got) != 1 || got[0] != "user:alice@example.com" {
		t.Fatalf("members=%v, want user:alice@example.com", got)
	}
	if string(view.Access.Bindings[0].Condition) != `{"title":"if-approved"}` {
		t.Fatalf("condition=%s, want preserved condition", string(view.Access.Bindings[0].Condition))
	}
	if fakeGCS.putCount != 2 {
		t.Fatalf("putCount=%d, want 2", fakeGCS.putCount)
	}
}

func TestApplyCreateDefaultsAzureLiveRoundTrip(t *testing.T) {
	t.Parallel()

	fakeAzure := &fakeAzureACLServer{t: t}
	srv := httptest.NewServer(fakeAzure)
	defer srv.Close()

	service := NewService(NewDefaultRegistry())
	defaults := &models.BucketCreateDefaults{
		PublicExposure: &models.BucketPublicExposurePutRequest{
			Visibility: "blob",
		},
		Access: &models.BucketAccessPutRequest{
			StoredAccessPolicies: []models.BucketStoredAccessPolicy{
				{
					ID:         "reader",
					Start:      "2026-01-01T00:00:00Z",
					Expiry:     "2026-01-02T00:00:00Z",
					Permission: "rl",
				},
			},
		},
	}
	profile := models.ProfileSecrets{
		Provider:         models.ProfileProviderAzureBlob,
		AzureAccountName: "acct",
		AzureAccountKey:  base64.StdEncoding.EncodeToString([]byte("secret-key")),
		AzureEndpoint:    srv.URL,
	}

	if err := ValidateCreateDefaults(models.ProfileProviderAzureBlob, defaults); err != nil {
		t.Fatalf("ValidateCreateDefaults err=%v", err)
	}
	if err := ApplyCreateDefaults(context.Background(), service, profile, "demo", defaults); err != nil {
		t.Fatalf("ApplyCreateDefaults err=%v", err)
	}

	view, err := service.GetGovernance(context.Background(), profile, "demo")
	if err != nil {
		t.Fatalf("GetGovernance err=%v", err)
	}
	if view.PublicExposure == nil || view.PublicExposure.Mode != models.BucketPublicExposureModeBlob || view.PublicExposure.Visibility != "blob" {
		t.Fatalf("publicExposure=%+v, want blob visibility", view.PublicExposure)
	}
	if view.Access == nil {
		t.Fatal("access=nil, want stored access policies")
	}
	if len(view.Access.StoredAccessPolicies) != 1 {
		t.Fatalf("storedAccessPolicies=%d, want 1", len(view.Access.StoredAccessPolicies))
	}
	policy := view.Access.StoredAccessPolicies[0]
	if policy.ID != "reader" || policy.Permission != "rl" {
		t.Fatalf("storedAccessPolicy=%+v, want reader rl", policy)
	}
	if fakeAzure.putCount != 2 {
		t.Fatalf("putCount=%d, want 2", fakeAzure.putCount)
	}
}

type fakeGCSIAMServer struct {
	t testing.TB

	mu       sync.Mutex
	policy   gcsIAMPolicy
	metadata gcsBucketMetadata
	putCount int
}

func (s *fakeGCSIAMServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/storage/v1/b/demo/iam":
		switch r.Method {
		case http.MethodGet:
			s.mu.Lock()
			policy := s.policy
			s.mu.Unlock()
			if policy.Version == 0 {
				policy.Version = 1
			}
			writeJSONResponse(w, http.StatusOK, policy)
		case http.MethodPut:
			var next gcsIAMPolicy
			if err := json.NewDecoder(r.Body).Decode(&next); err != nil {
				s.t.Fatalf("decode GCS policy: %v", err)
			}
			s.mu.Lock()
			s.policy = next
			s.putCount++
			s.mu.Unlock()
			writeJSONResponse(w, http.StatusOK, next)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	case "/storage/v1/b/demo":
		switch r.Method {
		case http.MethodGet:
			s.mu.Lock()
			metadata := s.metadata
			s.mu.Unlock()
			writeJSONResponse(w, http.StatusOK, metadata)
		case http.MethodPatch:
			var next gcsBucketMetadata
			if err := json.NewDecoder(r.Body).Decode(&next); err != nil {
				s.t.Fatalf("decode GCS metadata: %v", err)
			}
			s.mu.Lock()
			mergeFakeGCSMetadata(&s.metadata, next)
			s.mu.Unlock()
			writeJSONResponse(w, http.StatusOK, s.metadata)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	default:
		http.NotFound(w, r)
	}
}

func mergeFakeGCSMetadata(dst *gcsBucketMetadata, patch gcsBucketMetadata) {
	if dst == nil {
		return
	}
	if patch.Versioning.Enabled {
		dst.Versioning.Enabled = true
	}
	if patch.IAMConfiguration.PublicAccessPrevention != "" {
		dst.IAMConfiguration.PublicAccessPrevention = patch.IAMConfiguration.PublicAccessPrevention
	}
	if patch.IAMConfiguration.UniformBucketLevelAccess.Enabled {
		dst.IAMConfiguration.UniformBucketLevelAccess.Enabled = true
	}
	if patch.RetentionPolicy != nil {
		dst.RetentionPolicy = patch.RetentionPolicy
	}
}

type fakeAzureACLServer struct {
	t testing.TB

	mu                   sync.Mutex
	isVersioningEnabled  bool
	deleteRetentionDays  *int
	publicAccess         string
	storedAccessPolicies []models.BucketStoredAccessPolicy
	putCount             int
}

func (s *fakeAzureACLServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.URL.Path == "/" && r.URL.Query().Get("restype") == "service" && r.URL.Query().Get("comp") == "properties":
		s.handleAzureServiceProperties(w, r)
	case r.URL.Path == "/demo" && r.URL.Query().Get("restype") == "container" && r.URL.Query().Get("comp") == "acl":
		s.handleAzureContainerACL(w, r)
	case r.URL.Path == "/demo" && r.URL.Query().Get("restype") == "container":
		s.handleAzureContainerProperties(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (s *fakeAzureACLServer) handleAzureServiceProperties(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.mu.Lock()
		versioning := s.isVersioningEnabled
		retentionDays := s.deleteRetentionDays
		s.mu.Unlock()
		w.Header().Set("Content-Type", "application/xml")
		w.WriteHeader(http.StatusOK)
		payload := fakeAzureServicePropertiesEnvelope{
			IsVersioningEnabled: versioning,
		}
		if retentionDays != nil {
			payload.DeleteRetentionPolicy = &fakeAzureDeleteRetentionPolicy{
				Enabled: true,
				Days:    retentionDays,
			}
		}
		body, err := xml.Marshal(payload)
		if err != nil {
			s.t.Fatalf("marshal Azure service properties: %v", err)
		}
		_, _ = w.Write(body)
	case http.MethodPut:
		var payload fakeAzureServicePropertiesEnvelope
		body, err := io.ReadAll(r.Body)
		if err != nil {
			s.t.Fatalf("read Azure service properties request: %v", err)
		}
		trimmed := strings.TrimSpace(string(body))
		trimmed = strings.TrimPrefix(trimmed, `<?xml version="1.0" encoding="utf-8"?>`)
		if strings.TrimSpace(trimmed) != "" {
			if err := xml.Unmarshal([]byte(trimmed), &payload); err != nil {
				s.t.Fatalf("decode Azure service properties request: %v", err)
			}
		}
		s.mu.Lock()
		s.isVersioningEnabled = payload.IsVersioningEnabled
		if payload.DeleteRetentionPolicy != nil && payload.DeleteRetentionPolicy.Enabled {
			s.deleteRetentionDays = payload.DeleteRetentionPolicy.Days
		} else {
			s.deleteRetentionDays = nil
		}
		s.mu.Unlock()
		w.WriteHeader(http.StatusAccepted)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *fakeAzureACLServer) handleAzureContainerACL(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.mu.Lock()
		publicAccess := strings.TrimSpace(s.publicAccess)
		policies := append([]models.BucketStoredAccessPolicy(nil), s.storedAccessPolicies...)
		s.mu.Unlock()

		if publicAccess != "" && publicAccess != "private" {
			w.Header().Set("x-ms-blob-public-access", publicAccess)
		}
		w.Header().Set("Content-Type", "application/xml")
		w.WriteHeader(http.StatusOK)
		if len(policies) == 0 {
			return
		}
		body, err := xml.Marshal(fakeAzureSignedIdentifiersEnvelope{
			SignedIdentifiers: toFakeAzureSignedIdentifiers(policies),
		})
		if err != nil {
			s.t.Fatalf("marshal Azure ACL response: %v", err)
		}
		_, _ = w.Write(body)
	case http.MethodPut:
		publicAccess := strings.ToLower(strings.TrimSpace(r.Header.Get("x-ms-blob-public-access")))
		if publicAccess == "" {
			publicAccess = "private"
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			s.t.Fatalf("read Azure ACL request: %v", err)
		}
		policies := []models.BucketStoredAccessPolicy{}
		if len(strings.TrimSpace(string(body))) > 0 {
			var payload fakeAzureSignedIdentifiersEnvelope
			if err := xml.Unmarshal(body, &payload); err != nil {
				s.t.Fatalf("decode Azure ACL request: %v", err)
			}
			policies = fromFakeAzureSignedIdentifiers(payload.SignedIdentifiers)
		}

		s.mu.Lock()
		s.publicAccess = publicAccess
		s.storedAccessPolicies = policies
		s.putCount++
		s.mu.Unlock()
		w.WriteHeader(http.StatusOK)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *fakeAzureACLServer) handleAzureContainerProperties(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	w.WriteHeader(http.StatusOK)
}

type fakeAzureSignedIdentifiersEnvelope struct {
	XMLName           xml.Name                    `xml:"SignedIdentifiers"`
	SignedIdentifiers []fakeAzureSignedIdentifier `xml:"SignedIdentifier"`
}

type fakeAzureServicePropertiesEnvelope struct {
	XMLName               xml.Name                        `xml:"StorageServiceProperties"`
	DeleteRetentionPolicy *fakeAzureDeleteRetentionPolicy `xml:"DeleteRetentionPolicy,omitempty"`
	IsVersioningEnabled   bool                            `xml:"IsVersioningEnabled,omitempty"`
}

type fakeAzureDeleteRetentionPolicy struct {
	Enabled bool `xml:"Enabled"`
	Days    *int `xml:"Days,omitempty"`
}

type fakeAzureSignedIdentifier struct {
	ID           string                `xml:"Id"`
	AccessPolicy fakeAzureAccessPolicy `xml:"AccessPolicy"`
}

type fakeAzureAccessPolicy struct {
	Start      string `xml:"Start,omitempty"`
	Expiry     string `xml:"Expiry,omitempty"`
	Permission string `xml:"Permission,omitempty"`
}

func toFakeAzureSignedIdentifiers(policies []models.BucketStoredAccessPolicy) []fakeAzureSignedIdentifier {
	out := make([]fakeAzureSignedIdentifier, 0, len(policies))
	for _, policy := range policies {
		if strings.TrimSpace(policy.ID) == "" {
			continue
		}
		out = append(out, fakeAzureSignedIdentifier{
			ID: strings.TrimSpace(policy.ID),
			AccessPolicy: fakeAzureAccessPolicy{
				Start:      strings.TrimSpace(policy.Start),
				Expiry:     strings.TrimSpace(policy.Expiry),
				Permission: strings.TrimSpace(policy.Permission),
			},
		})
	}
	return out
}

func fromFakeAzureSignedIdentifiers(items []fakeAzureSignedIdentifier) []models.BucketStoredAccessPolicy {
	out := make([]models.BucketStoredAccessPolicy, 0, len(items))
	for _, item := range items {
		id := strings.TrimSpace(item.ID)
		if id == "" {
			continue
		}
		out = append(out, models.BucketStoredAccessPolicy{
			ID:         id,
			Start:      strings.TrimSpace(item.AccessPolicy.Start),
			Expiry:     strings.TrimSpace(item.AccessPolicy.Expiry),
			Permission: strings.TrimSpace(item.AccessPolicy.Permission),
		})
	}
	return out
}

func writeJSONResponse(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		panic(err)
	}
}
