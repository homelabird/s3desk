package api

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"s3desk/internal/config"
	"s3desk/internal/db"
	"s3desk/internal/models"
	"s3desk/internal/profileendpoint"
)

func TestCanceledAPIRequestDoesNotResolveProfileEndpoints(t *testing.T) {
	for _, operation := range []string{"create profile", "rclone start", "rclone capture", "rclone stdin", "FTP transfer"} {
		t.Run(operation, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			lookups := 0
			restoreDNS := profileendpoint.SetLookupHooksForTest(
				func(context.Context, string) (string, error) { lookups++; return "", errors.New("no cname") },
				func(context.Context, string) ([]net.IPAddr, error) {
					lookups++
					return []net.IPAddr{{IP: net.ParseIP("192.0.2.8")}}, nil
				},
			)
			defer restoreDNS()
			started := false
			restoreProcesses := setAPIProcessTestHooks(apiProcessTestHooks{
				startRclone: func(_ *server, ctx context.Context, _ models.ProfileSecrets, _ []string, _ string) (*rcloneProcess, error) {
					started = true
					return nil, ctx.Err()
				},
				runRcloneCapture: func(_ *server, ctx context.Context, _ models.ProfileSecrets, _ []string, _ string) (string, string, error) {
					started = true
					return "", "", ctx.Err()
				},
				runRcloneStdin: func(_ *server, ctx context.Context, _ models.ProfileSecrets, _ []string, _ string, _ io.Reader) (string, error) {
					started = true
					return "", ctx.Err()
				},
			})
			defer restoreProcesses()
			s := &server{}
			profile := models.ProfileSecrets{Provider: models.ProfileProviderS3Compatible, Endpoint: "https://storage.example"}
			var err error
			switch operation {
			case "create profile":
				r := httptest.NewRequest(http.MethodPost, "/api/v1/profiles", strings.NewReader(`{"name":"demo","endpoint":"https://storage.example","accessKeyId":"test","secretAccessKey":"test"}`)).WithContext(ctx)
				err = newProfileWriteHTTPService(s).prepareCreateProfile(r).err
			case "rclone start":
				_, err = s.startRclone(ctx, profile, nil, "cancel")
			case "rclone capture":
				_, _, err = s.runRcloneCapture(ctx, profile, nil, "cancel")
			case "rclone stdin":
				_, err = s.runRcloneStdin(ctx, profile, nil, "cancel", strings.NewReader(""))
			case "FTP transfer":
				_, _, _, _, err = s.prepareServerBackupTransfer(ctx, serverBackupTransferLocation{Protocol: serverBackupProtocolFTP, Host: "storage.example", Username: "test", Path: "backup.tgz"}, false, "")
			}
			if lookups != 0 || started {
				t.Fatalf("canceled request performed %d DNS lookups; process hook started=%v", lookups, started)
			}
			if operation == "create profile" {
				if err == nil || !strings.Contains(err.Error(), context.Canceled.Error()) {
					t.Fatalf("error=%v, want canceled preparation", err)
				}
			} else if !errors.Is(err, context.Canceled) {
				t.Fatalf("error=%v, want context.Canceled", err)
			}
		})
	}
}

func TestPortablePreviewDNSReceivesRequestCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	restoreDNS := profileendpoint.SetLookupHooksForTest(
		func(lookupCtx context.Context, _ string) (string, error) {
			cancel()
			if !errors.Is(lookupCtx.Err(), context.Canceled) {
				t.Error("portable preview DNS did not inherit request cancellation")
			}
			return "", lookupCtx.Err()
		},
		func(context.Context, string) ([]net.IPAddr, error) {
			t.Error("portable preview continued IP lookup after request cancellation")
			return []net.IPAddr{{IP: net.ParseIP("192.0.2.8")}}, nil
		},
	)
	defer restoreDNS()
	entityFiles := map[string][]byte{"profiles": []byte(`{"ID":"01ARZ3NDEKTSV4RRFFQ69G5FAV","Name":"demo","Provider":"s3_compatible","ConfigJSON":"{}","SecretsJSON":"{}","Endpoint":"https://storage.example","Region":"us-east-1","AccessKeyID":"test","SecretAccessKey":"test","CreatedAt":"2026-05-19T00:00:00Z","UpdatedAt":"2026-05-19T00:00:00Z"}` + "\n")}
	s := &server{cfg: config.Config{DataDir: t.TempDir()}}
	svc := portableImportArchiveService{
		dbBackend: "sqlite",
		extract: func(context.Context, io.Reader, string, string, bool) (string, models.ServerMigrationManifest, map[string][]byte, string, error) {
			return "", models.ServerMigrationManifest{FormatVersion: portableBackupFormatVersion, SchemaVersion: portableBackupSchemaVersion}, entityFiles, "", nil
		},
		buildResponse: func(ctx context.Context, mode string, dbBackend db.Backend, manifest models.ServerMigrationManifest, files map[string][]byte) models.ServerPortableImportResponse {
			return s.buildPortableImportResponse(ctx, mode, dbBackend, manifest, files)
		},
	}
	_, _, err := svc.process(ctx, strings.NewReader(""), portableImportModeDryRun, "", "", false)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error=%v, want context.Canceled", err)
	}
}
