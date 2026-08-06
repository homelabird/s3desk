package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"s3desk/internal/config"
	"s3desk/internal/models"
)

func TestMetaHTTPService_HandleGetMeta_ReturnsConfiguredMetaResponse(t *testing.T) {
	t.Parallel()

	svc := newMetaHTTPService(&server{
		cfg: config.Config{
			DataDir:            "/tmp/data",
			DBBackend:          "invalid-backend",
			StaticDir:          "/tmp/static",
			EncryptionKey:      testEncryptionKey(),
			JobConcurrency:     3,
			JobLogMaxBytes:     4096,
			JobRetention:       2 * time.Hour,
			JobLogRetention:    30 * time.Minute,
			UploadSessionTTL:   5 * time.Minute,
			UploadMaxBytes:     8192,
			UploadDirectStream: true,
		},
		serverAddr: "127.0.0.1:0",
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/meta", nil)

	svc.handleGetMeta(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("rec.Code=%d, want %d", rec.Code, http.StatusOK)
	}

	var resp models.MetaResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.DBBackend != "sqlite" {
		t.Fatalf("resp.DBBackend=%q, want sqlite fallback", resp.DBBackend)
	}
	if !resp.Capabilities.ProfileTLS.Enabled {
		t.Fatal("expected profile tls enabled when encryption key is configured")
	}
	if resp.JobLogMaxBytes == nil || *resp.JobLogMaxBytes != 4096 {
		t.Fatalf("resp.JobLogMaxBytes=%v, want 4096", resp.JobLogMaxBytes)
	}
	if resp.JobRetentionSeconds == nil || *resp.JobRetentionSeconds != 7200 {
		t.Fatalf("resp.JobRetentionSeconds=%v, want 7200", resp.JobRetentionSeconds)
	}
	if resp.JobLogRetentionSeconds == nil || *resp.JobLogRetentionSeconds != 1800 {
		t.Fatalf("resp.JobLogRetentionSeconds=%v, want 1800", resp.JobLogRetentionSeconds)
	}
	if resp.UploadMaxBytes == nil || *resp.UploadMaxBytes != 8192 {
		t.Fatalf("resp.UploadMaxBytes=%v, want 8192", resp.UploadMaxBytes)
	}
	if resp.UploadSessionTTLSeconds != 300 {
		t.Fatalf("resp.UploadSessionTTLSeconds=%d, want 300", resp.UploadSessionTTLSeconds)
	}
	if !resp.UploadDirectStream {
		t.Fatal("expected uploadDirectStream=true")
	}
	for _, provider := range []models.ProfileProvider{
		models.ProfileProviderAwsS3,
		models.ProfileProviderS3Compatible,
		models.ProfileProviderAzureBlob,
		models.ProfileProviderGcpGcs,
		models.ProfileProviderOciObjectStorage,
	} {
		if !resp.Capabilities.Providers[provider].DirectUpload {
			t.Fatalf("expected directUpload=true for %q", provider)
		}
	}
	if resp.TransferEngine.Name != "rclone" {
		t.Fatalf("resp.TransferEngine.Name=%q, want rclone", resp.TransferEngine.Name)
	}
}
