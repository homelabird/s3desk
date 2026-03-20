package bucketgov

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"s3desk/internal/models"
)

func TestAWSAdapterLiveMatrix(t *testing.T) {
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

	adapter := NewAWSAdapter().(*awsAdapter)
	secrets := models.ProfileSecrets{
		Provider:              models.ProfileProviderAwsS3,
		Endpoint:              srv.URL,
		Region:                "us-east-1",
		AccessKeyID:           "access",
		SecretAccessKey:       "secret",
		ForcePathStyle:        true,
		TLSInsecureSkipVerify: false,
	}

	publicBefore, err := adapter.GetPublicExposure(context.Background(), secrets, "demo")
	if err != nil {
		t.Fatalf("GetPublicExposure err=%v", err)
	}
	if publicBefore.Mode != models.BucketPublicExposureModePublic {
		t.Fatalf("public mode=%q, want public", publicBefore.Mode)
	}

	accessBefore, err := adapter.GetAccess(context.Background(), secrets, "demo")
	if err != nil {
		t.Fatalf("GetAccess err=%v", err)
	}
	if accessBefore.ObjectOwnership == nil || accessBefore.ObjectOwnership.Mode != models.BucketObjectOwnershipBucketOwnerEnforced {
		t.Fatalf("access=%+v, want implicit bucket_owner_enforced", accessBefore.ObjectOwnership)
	}

	versioningBefore, err := adapter.GetVersioning(context.Background(), secrets, "demo")
	if err != nil {
		t.Fatalf("GetVersioning err=%v", err)
	}
	if versioningBefore.Status != models.BucketVersioningStatusDisabled {
		t.Fatalf("versioning=%q, want disabled", versioningBefore.Status)
	}

	encryptionBefore, err := adapter.GetEncryption(context.Background(), secrets, "demo")
	if err != nil {
		t.Fatalf("GetEncryption err=%v", err)
	}
	if encryptionBefore.Mode != models.BucketEncryptionModeSSES3 {
		t.Fatalf("encryption mode=%q, want sse_s3", encryptionBefore.Mode)
	}
	if len(encryptionBefore.Warnings) == 0 {
		t.Fatal("expected implicit SSE-S3 warning")
	}

	lifecycleBefore, err := adapter.GetLifecycle(context.Background(), secrets, "demo")
	if err != nil {
		t.Fatalf("GetLifecycle err=%v", err)
	}
	if string(lifecycleBefore.Rules) != `[]` {
		t.Fatalf("lifecycle rules=%s, want []", string(lifecycleBefore.Rules))
	}

	ownership := models.BucketObjectOwnershipBucketOwnerPreferred
	if err := adapter.PutPublicExposure(context.Background(), secrets, "demo", models.BucketPublicExposurePutRequest{
		BlockPublicAccess: &models.BucketBlockPublicAccess{
			BlockPublicAcls:       true,
			IgnorePublicAcls:      true,
			BlockPublicPolicy:     true,
			RestrictPublicBuckets: true,
		},
	}); err != nil {
		t.Fatalf("PutPublicExposure err=%v", err)
	}
	if err := adapter.PutAccess(context.Background(), secrets, "demo", models.BucketAccessPutRequest{
		ObjectOwnership: &ownership,
	}); err != nil {
		t.Fatalf("PutAccess err=%v", err)
	}
	if err := adapter.PutVersioning(context.Background(), secrets, "demo", models.BucketVersioningPutRequest{
		Status: models.BucketVersioningStatusEnabled,
	}); err != nil {
		t.Fatalf("PutVersioning err=%v", err)
	}
	if err := adapter.PutEncryption(context.Background(), secrets, "demo", models.BucketEncryptionPutRequest{
		Mode:     models.BucketEncryptionModeSSEKMS,
		KMSKeyID: "alias/demo",
	}); err != nil {
		t.Fatalf("PutEncryption err=%v", err)
	}
	if err := adapter.PutLifecycle(context.Background(), secrets, "demo", models.BucketLifecyclePutRequest{
		Rules: []byte(`[{"id":"expire-logs","status":"enabled","prefix":"logs/","expiration":{"days":30}}]`),
	}); err != nil {
		t.Fatalf("PutLifecycle err=%v", err)
	}

	publicAfter, err := adapter.GetPublicExposure(context.Background(), secrets, "demo")
	if err != nil {
		t.Fatalf("GetPublicExposure after put err=%v", err)
	}
	if publicAfter.Mode != models.BucketPublicExposureModePrivate {
		t.Fatalf("public mode after put=%q, want private", publicAfter.Mode)
	}

	accessAfter, err := adapter.GetAccess(context.Background(), secrets, "demo")
	if err != nil {
		t.Fatalf("GetAccess after put err=%v", err)
	}
	if accessAfter.ObjectOwnership == nil || accessAfter.ObjectOwnership.Mode != models.BucketObjectOwnershipBucketOwnerPreferred {
		t.Fatalf("access after put=%+v, want bucket_owner_preferred", accessAfter.ObjectOwnership)
	}

	versioningAfter, err := adapter.GetVersioning(context.Background(), secrets, "demo")
	if err != nil {
		t.Fatalf("GetVersioning after put err=%v", err)
	}
	if versioningAfter.Status != models.BucketVersioningStatusEnabled {
		t.Fatalf("versioning after put=%q, want enabled", versioningAfter.Status)
	}

	encryptionAfter, err := adapter.GetEncryption(context.Background(), secrets, "demo")
	if err != nil {
		t.Fatalf("GetEncryption after put err=%v", err)
	}
	if encryptionAfter.Mode != models.BucketEncryptionModeSSEKMS {
		t.Fatalf("encryption mode after put=%q, want sse_kms", encryptionAfter.Mode)
	}
	if encryptionAfter.KMSKeyID != "alias/demo" {
		t.Fatalf("kmsKeyId after put=%q, want alias/demo", encryptionAfter.KMSKeyID)
	}

	lifecycleAfter, err := adapter.GetLifecycle(context.Background(), secrets, "demo")
	if err != nil {
		t.Fatalf("GetLifecycle after put err=%v", err)
	}
	if string(lifecycleAfter.Rules) != `[{"id":"expire-logs","status":"enabled","prefix":"logs/","expiration":{"days":30}}]` {
		t.Fatalf("lifecycle after put=%s, want rule JSON", string(lifecycleAfter.Rules))
	}

	governance, err := adapter.GetGovernance(context.Background(), secrets, "demo")
	if err != nil {
		t.Fatalf("GetGovernance err=%v", err)
	}
	if governance.PublicExposure == nil || governance.PublicExposure.Mode != models.BucketPublicExposureModePrivate {
		t.Fatalf("governance publicExposure=%+v, want private", governance.PublicExposure)
	}
	if governance.Access == nil || governance.Access.ObjectOwnership == nil || governance.Access.ObjectOwnership.Mode != models.BucketObjectOwnershipBucketOwnerPreferred {
		t.Fatalf("governance access=%+v, want bucket_owner_preferred", governance.Access)
	}
	if governance.Versioning == nil || governance.Versioning.Status != models.BucketVersioningStatusEnabled {
		t.Fatalf("governance versioning=%+v, want enabled", governance.Versioning)
	}
	if governance.Encryption == nil || governance.Encryption.Mode != models.BucketEncryptionModeSSEKMS {
		t.Fatalf("governance encryption=%+v, want sse_kms", governance.Encryption)
	}
	if governance.Lifecycle == nil || string(governance.Lifecycle.Rules) == "" {
		t.Fatalf("governance lifecycle=%+v, want lifecycle rules", governance.Lifecycle)
	}
	if governance.Advanced == nil || !governance.Advanced.RawPolicySupported || !governance.Advanced.RawPolicyEditable {
		t.Fatalf("governance advanced=%+v, want raw policy affordance", governance.Advanced)
	}

	fakeS3.assertSawQuery(t, "publicAccessBlock")
	fakeS3.assertSawQuery(t, "ownershipControls")
	fakeS3.assertSawQuery(t, "versioning")
	fakeS3.assertSawQuery(t, "encryption")
	fakeS3.assertSawQuery(t, "lifecycle")
}

type fakeAWSGovernanceServer struct {
	t testing.TB

	mu                sync.Mutex
	publicAccessBlock fakePublicAccessBlockState
	ownershipMode     string
	versioningStatus  string
	encryption        *fakeEncryptionState
	lifecycleRules    []fakeLifecycleRule
	rawQueries        []string
}

type fakePublicAccessBlockState struct {
	BlockPublicAcls       bool
	IgnorePublicAcls      bool
	BlockPublicPolicy     bool
	RestrictPublicBuckets bool
}

type fakeEncryptionState struct {
	Algorithm        string
	KMSKeyID         string
	BucketKeyEnabled bool
}

type fakeLifecycleRule struct {
	ID             string
	Status         string
	Prefix         string
	ExpirationDays int32
}

func (s *fakeAWSGovernanceServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	s.rawQueries = append(s.rawQueries, r.URL.RawQuery)
	s.mu.Unlock()

	if bucket := strings.TrimPrefix(r.URL.Path, "/"); bucket != "demo" {
		s.writeError(w, http.StatusNotFound, "NoSuchBucket", "The specified bucket does not exist.")
		return
	}

	switch {
	case hasAWSSubresource(r, "publicAccessBlock"):
		s.handlePublicAccessBlock(w, r)
	case hasAWSSubresource(r, "ownershipControls"):
		s.handleOwnershipControls(w, r)
	case hasAWSSubresource(r, "versioning"):
		s.handleVersioning(w, r)
	case hasAWSSubresource(r, "encryption"):
		s.handleEncryption(w, r)
	case hasAWSSubresource(r, "lifecycle"):
		s.handleLifecycle(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (s *fakeAWSGovernanceServer) handlePublicAccessBlock(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.mu.Lock()
		state := s.publicAccessBlock
		s.mu.Unlock()
		writeXMLResponse(w, http.StatusOK, fmt.Sprintf(`<PublicAccessBlockConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><BlockPublicAcls>%t</BlockPublicAcls><IgnorePublicAcls>%t</IgnorePublicAcls><BlockPublicPolicy>%t</BlockPublicPolicy><RestrictPublicBuckets>%t</RestrictPublicBuckets></PublicAccessBlockConfiguration>`,
			state.BlockPublicAcls,
			state.IgnorePublicAcls,
			state.BlockPublicPolicy,
			state.RestrictPublicBuckets,
		))
	case http.MethodPut:
		var payload struct {
			BlockPublicAcls       bool `xml:"BlockPublicAcls"`
			IgnorePublicAcls      bool `xml:"IgnorePublicAcls"`
			BlockPublicPolicy     bool `xml:"BlockPublicPolicy"`
			RestrictPublicBuckets bool `xml:"RestrictPublicBuckets"`
		}
		if err := decodeXMLRequest(r, &payload); err != nil {
			s.t.Fatalf("decode public access block: %v", err)
		}
		s.mu.Lock()
		s.publicAccessBlock = fakePublicAccessBlockState{
			BlockPublicAcls:       payload.BlockPublicAcls,
			IgnorePublicAcls:      payload.IgnorePublicAcls,
			BlockPublicPolicy:     payload.BlockPublicPolicy,
			RestrictPublicBuckets: payload.RestrictPublicBuckets,
		}
		s.mu.Unlock()
		w.WriteHeader(http.StatusOK)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *fakeAWSGovernanceServer) handleOwnershipControls(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.mu.Lock()
		mode := s.ownershipMode
		s.mu.Unlock()
		if mode == "" {
			s.writeError(w, http.StatusNotFound, "OwnershipControlsNotFoundError", "The bucket ownership controls were not found.")
			return
		}
		writeXMLResponse(w, http.StatusOK, fmt.Sprintf(`<OwnershipControls xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Rule><ObjectOwnership>%s</ObjectOwnership></Rule></OwnershipControls>`, mode))
	case http.MethodPut:
		var payload struct {
			Rules []struct {
				ObjectOwnership string `xml:"ObjectOwnership"`
			} `xml:"Rule"`
		}
		if err := decodeXMLRequest(r, &payload); err != nil {
			s.t.Fatalf("decode ownership controls: %v", err)
		}
		if len(payload.Rules) == 0 {
			s.t.Fatal("ownership controls payload missing rule")
		}
		s.mu.Lock()
		s.ownershipMode = payload.Rules[0].ObjectOwnership
		s.mu.Unlock()
		w.WriteHeader(http.StatusOK)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *fakeAWSGovernanceServer) handleVersioning(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.mu.Lock()
		status := s.versioningStatus
		s.mu.Unlock()
		writeXMLResponse(w, http.StatusOK, fmt.Sprintf(`<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Status>%s</Status></VersioningConfiguration>`, status))
	case http.MethodPut:
		var payload struct {
			Status string `xml:"Status"`
		}
		if err := decodeXMLRequest(r, &payload); err != nil {
			s.t.Fatalf("decode versioning: %v", err)
		}
		s.mu.Lock()
		s.versioningStatus = payload.Status
		s.mu.Unlock()
		w.WriteHeader(http.StatusOK)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *fakeAWSGovernanceServer) handleEncryption(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.mu.Lock()
		state := s.encryption
		s.mu.Unlock()
		if state == nil {
			s.writeError(w, http.StatusNotFound, "ServerSideEncryptionConfigurationNotFoundError", "The server side encryption configuration was not found.")
			return
		}
		writeXMLResponse(w, http.StatusOK, fmt.Sprintf(`<ServerSideEncryptionConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Rule><ApplyServerSideEncryptionByDefault><SSEAlgorithm>%s</SSEAlgorithm>%s</ApplyServerSideEncryptionByDefault><BucketKeyEnabled>%t</BucketKeyEnabled></Rule></ServerSideEncryptionConfiguration>`,
			state.Algorithm,
			optionalXMLTag("KMSMasterKeyID", state.KMSKeyID),
			state.BucketKeyEnabled,
		))
	case http.MethodPut:
		var payload struct {
			Rules []struct {
				ApplyServerSideEncryptionByDefault struct {
					SSEAlgorithm   string `xml:"SSEAlgorithm"`
					KMSMasterKeyID string `xml:"KMSMasterKeyID"`
				} `xml:"ApplyServerSideEncryptionByDefault"`
				BucketKeyEnabled bool `xml:"BucketKeyEnabled"`
			} `xml:"Rule"`
		}
		if err := decodeXMLRequest(r, &payload); err != nil {
			s.t.Fatalf("decode encryption: %v", err)
		}
		if len(payload.Rules) == 0 {
			s.t.Fatal("encryption payload missing rule")
		}
		rule := payload.Rules[0]
		s.mu.Lock()
		s.encryption = &fakeEncryptionState{
			Algorithm:        rule.ApplyServerSideEncryptionByDefault.SSEAlgorithm,
			KMSKeyID:         rule.ApplyServerSideEncryptionByDefault.KMSMasterKeyID,
			BucketKeyEnabled: rule.BucketKeyEnabled,
		}
		s.mu.Unlock()
		w.WriteHeader(http.StatusOK)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *fakeAWSGovernanceServer) handleLifecycle(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.mu.Lock()
		rules := append([]fakeLifecycleRule(nil), s.lifecycleRules...)
		s.mu.Unlock()
		if len(rules) == 0 {
			s.writeError(w, http.StatusNotFound, "NoSuchLifecycleConfiguration", "The lifecycle configuration does not exist.")
			return
		}
		body := `<LifecycleConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">`
		for _, rule := range rules {
			body += fmt.Sprintf(`<Rule><ID>%s</ID><Status>%s</Status><Filter><Prefix>%s</Prefix></Filter><Expiration><Days>%d</Days></Expiration></Rule>`, rule.ID, rule.Status, rule.Prefix, rule.ExpirationDays)
		}
		body += `</LifecycleConfiguration>`
		writeXMLResponse(w, http.StatusOK, body)
	case http.MethodPut:
		var payload struct {
			Rules []struct {
				ID     string `xml:"ID"`
				Status string `xml:"Status"`
				Prefix string `xml:"Prefix"`
				Filter struct {
					Prefix string `xml:"Prefix"`
				} `xml:"Filter"`
				Expiration struct {
					Days int32 `xml:"Days"`
				} `xml:"Expiration"`
			} `xml:"Rule"`
		}
		if err := decodeXMLRequest(r, &payload); err != nil {
			s.t.Fatalf("decode lifecycle: %v", err)
		}
		s.mu.Lock()
		s.lifecycleRules = s.lifecycleRules[:0]
		for _, item := range payload.Rules {
			prefix := item.Prefix
			if prefix == "" {
				prefix = item.Filter.Prefix
			}
			s.lifecycleRules = append(s.lifecycleRules, fakeLifecycleRule{
				ID:             item.ID,
				Status:         item.Status,
				Prefix:         prefix,
				ExpirationDays: item.Expiration.Days,
			})
		}
		s.mu.Unlock()
		w.WriteHeader(http.StatusOK)
	case http.MethodDelete:
		s.mu.Lock()
		s.lifecycleRules = nil
		s.mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *fakeAWSGovernanceServer) writeError(w http.ResponseWriter, status int, code, message string) {
	writeXMLResponse(w, status, fmt.Sprintf(`<Error><Code>%s</Code><Message>%s</Message><RequestId>req-1</RequestId><HostId>host-1</HostId></Error>`, code, message))
}

func (s *fakeAWSGovernanceServer) assertSawQuery(t *testing.T, want string) {
	t.Helper()

	s.mu.Lock()
	defer s.mu.Unlock()
	for _, raw := range s.rawQueries {
		if strings.Contains(raw, want) {
			return
		}
	}
	t.Fatalf("raw queries=%v, want query containing %q", s.rawQueries, want)
}

func hasAWSSubresource(r *http.Request, key string) bool {
	_, ok := r.URL.Query()[key]
	return ok
}

func decodeXMLRequest(r *http.Request, out any) error {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return err
	}
	return xml.Unmarshal(body, out)
}

func writeXMLResponse(w http.ResponseWriter, status int, body string) {
	w.Header().Set("Content-Type", "application/xml")
	w.WriteHeader(status)
	_, _ = io.WriteString(w, body)
}

func optionalXMLTag(name, value string) string {
	if strings.TrimSpace(value) == "" {
		return ""
	}
	return fmt.Sprintf("<%s>%s</%s>", name, value, name)
}
