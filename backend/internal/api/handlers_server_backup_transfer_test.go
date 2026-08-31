package api

import (
	"context"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/db"
	"s3desk/internal/jobs"
	"s3desk/internal/models"
)

func TestServerBackupNFSTransferRoundTrip(t *testing.T) {
	for _, tt := range []struct {
		name     string
		maxBytes int64
	}{
		{name: "bounded", maxBytes: 1024},
		{name: "unlimited", maxBytes: 0},
		{name: "maximum", maxBytes: math.MaxInt64},
	} {
		t.Run(tt.name, func(t *testing.T) {
			root := t.TempDir()
			source := filepath.Join(t.TempDir(), "backup.tar.gz")
			want := []byte("validated backup bundle")
			if err := os.WriteFile(source, want, 0o600); err != nil {
				t.Fatal(err)
			}

			srv := &server{cfg: config.Config{AllowedLocalDirs: []string{root}, ServerRestoreMaxBytes: tt.maxBytes}}
			target := filepath.Join(root, "nested", "backup.tar.gz")
			location := serverBackupTransferLocation{Protocol: serverBackupProtocolNFS, Path: target}
			stored, err := srv.writeServerBackupTransfer(t.Context(), source, "backup.tar.gz", location)
			if err != nil {
				t.Fatalf("writeServerBackupTransfer() error=%v", err)
			}
			fetched, cleanup, err := srv.readServerBackupTransfer(t.Context(), location)
			if err != nil {
				t.Fatalf("readServerBackupTransfer() error=%v", err)
			}
			defer cleanup()
			got, err := os.ReadFile(fetched)
			if err != nil {
				t.Fatal(err)
			}
			if stored != target || string(got) != string(want) {
				t.Fatalf("stored=%q data=%q, want %q %q", stored, got, target, want)
			}
		})
	}
}

func TestServerBackupObjectStorageRestoreUnlimitedOmitsRcloneLimit(t *testing.T) {
	lockTestEnv(t)
	st, _, _, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)
	want := []byte("remote backup bundle")
	installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
		if len(args) != 3 || args[0] != "copyto" || args[1] != "remote:bucket/backup.tar.gz" {
			t.Fatalf("rclone args=%v, want copyto without --max-transfer", args)
		}
		if err := os.WriteFile(args[2], want, 0o600); err != nil {
			t.Fatal(err)
		}
		return "", "", nil
	})

	srv := &server{cfg: config.Config{ServerRestoreMaxBytes: 0}, store: st}
	fetched, cleanup, err := srv.readServerBackupTransfer(t.Context(), serverBackupTransferLocation{
		Protocol:  serverBackupProtocolObjectStorage,
		ProfileID: profile.ID,
		Bucket:    "bucket",
		Path:      "backup.tar.gz",
	})
	if err != nil {
		t.Fatalf("readServerBackupTransfer() error=%v", err)
	}
	defer cleanup()
	got, err := os.ReadFile(fetched)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Fatalf("data=%q, want %q", got, want)
	}
}

func TestServerBackupNFSTransferRejectsOutsideAllowedRoots(t *testing.T) {
	root := t.TempDir()
	srv := &server{cfg: config.Config{AllowedLocalDirs: []string{root}}}
	_, _, _, _, err := srv.prepareServerBackupTransfer(t.Context(), serverBackupTransferLocation{
		Protocol: serverBackupProtocolNFS,
		Path:     filepath.Join(t.TempDir(), "backup.tar.gz"),
	}, true, "backup.tar.gz")
	if err == nil {
		t.Fatal("expected path outside ALLOWED_LOCAL_DIRS to be rejected")
	}
}

func TestHandleTransferServerBackupRejectsInvalidLocationBeforeBackupPreparation(t *testing.T) {
	lockTestEnv(t)
	installJobsEnsureRcloneHook(t, func(context.Context) (string, string, error) {
		return "", "", jobs.ErrRcloneNotFound
	})

	allowedRoot := t.TempDir()
	tests := []struct {
		name        string
		allowedDirs []string
		location    serverBackupTransferLocation
		status      int
		code        string
	}{
		{
			name:     "missing path",
			location: serverBackupTransferLocation{Protocol: serverBackupProtocolNFS},
			status:   http.StatusBadRequest,
			code:     "invalid_request",
		},
		{
			name:        "NFS path outside allowed roots",
			allowedDirs: []string{allowedRoot},
			location: serverBackupTransferLocation{
				Protocol: serverBackupProtocolNFS,
				Path:     filepath.Join(t.TempDir(), "backup.tar.gz"),
			},
			status: http.StatusBadGateway,
			code:   "backup_transfer_failed",
		},
		{
			name: "missing object storage profile",
			location: serverBackupTransferLocation{
				Protocol:  serverBackupProtocolObjectStorage,
				ProfileID: "missing-profile",
				Bucket:    "bucket",
				Path:      "backup.tar.gz",
			},
			status: http.StatusBadGateway,
			code:   "backup_transfer_failed",
		},
		{
			name: "FTP configuration unavailable",
			location: serverBackupTransferLocation{
				Protocol: serverBackupProtocolFTP,
				Host:     "127.0.0.1",
				Username: "operator",
				Path:     "backup.tar.gz",
			},
			status: http.StatusBadGateway,
			code:   "backup_transfer_failed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, srv, _ := newTestJobsServerWithAdvertisedBackend(
				t,
				testEncryptionKey(),
				false,
				tt.allowedDirs,
				db.Backend("invalid"),
			)

			res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/server/backup/transfer", serverBackupTransferRequest{Location: tt.location})
			defer res.Body.Close()
			if res.StatusCode != tt.status {
				t.Fatalf("status=%d, want %d", res.StatusCode, tt.status)
			}
			var resp models.ErrorResponse
			decodeJSONResponse(t, res, &resp)
			if resp.Error.Code != tt.code {
				t.Fatalf("error.code=%q, want %q", resp.Error.Code, tt.code)
			}
		})
	}
}

func TestHandleTransferServerBackupCleansUpSuccessfulFTPPreflight(t *testing.T) {
	lockTestEnv(t)
	fakeRclone := writeFakeRclone(t, `
if [ "$1" = "obscure" ] && [ "$2" = "-" ]; then
  printf 'obscured-password'
  exit 0
fi
exit 1
`)
	installJobsEnsureRcloneHook(t, func(context.Context) (string, string, error) {
		return fakeRclone, "rclone v1.66.0", nil
	})

	_, _, srv, dataDir := newTestJobsServerWithAdvertisedBackend(t, testEncryptionKey(), false, nil, db.Backend("invalid"))
	res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/server/backup/transfer", serverBackupTransferRequest{
		Location: serverBackupTransferLocation{
			Protocol: serverBackupProtocolFTP,
			Host:     "127.0.0.1",
			Username: "operator",
			Password: "secret",
			Path:     "backup.tar.gz",
		},
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusInternalServerError)
	}
	files, err := filepath.Glob(filepath.Join(dataDir, "tmp", "rclone", "*.rclone.conf"))
	if err != nil {
		t.Fatalf("glob preflight configs: %v", err)
	}
	if len(files) != 0 {
		t.Fatalf("preflight configs were not cleaned up: %v", files)
	}
}
