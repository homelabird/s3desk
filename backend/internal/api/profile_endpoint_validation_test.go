package api

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/db"
	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

func TestValidateProfileEndpointURLRejectsMetadataHost(t *testing.T) {
	t.Parallel()

	endpoint := "http://169.254.169.254/latest/meta-data"
	err := validateProfileEndpointURL("endpoint", &endpoint, false)
	if err == nil || !strings.Contains(err.Error(), "blocked metadata host") {
		t.Fatalf("validateProfileEndpointURL() error=%v, want blocked metadata host", err)
	}
}

func TestValidateProfileEndpointURLAllowsPrivateServiceEndpoint(t *testing.T) {
	t.Parallel()

	endpoint := "https://10.0.0.25:9000"
	if err := validateProfileEndpointURL("endpoint", &endpoint, true); err != nil {
		t.Fatalf("validateProfileEndpointURL() unexpected error: %v", err)
	}
}

func TestValidateProfileTLSSkipVerifyEndpointRejectsBlankEndpoint(t *testing.T) {
	t.Parallel()

	err := validateProfileTLSSkipVerifyEndpoint("endpoint", nil, false)
	if err == nil || !strings.Contains(err.Error(), "custom https:// endpoint") {
		t.Fatalf("validateProfileTLSSkipVerifyEndpoint() error=%v, want custom endpoint rejection", err)
	}
}

func TestValidateProfileTLSSkipVerifyEndpointRejectsPublicResolvedHost(t *testing.T) {
	stubProfileEndpointLookup(t,
		nil,
		func(_ context.Context, host string) ([]net.IPAddr, error) {
			if host != "public.example.com" {
				t.Fatalf("LookupIPAddr host=%q, want %q", host, "public.example.com")
			}
			return []net.IPAddr{{IP: net.ParseIP("93.184.216.34")}}, nil
		},
	)

	endpoint := "https://public.example.com"
	err := validateProfileTLSSkipVerifyEndpoint("endpoint", &endpoint, false)
	if err == nil || !strings.Contains(err.Error(), "allowed only for private") {
		t.Fatalf("validateProfileTLSSkipVerifyEndpoint() error=%v, want private-endpoint rejection", err)
	}
}

func TestValidateProfileTLSSkipVerifyEndpointAllowsResolvedPrivateHost(t *testing.T) {
	stubProfileEndpointLookup(t,
		nil,
		func(_ context.Context, host string) ([]net.IPAddr, error) {
			if host != "minio.internal" {
				t.Fatalf("LookupIPAddr host=%q, want %q", host, "minio.internal")
			}
			return []net.IPAddr{{IP: net.ParseIP("10.0.0.25")}}, nil
		},
	)

	endpoint := "https://minio.internal:9000"
	if err := validateProfileTLSSkipVerifyEndpoint("endpoint", &endpoint, false); err != nil {
		t.Fatalf("validateProfileTLSSkipVerifyEndpoint() unexpected error: %v", err)
	}
}

func TestValidateProfileEndpointURLRejectsBlockedMetadataAlias(t *testing.T) {
	stubProfileEndpointLookup(t,
		func(_ context.Context, host string) (string, error) {
			if host != "alias.internal" {
				t.Fatalf("LookupCNAME host=%q, want %q", host, "alias.internal")
			}
			return "metadata.google.internal.", nil
		},
		func(_ context.Context, host string) ([]net.IPAddr, error) {
			if host != "alias.internal" {
				t.Fatalf("LookupIPAddr host=%q, want %q", host, "alias.internal")
			}
			return []net.IPAddr{{IP: net.ParseIP("169.254.169.254")}}, nil
		},
	)

	endpoint := "https://alias.internal"
	err := validateProfileEndpointURL("endpoint", &endpoint, false)
	if err == nil || !strings.Contains(err.Error(), "blocked metadata host") {
		t.Fatalf("validateProfileEndpointURL() error=%v, want blocked metadata host", err)
	}
}

func TestValidateProfileEndpointURLRejectsResolvedLoopbackWhenRemoteEnabled(t *testing.T) {
	stubProfileEndpointLookup(t,
		nil,
		func(_ context.Context, host string) ([]net.IPAddr, error) {
			if host != "loopback.internal" {
				t.Fatalf("LookupIPAddr host=%q, want %q", host, "loopback.internal")
			}
			return []net.IPAddr{{IP: net.ParseIP("127.0.0.1")}}, nil
		},
	)

	endpoint := "https://loopback.internal"
	err := validateProfileEndpointURL("endpoint", &endpoint, true)
	if err == nil || !strings.Contains(err.Error(), "loopback or link-local") {
		t.Fatalf("validateProfileEndpointURL() error=%v, want loopback rejection", err)
	}
}

func TestValidateProfileEndpointURLAllowsResolvedPrivateServiceEndpoint(t *testing.T) {
	stubProfileEndpointLookup(t,
		nil,
		func(_ context.Context, host string) ([]net.IPAddr, error) {
			if host != "minio.internal" {
				t.Fatalf("LookupIPAddr host=%q, want %q", host, "minio.internal")
			}
			return []net.IPAddr{{IP: net.ParseIP("10.0.0.25")}}, nil
		},
	)

	endpoint := "https://minio.internal:9000"
	if err := validateProfileEndpointURL("endpoint", &endpoint, true); err != nil {
		t.Fatalf("validateProfileEndpointURL() unexpected error: %v", err)
	}
}

func TestValidateProfileEndpointURLRejectsUnresolvedHost(t *testing.T) {
	stubProfileEndpointLookup(t,
		nil,
		func(_ context.Context, host string) ([]net.IPAddr, error) {
			if host != "missing.internal" {
				t.Fatalf("LookupIPAddr host=%q, want %q", host, "missing.internal")
			}
			return nil, errors.New("lookup failed")
		},
	)

	endpoint := "https://missing.internal"
	err := validateProfileEndpointURL("endpoint", &endpoint, false)
	if err == nil || !strings.Contains(err.Error(), "could not be resolved") {
		t.Fatalf("validateProfileEndpointURL() error=%v, want resolution failure", err)
	}
}

func TestHandleCreateProfileRejectsBlockedMetadataEndpoint(t *testing.T) {
	t.Parallel()

	_, srv := newTestServer(t, testEncryptionKey())

	endpoint := "http://169.254.169.254/latest/meta-data"
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	req := models.ProfileCreateRequest{
		Provider:        models.ProfileProviderS3Compatible,
		Name:            "blocked-profile",
		Endpoint:        &endpoint,
		Region:          &region,
		AccessKeyID:     &accessKey,
		SecretAccessKey: &secretKey,
	}

	res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/profiles", req)
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if !strings.Contains(resp.Error.Message, "blocked metadata host") {
		t.Fatalf("error.message=%q, want blocked metadata host", resp.Error.Message)
	}
}

func TestHandleCreateProfileRejectsTLSSkipVerifyWithoutCustomEndpoint(t *testing.T) {
	t.Parallel()

	_, srv := newTestServer(t, testEncryptionKey())

	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	req := models.ProfileCreateRequest{
		Provider:              models.ProfileProviderAwsS3,
		Name:                  "aws-default-endpoint",
		Region:                &region,
		AccessKeyID:           &accessKey,
		SecretAccessKey:       &secretKey,
		TLSInsecureSkipVerify: true,
	}

	res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/profiles", req)
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if !strings.Contains(resp.Error.Message, "custom https:// endpoint") {
		t.Fatalf("error.message=%q, want custom endpoint rejection", resp.Error.Message)
	}
}

func TestHandleCreateProfileAllowsPrivateTLSSkipVerifyEndpoint(t *testing.T) {
	stubProfileEndpointLookup(t,
		nil,
		func(_ context.Context, host string) ([]net.IPAddr, error) {
			if host != "minio.internal" {
				t.Fatalf("LookupIPAddr host=%q, want %q", host, "minio.internal")
			}
			return []net.IPAddr{{IP: net.ParseIP("10.0.0.25")}}, nil
		},
	)

	_, srv := newTestServer(t, testEncryptionKey())

	endpoint := "https://minio.internal:9000"
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	req := models.ProfileCreateRequest{
		Provider:              models.ProfileProviderS3Compatible,
		Name:                  "private-minio",
		Endpoint:              &endpoint,
		Region:                &region,
		AccessKeyID:           &accessKey,
		SecretAccessKey:       &secretKey,
		TLSInsecureSkipVerify: true,
	}

	res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/profiles", req)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusCreated)
	}
}

func TestHandleCreateProfileRejectsBlockedMetadataAlias(t *testing.T) {
	stubProfileEndpointLookup(t,
		nil,
		func(_ context.Context, host string) ([]net.IPAddr, error) {
			if host != "alias.internal" {
				t.Fatalf("LookupIPAddr host=%q, want %q", host, "alias.internal")
			}
			return []net.IPAddr{{IP: net.ParseIP("169.254.169.254")}}, nil
		},
	)

	_, srv := newTestServer(t, testEncryptionKey())

	endpoint := "https://alias.internal"
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	req := models.ProfileCreateRequest{
		Provider:        models.ProfileProviderS3Compatible,
		Name:            "blocked-alias-profile",
		Endpoint:        &endpoint,
		Region:          &region,
		AccessKeyID:     &accessKey,
		SecretAccessKey: &secretKey,
	}

	res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/profiles", req)
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if !strings.Contains(resp.Error.Message, "blocked metadata host") {
		t.Fatalf("error.message=%q, want blocked metadata host", resp.Error.Message)
	}
}

func TestHandleCreateProfileRejectsLocalhostEndpointWhenRemoteEnabled(t *testing.T) {
	t.Parallel()

	_, srv := newTestServerWithConfig(t, config.Config{
		AllowRemote:   true,
		EncryptionKey: testEncryptionKey(),
	})

	endpoint := "http://localhost:9000"
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	req := models.ProfileCreateRequest{
		Provider:        models.ProfileProviderS3Compatible,
		Name:            "remote-profile",
		Endpoint:        &endpoint,
		Region:          &region,
		AccessKeyID:     &accessKey,
		SecretAccessKey: &secretKey,
	}

	res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/profiles", req)
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if !strings.Contains(resp.Error.Message, "must not target localhost") {
		t.Fatalf("error.message=%q, want localhost rejection", resp.Error.Message)
	}
}

func TestHandleUpdateProfileRejectsBlockedPublicEndpointWhenRemoteEnabled(t *testing.T) {
	t.Parallel()

	st, srv := newTestServerWithConfig(t, config.Config{
		AllowRemote:   true,
		EncryptionKey: testEncryptionKey(),
	})
	profile := createTestProfile(t, st)

	publicEndpoint := "http://127.0.0.1:9000"
	req := models.ProfileUpdateRequest{
		PublicEndpoint: &publicEndpoint,
	}

	res := doJSONRequest(t, srv, http.MethodPatch, "/api/v1/profiles/"+profile.ID, req)
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if !strings.Contains(resp.Error.Message, "loopback or link-local") {
		t.Fatalf("error.message=%q, want loopback rejection", resp.Error.Message)
	}
}

func TestHandleUpdateProfileRejectsTLSSkipVerifyOnAWSDefaultEndpoint(t *testing.T) {
	t.Parallel()

	st, srv := newTestServer(t, testEncryptionKey())
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderAwsS3,
		Name:                  "aws-default-endpoint",
		Region:                &region,
		AccessKeyID:           &accessKey,
		SecretAccessKey:       &secretKey,
		TLSInsecureSkipVerify: false,
	})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}

	enabled := true
	req := models.ProfileUpdateRequest{TLSInsecureSkipVerify: &enabled}
	res := doJSONRequest(t, srv, http.MethodPatch, "/api/v1/profiles/"+profile.ID, req)
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if !strings.Contains(resp.Error.Message, "custom https:// endpoint") {
		t.Fatalf("error.message=%q, want custom endpoint rejection", resp.Error.Message)
	}
}

func TestHandleUpdateProfileAllowsPrivateTLSSkipVerifyEndpoint(t *testing.T) {
	stubProfileEndpointLookup(t,
		nil,
		func(_ context.Context, host string) ([]net.IPAddr, error) {
			switch host {
			case "minio.internal":
				return []net.IPAddr{{IP: net.ParseIP("10.0.0.25")}}, nil
			default:
				t.Fatalf("LookupIPAddr host=%q, want %q", host, "minio.internal")
				return nil, nil
			}
		},
	)

	st, srv := newTestServer(t, testEncryptionKey())
	endpoint := "https://minio.internal:9000"
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderS3Compatible,
		Name:                  "private-minio",
		Endpoint:              &endpoint,
		Region:                &region,
		AccessKeyID:           &accessKey,
		SecretAccessKey:       &secretKey,
		TLSInsecureSkipVerify: false,
	})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}

	enabled := true
	req := models.ProfileUpdateRequest{TLSInsecureSkipVerify: &enabled}
	res := doJSONRequest(t, srv, http.MethodPatch, "/api/v1/profiles/"+profile.ID, req)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}
}

func TestHandleUpdateProfileRejectsPublicEndpointWhileTLSSkipVerifyEnabled(t *testing.T) {
	stubProfileEndpointLookup(t,
		nil,
		func(_ context.Context, host string) ([]net.IPAddr, error) {
			switch host {
			case "minio.internal":
				return []net.IPAddr{{IP: net.ParseIP("10.0.0.25")}}, nil
			case "public.example.com":
				return []net.IPAddr{{IP: net.ParseIP("93.184.216.34")}}, nil
			default:
				t.Fatalf("LookupIPAddr host=%q", host)
				return nil, nil
			}
		},
	)

	st, srv := newTestServer(t, testEncryptionKey())
	endpoint := "https://minio.internal:9000"
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderS3Compatible,
		Name:                  "private-minio",
		Endpoint:              &endpoint,
		Region:                &region,
		AccessKeyID:           &accessKey,
		SecretAccessKey:       &secretKey,
		TLSInsecureSkipVerify: true,
	})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}

	publicEndpoint := "https://public.example.com"
	req := models.ProfileUpdateRequest{Endpoint: &publicEndpoint}
	res := doJSONRequest(t, srv, http.MethodPatch, "/api/v1/profiles/"+profile.ID, req)
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
	}

	var resp models.ErrorResponse
	decodeJSONResponse(t, res, &resp)
	if !strings.Contains(resp.Error.Message, "allowed only for private") {
		t.Fatalf("error.message=%q, want private-endpoint rejection", resp.Error.Message)
	}
}

func newTestServerWithConfig(t *testing.T, cfg config.Config) (*store.Store, *httptest.Server) {
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
		EncryptionKey: cfg.EncryptionKey,
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
		AllowedLocalDirs: cfg.AllowedLocalDirs,
		UploadSessionTTL: time.Minute,
	})

	if cfg.Addr == "" {
		cfg.Addr = "127.0.0.1:0"
	}
	if cfg.DataDir == "" {
		cfg.DataDir = dataDir
	}
	if cfg.DBBackend == "" {
		cfg.DBBackend = string(db.BackendSQLite)
	}
	if cfg.StaticDir == "" {
		cfg.StaticDir = dataDir
	}
	if cfg.JobConcurrency <= 0 {
		cfg.JobConcurrency = 1
	}
	if cfg.UploadSessionTTL <= 0 {
		cfg.UploadSessionTTL = time.Minute
	}

	handler := New(Dependencies{
		Config:     cfg,
		Store:      st,
		Jobs:       manager,
		Hub:        hub,
		ServerAddr: cfg.Addr,
	})
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return st, srv
}

func TestHandleCreateProfileAllowsLocalhostEndpointWhenRemoteAccessDisabled(t *testing.T) {
	t.Parallel()

	_, srv := newTestServer(t, testEncryptionKey())

	endpoint := "http://localhost:9000"
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	req := models.ProfileCreateRequest{
		Provider:        models.ProfileProviderS3Compatible,
		Name:            "local-profile",
		Endpoint:        &endpoint,
		Region:          &region,
		AccessKeyID:     &accessKey,
		SecretAccessKey: &secretKey,
	}

	res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/profiles", req)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusCreated)
	}
}

func stubProfileEndpointLookup(
	t *testing.T,
	lookupCNAME func(context.Context, string) (string, error),
	lookupIP func(context.Context, string) ([]net.IPAddr, error),
) {
	t.Helper()

	originalCNAME := profileEndpointLookupCNAME
	originalIP := profileEndpointLookupIPAddr
	if lookupCNAME != nil {
		profileEndpointLookupCNAME = lookupCNAME
	}
	if lookupIP != nil {
		profileEndpointLookupIPAddr = lookupIP
	}
	t.Cleanup(func() {
		profileEndpointLookupCNAME = originalCNAME
		profileEndpointLookupIPAddr = originalIP
	})
}
