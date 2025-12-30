package api

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/db"
	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

func TestProfileTLSRequiresEncryptionKey(t *testing.T) {
	st, srv := newTestServer(t, "")
	profile := createTestProfile(t, st)
	certPEM, keyPEM := generateTestCert(t)

	req := models.ProfileTLSConfig{
		Mode:          models.ProfileTLSModeMTLS,
		ClientCertPEM: certPEM,
		ClientKeyPEM:  keyPEM,
	}
	res := doJSONRequest(t, srv, http.MethodPut, "/api/v1/profiles/"+profile.ID+"/tls", req)
	defer res.Body.Close()

	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", res.StatusCode)
	}
	var errResp models.ErrorResponse
	decodeJSONResponse(t, res, &errResp)
	if errResp.Error.Code != "encryption_required" {
		t.Fatalf("expected encryption_required, got %q", errResp.Error.Code)
	}
}

func TestProfileTLSLifecycle(t *testing.T) {
	st, srv := newTestServer(t, testEncryptionKey())
	profile := createTestProfile(t, st)
	certPEM, keyPEM := generateTestCert(t)

	putReq := models.ProfileTLSConfig{
		Mode:          models.ProfileTLSModeMTLS,
		ClientCertPEM: certPEM,
		ClientKeyPEM:  keyPEM,
		CACertPEM:     certPEM,
		ServerName:    "s3.example.com",
	}

	res := doJSONRequest(t, srv, http.MethodPut, "/api/v1/profiles/"+profile.ID+"/tls", putReq)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", res.StatusCode)
	}
	var status models.ProfileTLSStatus
	decodeJSONResponse(t, res, &status)
	if status.Mode != models.ProfileTLSModeMTLS {
		t.Fatalf("expected mode mtls, got %q", status.Mode)
	}
	if !status.HasClientCert || !status.HasClientKey || !status.HasCACert {
		t.Fatalf("expected cert/key/ca flags to be true, got cert=%v key=%v ca=%v", status.HasClientCert, status.HasClientKey, status.HasCACert)
	}
	if status.ServerName != "s3.example.com" {
		t.Fatalf("expected serverName s3.example.com, got %q", status.ServerName)
	}

	getRes := doJSONRequest(t, srv, http.MethodGet, "/api/v1/profiles/"+profile.ID+"/tls", nil)
	defer getRes.Body.Close()
	if getRes.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", getRes.StatusCode)
	}
	var getStatus models.ProfileTLSStatus
	decodeJSONResponse(t, getRes, &getStatus)
	if getStatus.Mode != models.ProfileTLSModeMTLS || !getStatus.HasClientCert || !getStatus.HasClientKey {
		t.Fatalf("unexpected get status: %+v", getStatus)
	}

	delRes := doJSONRequest(t, srv, http.MethodDelete, "/api/v1/profiles/"+profile.ID+"/tls", nil)
	defer delRes.Body.Close()
	if delRes.StatusCode != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", delRes.StatusCode)
	}

	afterRes := doJSONRequest(t, srv, http.MethodGet, "/api/v1/profiles/"+profile.ID+"/tls", nil)
	defer afterRes.Body.Close()
	if afterRes.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", afterRes.StatusCode)
	}
	var afterStatus models.ProfileTLSStatus
	decodeJSONResponse(t, afterRes, &afterStatus)
	if afterStatus.Mode != models.ProfileTLSModeDisabled || afterStatus.HasClientCert || afterStatus.HasClientKey || afterStatus.HasCACert {
		t.Fatalf("expected tls disabled after delete, got %+v", afterStatus)
	}
}

func newTestServer(t *testing.T, encryptionKey string) (*store.Store, *httptest.Server) {
	t.Helper()
	dataDir := t.TempDir()
	gormDB, err := db.Open(db.Config{
		Backend:    db.BackendSQLite,
		SQLitePath: filepath.Join(dataDir, "s3desk.db"),
	})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	sqlDB, err := gormDB.DB()
	if err != nil {
		t.Fatalf("open sql db: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	st, err := store.New(gormDB, store.Options{
		EncryptionKey: encryptionKey,
	})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	hub := ws.NewHub()
	manager := jobs.NewManager(jobs.Config{
		Store:            st,
		DataDir:          dataDir,
		Hub:              hub,
		Concurrency:      1,
		JobLogMaxBytes:   0,
		JobRetention:     0,
		AllowedLocalDirs: nil,
		UploadSessionTTL: time.Minute,
	})

	handler := New(Dependencies{
		Config: config.Config{
			Addr:             "127.0.0.1:0",
			DataDir:          dataDir,
			DBBackend:        string(db.BackendSQLite),
			StaticDir:        dataDir,
			EncryptionKey:    encryptionKey,
			JobConcurrency:   1,
			UploadSessionTTL: time.Minute,
		},
		Store:      st,
		Jobs:       manager,
		Hub:        hub,
		ServerAddr: "127.0.0.1:0",
	})
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return st, srv
}

func createTestProfile(t *testing.T, st *store.Store) models.Profile {
	t.Helper()
	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Name:                  "test-profile",
		Endpoint:              "http://127.0.0.1:9000",
		Region:                "us-east-1",
		AccessKeyID:           "access",
		SecretAccessKey:       "secret",
		ForcePathStyle:        false,
		TLSInsecureSkipVerify: false,
	})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}
	return profile
}

func doJSONRequest(t *testing.T, srv *httptest.Server, method, path string, payload any) *http.Response {
	t.Helper()
	var body *bytes.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal payload: %v", err)
		}
		body = bytes.NewReader(data)
	} else {
		body = bytes.NewReader(nil)
	}
	req, err := http.NewRequest(method, srv.URL+path, body)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	return res
}

func decodeJSONResponse(t *testing.T, res *http.Response, out any) {
	t.Helper()
	if err := json.NewDecoder(res.Body).Decode(out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
}

func testEncryptionKey() string {
	raw := bytes.Repeat([]byte{0x42}, 32)
	return base64.StdEncoding.EncodeToString(raw)
}

func generateTestCert(t *testing.T) (string, string) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}

	serial := big.NewInt(1)
	template := x509.Certificate{
		SerialNumber:          serial,
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create cert: %v", err)
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	return string(certPEM), string(keyPEM)
}
