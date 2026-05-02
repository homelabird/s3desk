package api

import (
	"context"
	"io"
	"net/http"

	"s3desk/internal/models"
)

type portableImportHTTPService struct {
	maxBytes      int64
	encryptionKey string
	openRequest   func(
		w http.ResponseWriter,
		r *http.Request,
		options serverRestoreBundleOpenOptions,
	) (multipartFile io.ReadCloser, bundlePassword string, cleanup func(), ok bool)
	processArchive func(
		ctx context.Context,
		src io.Reader,
		mode string,
		backupPassword string,
		encryptionKey string,
	) (models.ServerPortableImportResponse, portableImportArchiveOutcome, error)
	writeError      func(http.ResponseWriter, error)
	writeResponse   func(http.ResponseWriter, int, any)
	tooLargeMessage string
}

func newPortableImportHTTPService(s *server) portableImportHTTPService {
	return portableImportHTTPService{
		maxBytes:      s.cfg.ServerRestoreMaxBytes,
		encryptionKey: s.cfg.EncryptionKey,
		openRequest:   openServerRestoreBundleRequest,
		processArchive: func(ctx context.Context, src io.Reader, mode string, backupPassword string, encryptionKey string) (models.ServerPortableImportResponse, portableImportArchiveOutcome, error) {
			return s.processPortableImportArchive(ctx, src, mode, backupPassword, encryptionKey)
		},
		writeError:      writePortableImportError,
		writeResponse:   writeJSON,
		tooLargeMessage: "backup bundle exceeds portable import upload limit",
	}
}

func (s *server) handlePreviewPortableImport(w http.ResponseWriter, r *http.Request) {
	newPortableImportHTTPService(s).handlePreviewPortableImport(w, r)
}

func (s *server) handleImportPortableBackup(w http.ResponseWriter, r *http.Request) {
	newPortableImportHTTPService(s).handleImportPortableBackup(w, r)
}

func (svc portableImportHTTPService) handlePreviewPortableImport(w http.ResponseWriter, r *http.Request) {
	file, backupPassword, cleanup, ok := svc.openRequest(w, r, svc.openOptions())
	if !ok {
		return
	}
	defer cleanup()

	response, outcome, err := svc.processArchive(r.Context(), file, portableImportModeDryRun, backupPassword, svc.encryptionKey)
	if err != nil {
		svc.writeError(w, err)
		return
	}
	svc.writeResponse(w, portableImportResponseStatus(outcome), response)
}

func (svc portableImportHTTPService) handleImportPortableBackup(w http.ResponseWriter, r *http.Request) {
	file, backupPassword, cleanup, ok := svc.openRequest(w, r, svc.openOptions())
	if !ok {
		return
	}
	defer cleanup()

	response, outcome, err := svc.processArchive(r.Context(), file, portableImportModeReplace, backupPassword, svc.encryptionKey)
	if err != nil {
		svc.writeError(w, err)
		return
	}
	svc.writeResponse(w, portableImportResponseStatus(outcome), response)
}

func (svc portableImportHTTPService) openOptions() serverRestoreBundleOpenOptions {
	return serverRestoreBundleOpenOptions{
		MaxBytes:        svc.maxBytes,
		TooLargeMessage: svc.tooLargeMessage,
		OnOpenError:     svc.writeError,
	}
}

func portableImportResponseStatus(outcome portableImportArchiveOutcome) int {
	if outcome == portableImportArchiveOutcomeApplied {
		return http.StatusCreated
	}
	return http.StatusOK
}
