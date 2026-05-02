package api

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"s3desk/internal/models"
)

func TestPortableImportHTTPService_HandlePreviewPortableImportWritesOK(t *testing.T) {
	t.Parallel()

	writeStatus := 0
	writeBody := (*models.ServerPortableImportResponse)(nil)
	svc := portableImportHTTPService{
		maxBytes:      1024,
		encryptionKey: "enc-key",
		openRequest: func(_ http.ResponseWriter, _ *http.Request, options serverRestoreBundleOpenOptions) (io.ReadCloser, string, func(), bool) {
			if options.MaxBytes != 1024 {
				t.Fatalf("options.MaxBytes=%d, want 1024", options.MaxBytes)
			}
			return io.NopCloser(bytes.NewReader(nil)), "operator-secret", func() {}, true
		},
		processArchive: func(_ context.Context, _ io.Reader, mode string, backupPassword string, encryptionKey string) (models.ServerPortableImportResponse, portableImportArchiveOutcome, error) {
			if mode != portableImportModeDryRun {
				t.Fatalf("mode=%q, want %q", mode, portableImportModeDryRun)
			}
			if backupPassword != "operator-secret" {
				t.Fatalf("backupPassword=%q, want operator-secret", backupPassword)
			}
			if encryptionKey != "enc-key" {
				t.Fatalf("encryptionKey=%q, want enc-key", encryptionKey)
			}
			return models.ServerPortableImportResponse{Mode: mode}, portableImportArchiveOutcomeDryRun, nil
		},
		writeError: func(http.ResponseWriter, error) {
			t.Fatal("expected no error")
		},
		writeResponse: func(_ http.ResponseWriter, status int, body any) {
			writeStatus = status
			resp, ok := body.(models.ServerPortableImportResponse)
			if !ok {
				t.Fatalf("response body type = %T", body)
			}
			writeBody = &resp
		},
	}

	svc.handlePreviewPortableImport(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/api/v1/server/import-portable/preview", nil))

	if writeStatus != http.StatusOK {
		t.Fatalf("writeStatus=%d, want %d", writeStatus, http.StatusOK)
	}
	if writeBody == nil || writeBody.Mode != portableImportModeDryRun {
		t.Fatalf("writeBody=%#v, want dry_run response", writeBody)
	}
}

func TestPortableImportHTTPService_HandleImportPortableBackupWritesCreated(t *testing.T) {
	t.Parallel()

	svc := portableImportHTTPService{
		maxBytes:      1024,
		encryptionKey: "enc-key",
		openRequest: func(_ http.ResponseWriter, _ *http.Request, options serverRestoreBundleOpenOptions) (io.ReadCloser, string, func(), bool) {
			if options.MaxBytes != 1024 {
				t.Fatalf("options.MaxBytes=%d, want 1024", options.MaxBytes)
			}
			return io.NopCloser(bytes.NewReader(nil)), "operator-secret", func() {}, true
		},
		processArchive: func(_ context.Context, _ io.Reader, mode string, backupPassword string, encryptionKey string) (models.ServerPortableImportResponse, portableImportArchiveOutcome, error) {
			if mode != portableImportModeReplace {
				t.Fatalf("mode=%q, want %q", mode, portableImportModeReplace)
			}
			if backupPassword != "operator-secret" {
				t.Fatalf("backupPassword=%q, want operator-secret", backupPassword)
			}
			if encryptionKey != "enc-key" {
				t.Fatalf("encryptionKey=%q, want enc-key", encryptionKey)
			}
			return models.ServerPortableImportResponse{Mode: mode}, portableImportArchiveOutcomeApplied, nil
		},
		writeError: func(http.ResponseWriter, error) {
			t.Fatal("expected no error")
		},
	}

	writeStatus := 0
	writeBody := (*models.ServerPortableImportResponse)(nil)
	svc.writeResponse = func(_ http.ResponseWriter, status int, body any) {
		writeStatus = status
		resp, ok := body.(models.ServerPortableImportResponse)
		if !ok {
			t.Fatalf("response body type = %T", body)
		}
		writeBody = &resp
	}

	svc.handleImportPortableBackup(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/api/v1/server/import-portable", nil))

	if writeStatus != http.StatusCreated {
		t.Fatalf("writeStatus=%d, want %d", writeStatus, http.StatusCreated)
	}
	if writeBody == nil || writeBody.Mode != portableImportModeReplace {
		t.Fatalf("writeBody=%#v, want replace response", writeBody)
	}
}

func TestPortableImportHTTPService_OpenOptions_UsesConfiguredLimitsAndErrorWriter(t *testing.T) {
	t.Parallel()

	errorCalls := 0
	svc := portableImportHTTPService{
		maxBytes:        2048,
		tooLargeMessage: "bundle too large",
		writeError: func(_ http.ResponseWriter, err error) {
			if err == nil || err.Error() != "open failed" {
				t.Fatalf("err=%v, want open failed", err)
			}
			errorCalls++
		},
	}

	options := svc.openOptions()
	if options.MaxBytes != 2048 {
		t.Fatalf("options.MaxBytes=%d, want 2048", options.MaxBytes)
	}
	if options.TooLargeMessage != "bundle too large" {
		t.Fatalf("options.TooLargeMessage=%q, want bundle too large", options.TooLargeMessage)
	}

	options.OnOpenError(httptest.NewRecorder(), errors.New("open failed"))
	if errorCalls != 1 {
		t.Fatalf("errorCalls=%d, want 1", errorCalls)
	}
}

func TestPortableImportHTTPService_HandleImportPortableBackupReturnsWhenOpenFails(t *testing.T) {
	t.Parallel()

	errorCalls := 0
	svc := portableImportHTTPService{
		openRequest: func(w http.ResponseWriter, _ *http.Request, options serverRestoreBundleOpenOptions) (io.ReadCloser, string, func(), bool) {
			options.OnOpenError(w, errors.New("open failed"))
			return nil, "", func() {}, false
		},
		writeError: func(_ http.ResponseWriter, err error) {
			if err == nil || err.Error() != "open failed" {
				t.Fatalf("err=%v, want open failed", err)
			}
			errorCalls++
		},
	}

	svc.writeResponse = func(http.ResponseWriter, int, any) {
		t.Fatal("expected no response write when open fails")
	}

	svc.handleImportPortableBackup(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/api/v1/server/import-portable", nil))

	if errorCalls != 1 {
		t.Fatalf("errorCalls=%d, want 1", errorCalls)
	}
}

func TestPortableImportHTTPService_HandleReplaceWritesCreatedOrOKByBlockerState(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		response   models.ServerPortableImportResponse
		outcome    portableImportArchiveOutcome
		wantStatus int
	}{
		{
			name:       "created without blockers",
			response:   models.ServerPortableImportResponse{Mode: portableImportModeReplace},
			outcome:    portableImportArchiveOutcomeApplied,
			wantStatus: http.StatusCreated,
		},
		{
			name: "ok with blockers",
			response: models.ServerPortableImportResponse{
				Mode: portableImportModeReplace,
				Preflight: models.ServerPortableImportPreflight{
					Blockers: []string{"portable bundle blocked"},
				},
			},
			outcome:    portableImportArchiveOutcomeBlocked,
			wantStatus: http.StatusOK,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			writeStatus := 0
			svc := portableImportHTTPService{
				openRequest: func(_ http.ResponseWriter, _ *http.Request, _ serverRestoreBundleOpenOptions) (io.ReadCloser, string, func(), bool) {
					return io.NopCloser(bytes.NewReader(nil)), "", func() {}, true
				},
				processArchive: func(_ context.Context, _ io.Reader, mode string, _, _ string) (models.ServerPortableImportResponse, portableImportArchiveOutcome, error) {
					if mode != portableImportModeReplace {
						t.Fatalf("mode=%q, want %q", mode, portableImportModeReplace)
					}
					return tc.response, tc.outcome, nil
				},
				writeError: func(http.ResponseWriter, error) {
					t.Fatal("expected no error")
				},
				writeResponse: func(_ http.ResponseWriter, status int, _ any) {
					writeStatus = status
				},
			}

			svc.handleImportPortableBackup(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/api/v1/server/import-portable", nil))

			if writeStatus != tc.wantStatus {
				t.Fatalf("writeStatus=%d, want %d", writeStatus, tc.wantStatus)
			}
		})
	}
}

func TestPortableImportHTTPService_HandleProcessErrorUsesPortableErrorWriter(t *testing.T) {
	t.Parallel()

	wantErr := errors.New("portable import failed")
	wroteError := false
	svc := portableImportHTTPService{
		openRequest: func(_ http.ResponseWriter, _ *http.Request, _ serverRestoreBundleOpenOptions) (io.ReadCloser, string, func(), bool) {
			return io.NopCloser(bytes.NewReader(nil)), "", func() {}, true
		},
		processArchive: func(context.Context, io.Reader, string, string, string) (models.ServerPortableImportResponse, portableImportArchiveOutcome, error) {
			return models.ServerPortableImportResponse{}, "", wantErr
		},
		writeError: func(_ http.ResponseWriter, err error) {
			if !errors.Is(err, wantErr) {
				t.Fatalf("err=%v, want %v", err, wantErr)
			}
			wroteError = true
		},
		writeResponse: func(http.ResponseWriter, int, any) {
			t.Fatal("expected no response write on process error")
		},
	}

	svc.handleImportPortableBackup(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/api/v1/server/import-portable", nil))

	if !wroteError {
		t.Fatal("expected error writer to be called")
	}
}

func TestPortableImportResponseStatus_UsesProcessOutcome(t *testing.T) {
	t.Parallel()

	if got := portableImportResponseStatus(portableImportArchiveOutcomeDryRun); got != http.StatusOK {
		t.Fatalf("dry-run status=%d, want %d", got, http.StatusOK)
	}
	if got := portableImportResponseStatus(portableImportArchiveOutcomeBlocked); got != http.StatusOK {
		t.Fatalf("blocked status=%d, want %d", got, http.StatusOK)
	}
	if got := portableImportResponseStatus(portableImportArchiveOutcomeApplied); got != http.StatusCreated {
		t.Fatalf("applied status=%d, want %d", got, http.StatusCreated)
	}
}

func TestPortableImportHTTPService_WriteHandleResult_WritesTypedResponse(t *testing.T) {
	t.Parallel()

	writeStatus := 0
	writeBody := (*models.ServerPortableImportResponse)(nil)
	svc := portableImportHTTPService{
		writeResponse: func(_ http.ResponseWriter, status int, body any) {
			writeStatus = status
			resp, ok := body.(models.ServerPortableImportResponse)
			if !ok {
				t.Fatalf("body type=%T, want models.ServerPortableImportResponse", body)
			}
			writeBody = &resp
		},
	}

	status := http.StatusCreated
	response := models.ServerPortableImportResponse{Mode: portableImportModeReplace}
	svc.writeResponse(httptest.NewRecorder(), status, response)

	if writeStatus != http.StatusCreated {
		t.Fatalf("writeStatus=%d, want %d", writeStatus, http.StatusCreated)
	}
	if writeBody == nil || !reflect.DeepEqual(*writeBody, response) {
		t.Fatalf("writeBody=%#v, want %#v", writeBody, response)
	}
}
