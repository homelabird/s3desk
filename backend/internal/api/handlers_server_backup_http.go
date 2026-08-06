package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"time"

	"s3desk/internal/db"
	"s3desk/internal/models"
)

type serverBackupPreparationError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type serverBackupHTTPService struct {
	dbBackend       string
	encryptionKey   string
	maxRestoreBytes int64
	exportArchive   func(
		ctx context.Context,
		archivePath string,
		scope string,
		confidentiality string,
		includeThumbnails bool,
		secrets serverBackupSecrets,
	) (models.ServerMigrationManifest, error)
	restoreArchive func(
		ctx context.Context,
		src io.Reader,
		backupPassword string,
		encryptionKey string,
	) (models.ServerRestoreResponse, error)
	openRequest func(
		w http.ResponseWriter,
		r *http.Request,
		options serverRestoreBundleOpenOptions,
	) (multipartFile io.ReadCloser, bundlePassword string, cleanup func(), ok bool)
	now func() time.Time
}

func newServerBackupHTTPService(s *server) serverBackupHTTPService {
	return serverBackupHTTPService{
		dbBackend:       s.cfg.DBBackend,
		encryptionKey:   s.cfg.EncryptionKey,
		maxRestoreBytes: s.cfg.ServerRestoreMaxBytes,
		exportArchive:   s.writeServerBackupArchive,
		restoreArchive:  s.restoreServerBackupArchive,
		openRequest:     openServerRestoreBundleRequest,
		now:             time.Now,
	}
}

func (e *serverBackupPreparationError) Error() string {
	return e.message
}

func newServerBackupPreparationError(status int, code, message string, details map[string]any) *serverBackupPreparationError {
	return &serverBackupPreparationError{
		status:  status,
		code:    code,
		message: message,
		details: details,
	}
}

func (svc serverBackupHTTPService) currentTime() time.Time {
	if svc.now != nil {
		return svc.now().UTC()
	}
	return time.Now().UTC()
}

func (svc serverBackupHTTPService) prepareGetServerBackup(r *http.Request) (string, string, string, bool, serverBackupSecrets, error) {
	scope, err := parseServerBackupScope(r)
	if err != nil {
		return "", "", "", false, serverBackupSecrets{}, newServerBackupPreparationError(
			http.StatusBadRequest,
			"invalid_request",
			err.Error(),
			map[string]any{
				"supportedScopes": []string{serverBackupScopeFull, serverBackupScopeCacheMetadata, serverBackupScopePortable},
			},
		)
	}

	confidentiality, err := parseServerBackupConfidentiality(r)
	if err != nil {
		return "", "", "", false, serverBackupSecrets{}, newServerBackupPreparationError(
			http.StatusBadRequest,
			"invalid_request",
			err.Error(),
			map[string]any{
				"supportedConfidentialityModes": []string{serverBackupConfidentialityClear, serverBackupConfidentialityEncrypted},
			},
		)
	}

	backupPassword, err := parseServerBackupPasswordHeader(r)
	if err != nil {
		return "", "", "", false, serverBackupSecrets{}, newServerBackupPreparationError(
			http.StatusBadRequest,
			"invalid_request",
			err.Error(),
			nil,
		)
	}

	secrets, err := resolveServerBackupExportSecrets(confidentiality, backupPassword, svc.encryptionKey)
	if err != nil {
		return "", "", "", false, serverBackupSecrets{}, newServerBackupPreparationError(
			http.StatusConflict,
			"backup_confidentiality_unavailable",
			err.Error(),
			nil,
		)
	}

	dbBackend, err := db.ParseBackend(svc.dbBackend)
	if err != nil {
		return "", "", "", false, serverBackupSecrets{}, newServerBackupPreparationError(
			http.StatusInternalServerError,
			"server_config_invalid",
			"failed to resolve db backend",
			map[string]any{"error": err.Error()},
		)
	}
	if dbBackend != db.BackendSQLite && scope != serverBackupScopePortable {
		return "", "", "", false, serverBackupSecrets{}, newServerBackupPreparationError(
			http.StatusConflict,
			"backup_unsupported",
			"server backup currently supports only sqlite-backed servers",
			map[string]any{"dbBackend": string(dbBackend)},
		)
	}

	includeThumbnails, err := parsePortableBackupIncludeThumbnails(r)
	if err != nil {
		return "", "", "", false, serverBackupSecrets{}, newServerBackupPreparationError(
			http.StatusBadRequest,
			"invalid_request",
			err.Error(),
			map[string]any{"includeThumbnails": r.URL.Query().Get("includeThumbnails")},
		)
	}

	return scope, confidentiality, backupPassword, includeThumbnails, secrets, nil
}

func (svc serverBackupHTTPService) executePreparedExport(
	ctx context.Context,
	scope string,
	confidentiality string,
	includeThumbnails bool,
	secrets serverBackupSecrets,
) (string, string, *os.File, os.FileInfo, error) {
	tmp, err := os.CreateTemp("", "s3desk-backup-*.tar.gz")
	if err != nil {
		return "", "", nil, nil, err
	}
	tmpPath := tmp.Name()
	if closeErr := tmp.Close(); closeErr != nil {
		_ = os.Remove(tmpPath)
		return "", "", nil, nil, closeErr
	}

	if _, err := svc.exportArchive(
		ctx,
		tmpPath,
		scope,
		confidentiality,
		includeThumbnails,
		secrets,
	); err != nil {
		_ = os.Remove(tmpPath)
		return "", "", nil, nil, err
	}

	file, err := os.Open(tmpPath) // #nosec G304 -- tmpPath is a server-created temporary backup bundle path.
	if err != nil {
		_ = os.Remove(tmpPath)
		return "", "", nil, nil, err
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		_ = os.Remove(tmpPath)
		return "", "", nil, nil, err
	}

	return fmt.Sprintf(
		"%s-%s.tar.gz",
		backupFilenamePrefix(scope, confidentiality),
		svc.currentTime().Format("20060102-150405"),
	), tmpPath, file, info, nil
}

func (svc serverBackupHTTPService) executeGet(r *http.Request) (string, string, *os.File, os.FileInfo, error) {
	scope, confidentiality, _, includeThumbnails, secrets, err := svc.prepareGetServerBackup(r)
	if err != nil {
		return "", "", nil, nil, err
	}
	return svc.executePreparedExport(r.Context(), scope, confidentiality, includeThumbnails, secrets)
}

func (svc serverBackupHTTPService) openOptions() serverRestoreBundleOpenOptions {
	return serverRestoreBundleOpenOptions{
		MaxBytes:        svc.maxRestoreBytes,
		TooLargeMessage: "backup bundle exceeds restore upload limit",
		OnOpenError:     writeServerRestoreBundleOpenError,
	}
}

func (svc serverBackupHTTPService) executeRestore(
	w http.ResponseWriter,
	r *http.Request,
) (*models.ServerRestoreResponse, error, bool) {
	file, backupPassword, cleanup, ok := svc.openRequest(w, r, svc.openOptions())
	if !ok {
		return nil, nil, false
	}
	defer cleanup()

	resp, err := svc.restoreArchive(r.Context(), file, backupPassword, svc.encryptionKey)
	if err != nil {
		return nil, err, true
	}
	return &resp, nil, true
}

func (svc serverBackupHTTPService) handleGetServerBackup(w http.ResponseWriter, r *http.Request) {
	downloadName, archivePath, archiveFile, archiveInfo, err := svc.executeGet(r)
	if err != nil {
		var prepErr *serverBackupPreparationError
		if errors.As(err, &prepErr) {
			resp := buildAPIErrorResponse(prepErr.code, prepErr.message, prepErr.details)
			writeJSON(w, prepErr.status, &resp)
			return
		}
		resp := buildAPIErrorResponse(
			"backup_failed",
			"failed to create backup bundle",
			map[string]any{"error": err.Error()},
		)
		writeJSON(w, http.StatusInternalServerError, &resp)
		return
	}
	defer func() {
		if archiveFile != nil {
			_ = archiveFile.Close()
		}
		if archivePath != "" {
			_ = os.Remove(archivePath)
		}
	}()
	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": downloadName}))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", archiveInfo.Size()))
	http.ServeContent(w, r, downloadName, archiveInfo.ModTime(), archiveFile)
}

func (svc serverBackupHTTPService) handleRestoreServerBackup(w http.ResponseWriter, r *http.Request) {
	response, err, ok := svc.executeRestore(w, r)
	if !ok {
		return
	}
	if err == nil {
		writeJSON(w, http.StatusCreated, response)
		return
	}
	if limitErr, ok := asServerRestoreExtractLimitError(err); ok {
		writeServerRestoreExtractLimitError(w, "bundle_too_large", "backup bundle exceeds restore extracted payload limit", limitErr)
		return
	}
	var preflightErr serverRestorePreflightError
	if errors.As(err, &preflightErr) {
		resp := buildAPIErrorResponse(
			"restore_preflight_failed",
			"failed restore preflight before staging",
			map[string]any{
				"error":          preflightErr.Error(),
				"path":           preflightErr.Path,
				"requiredBytes":  preflightErr.RequiredBytes,
				"availableBytes": preflightErr.AvailableBytes,
			},
		)
		writeJSON(w, http.StatusConflict, &resp)
		return
	}
	resp := buildAPIErrorResponse(
		"restore_failed",
		"failed to restore backup bundle",
		map[string]any{"error": err.Error()},
	)
	writeJSON(w, http.StatusBadRequest, &resp)
}
