package jobs

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"s3desk/internal/db"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

func TestBenchmarkConnectivityReportsBucketListFailure(t *testing.T) {
	installJobsStartRcloneHook(t, func(_ context.Context, _ models.ProfileSecrets, _ string, args []string) (*rcloneProcess, error) {
		if len(args) == 0 {
			return nil, unexpectedJobsProcessArgs(args)
		}
		if args[0] == "lsjson" {
			return newTestRcloneProcess("", "AccessDenied", errors.New("exit status 9")), nil
		}
		return newTestRcloneProcess("", "", nil), nil
	})

	manager, profileID := newBenchmarkManagerFixture(t)

	resp, err := manager.BenchmarkConnectivity(context.Background(), profileID)
	if err != nil {
		t.Fatalf("BenchmarkConnectivity: %v", err)
	}
	if resp.OK {
		t.Fatalf("expected benchmark failure, got %+v", resp)
	}
	if !strings.Contains(resp.Message, "failed to list buckets: AccessDenied") {
		t.Fatalf("message=%q, want bucket list failure", resp.Message)
	}
	norm, ok := resp.Details["normalizedError"].(map[string]any)
	if !ok {
		t.Fatalf("details=%+v, want normalizedError map", resp.Details)
	}
	if got := norm["code"]; got != "access_denied" {
		t.Fatalf("normalizedError.code=%v, want access_denied", got)
	}
	if got := resp.Details["error"]; got != "AccessDenied" {
		t.Fatalf("details.error=%v, want AccessDenied", got)
	}
}

func TestBenchmarkConnectivityUsesBucketNameFallback(t *testing.T) {
	installJobsStartRcloneHook(t, func(_ context.Context, _ models.ProfileSecrets, _ string, args []string) (*rcloneProcess, error) {
		if len(args) == 0 {
			return nil, unexpectedJobsProcessArgs(args)
		}
		switch args[0] {
		case "lsjson":
			return newTestRcloneProcess(`[{"Name":"bucket-from-name","IsDir":true}]`, "", nil), nil
		case "cat":
			return newTestRcloneProcess("benchmark-bytes", "", nil), nil
		case "copyto", "deletefile":
			return newTestRcloneProcess("", "", nil), nil
		default:
			return nil, unexpectedJobsProcessArgs(args)
		}
	})

	manager, profileID := newBenchmarkManagerFixture(t)

	resp, err := manager.BenchmarkConnectivity(context.Background(), profileID)
	if err != nil {
		t.Fatalf("BenchmarkConnectivity: %v", err)
	}
	if !resp.OK {
		t.Fatalf("expected benchmark success, got %+v", resp)
	}
	if resp.Message != "ok" {
		t.Fatalf("message=%q, want ok", resp.Message)
	}
	if !resp.CleanedUp {
		t.Fatalf("expected cleanup success, got %+v", resp)
	}
}

func newBenchmarkManagerFixture(t *testing.T) (*Manager, string) {
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

	st, err := store.New(gormDB, store.Options{})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	endpoint := "http://127.0.0.1:9000"
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	forcePathStyle := true
	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderS3Compatible,
		Name:                  "benchmark-profile",
		Endpoint:              &endpoint,
		Region:                &region,
		AccessKeyID:           &accessKey,
		SecretAccessKey:       &secretKey,
		ForcePathStyle:        &forcePathStyle,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}

	manager := NewManager(Config{
		Store:            st,
		DataDir:          dataDir,
		Hub:              ws.NewHub(),
		Concurrency:      1,
		UploadSessionTTL: time.Minute,
	})

	return manager, profile.ID
}
