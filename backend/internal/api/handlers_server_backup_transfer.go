package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/processio"
	"s3desk/internal/profileendpoint"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/redact"
)

const (
	serverBackupProtocolObjectStorage = "object_storage"
	serverBackupProtocolFTP           = "ftp"
	serverBackupProtocolNFS           = "nfs"
)

type serverBackupTransferLocation struct {
	Protocol  string `json:"protocol"`
	ProfileID string `json:"profileId,omitempty"`
	Bucket    string `json:"bucket,omitempty"`
	Path      string `json:"path"`
	Host      string `json:"host,omitempty"`
	Port      int    `json:"port,omitempty"`
	Username  string `json:"username,omitempty"`
	Password  string `json:"password,omitempty"`
}

type serverBackupTransferRequest struct {
	Scope             string                       `json:"scope,omitempty"`
	Confidentiality   string                       `json:"confidentiality,omitempty"`
	BackupPassword    string                       `json:"backupPassword,omitempty"`
	IncludeThumbnails *bool                        `json:"includeThumbnails,omitempty"`
	Location          serverBackupTransferLocation `json:"location"`
}

type serverRestoreTransferRequest struct {
	BackupPassword string                       `json:"backupPassword,omitempty"`
	Location       serverBackupTransferLocation `json:"location"`
}

type serverBackupTransferResponse struct {
	Protocol  string `json:"protocol"`
	Location  string `json:"location"`
	Filename  string `json:"filename"`
	SizeBytes int64  `json:"sizeBytes"`
}

func (s *server) handleTransferServerBackup(w http.ResponseWriter, r *http.Request) {
	var req serverBackupTransferRequest
	if err := decodeJSON(r, &req); err != nil {
		writeServerBackupTransferError(w, http.StatusBadRequest, "invalid_request", "invalid backup transfer request", err)
		return
	}
	query := r.URL.Query()
	query.Set("scope", strings.TrimSpace(req.Scope))
	query.Set("confidentiality", strings.TrimSpace(req.Confidentiality))
	if req.IncludeThumbnails != nil {
		query.Set("includeThumbnails", strconv.FormatBool(*req.IncludeThumbnails))
	}
	r.URL.RawQuery = query.Encode()
	if req.BackupPassword != "" {
		r.Header.Set(serverBackupPasswordHeader, req.BackupPassword)
	}

	svc := newServerBackupHTTPService(s)
	name, archivePath, archiveFile, info, err := svc.executeGet(r)
	if err != nil {
		var prepErr *serverBackupPreparationError
		if errors.As(err, &prepErr) {
			resp := buildAPIErrorResponse(prepErr.code, prepErr.message, prepErr.details)
			writeJSON(w, prepErr.status, &resp)
			return
		}
		writeServerBackupTransferError(w, http.StatusInternalServerError, "backup_failed", "failed to create backup bundle", err)
		return
	}
	_ = archiveFile.Close()
	defer func() { _ = os.Remove(archivePath) }()

	location, err := s.writeServerBackupTransfer(r.Context(), archivePath, name, req.Location)
	if err != nil {
		writeServerBackupTransferError(w, http.StatusBadGateway, "backup_transfer_failed", "failed to store backup bundle", err)
		return
	}
	writeJSON(w, http.StatusCreated, &serverBackupTransferResponse{
		Protocol: strings.TrimSpace(req.Location.Protocol), Location: location, Filename: name, SizeBytes: info.Size(),
	})
}

func (s *server) handleTransferServerRestore(w http.ResponseWriter, r *http.Request) {
	var req serverRestoreTransferRequest
	if err := decodeJSON(r, &req); err != nil {
		writeServerBackupTransferError(w, http.StatusBadRequest, "invalid_request", "invalid restore transfer request", err)
		return
	}
	path, cleanup, err := s.readServerBackupTransfer(r.Context(), req.Location)
	if err != nil {
		writeServerBackupTransferError(w, http.StatusBadGateway, "restore_fetch_failed", "failed to fetch backup bundle", err)
		return
	}
	defer cleanup()
	file, err := os.Open(path) // #nosec G304 -- path is validated or a server-created temporary file.
	if err != nil {
		writeServerBackupTransferError(w, http.StatusBadRequest, "restore_failed", "failed to open backup bundle", err)
		return
	}
	defer func() { _ = file.Close() }()
	resp, err := s.restoreServerBackupArchive(r.Context(), file, req.BackupPassword, s.cfg.EncryptionKey)
	if err != nil {
		if limitErr, ok := asServerRestoreExtractLimitError(err); ok {
			writeServerRestoreExtractLimitError(w, "bundle_too_large", "backup bundle exceeds restore extracted payload limit", limitErr)
			return
		}
		var preflightErr serverRestorePreflightError
		if errors.As(err, &preflightErr) {
			resp := buildAPIErrorResponse("restore_preflight_failed", "failed restore preflight before staging", map[string]any{
				"error": preflightErr.Error(), "path": preflightErr.Path,
				"requiredBytes": preflightErr.RequiredBytes, "availableBytes": preflightErr.AvailableBytes,
			})
			writeJSON(w, http.StatusConflict, &resp)
			return
		}
		writeServerBackupTransferError(w, http.StatusBadRequest, "restore_failed", "failed to restore backup bundle", err)
		return
	}
	writeJSON(w, http.StatusCreated, &resp)
}

func (s *server) writeServerBackupTransfer(ctx context.Context, sourcePath, filename string, location serverBackupTransferLocation) (string, error) {
	target, profile, configPath, cleanup, err := s.prepareServerBackupTransfer(ctx, location, true, filename)
	if err != nil {
		return "", err
	}
	defer cleanup()
	if profile != nil {
		_, stderr, err := s.runRcloneCapture(ctx, *profile, []string{"copyto", sourcePath, target}, "server-backup-transfer")
		if err != nil {
			return "", fmt.Errorf("rclone copy failed: %s", redact.Diagnostic(strings.TrimSpace(stderr)))
		}
		return target, nil
	}
	if configPath != "" {
		if err := runServerBackupRclone(ctx, configPath, "copyto", sourcePath, target); err != nil {
			return "", err
		}
		return target, nil
	}
	if err := copyServerBackupFile(sourcePath, target, s.cfg.AllowedLocalDirs); err != nil {
		return "", err
	}
	return target, nil
}

func (s *server) readServerBackupTransfer(ctx context.Context, location serverBackupTransferLocation) (string, func(), error) {
	target, profile, configPath, cleanupConfig, err := s.prepareServerBackupTransfer(ctx, location, false, "")
	if err != nil {
		return "", func() {}, err
	}
	if profile == nil && configPath == "" {
		if err := validateLocalPathForRead(target, s.cfg.AllowedLocalDirs); err != nil {
			return "", func() {}, err
		}
		info, err := os.Stat(target)
		if err != nil {
			return "", func() {}, err
		}
		if info.IsDir() || info.Size() > s.cfg.ServerRestoreMaxBytes {
			return "", func() {}, errors.New("backup bundle is not a file or exceeds restore limit")
		}
		tmpPath, err := copyServerRestoreLocalFile(target, s.cfg.ServerRestoreMaxBytes)
		if err != nil {
			return "", func() {}, err
		}
		return tmpPath, func() { _ = os.Remove(tmpPath) }, nil
	}
	defer cleanupConfig()
	tmp, err := os.CreateTemp("", "s3desk-restore-transfer-*.tar.gz")
	if err != nil {
		return "", func() {}, err
	}
	tmpPath := tmp.Name()
	_ = tmp.Close()
	cleanup := func() { _ = os.Remove(tmpPath) }
	if profile != nil {
		_, stderr, runErr := s.runRcloneCapture(ctx, *profile, []string{"copyto", "--max-transfer", strconv.FormatInt(s.cfg.ServerRestoreMaxBytes, 10), target, tmpPath}, "server-restore-transfer")
		if runErr != nil {
			cleanup()
			return "", func() {}, fmt.Errorf("rclone copy failed: %s", redact.Diagnostic(strings.TrimSpace(stderr)))
		}
	} else if err := runServerBackupRclone(ctx, configPath, "copyto", "--max-transfer", strconv.FormatInt(s.cfg.ServerRestoreMaxBytes, 10), target, tmpPath); err != nil {
		cleanup()
		return "", func() {}, err
	}
	info, err := os.Stat(tmpPath)
	if err != nil || info.Size() > s.cfg.ServerRestoreMaxBytes {
		cleanup()
		return "", func() {}, errors.New("backup bundle exceeds restore limit")
	}
	return tmpPath, cleanup, nil
}

func (s *server) prepareServerBackupTransfer(ctx context.Context, location serverBackupTransferLocation, exporting bool, filename string) (string, *models.ProfileSecrets, string, func(), error) {
	protocol := strings.TrimSpace(location.Protocol)
	remotePath := strings.TrimSpace(location.Path)
	if remotePath == "" {
		return "", nil, "", func() {}, errors.New("location.path is required")
	}
	if len(remotePath) > 8192 {
		return "", nil, "", func() {}, errors.New("location.path is too long")
	}
	if err := rcloneconfig.ValidateSingleLineValue("location.path", remotePath); err != nil {
		return "", nil, "", func() {}, err
	}
	if exporting && strings.HasSuffix(remotePath, "/") {
		remotePath += filename
	}
	switch protocol {
	case serverBackupProtocolObjectStorage:
		if strings.TrimSpace(location.ProfileID) == "" || strings.TrimSpace(location.Bucket) == "" {
			return "", nil, "", func() {}, errors.New("location.profileId and location.bucket are required")
		}
		profile, ok, err := s.store.GetProfileSecrets(ctx, strings.TrimSpace(location.ProfileID))
		if err != nil {
			return "", nil, "", func() {}, err
		}
		if !ok {
			return "", nil, "", func() {}, errors.New("profile not found")
		}
		target := rcloneRemoteObject(strings.TrimSpace(location.Bucket), remotePath, profile.PreserveLeadingSlash)
		return target, &profile, "", func() {}, nil
	case serverBackupProtocolFTP:
		if len(location.Host) > 253 || len(location.Username) > 1024 || len(location.Password) > serverBackupPasswordMaxBytes {
			return "", nil, "", func() {}, errors.New("FTP connection field is too long")
		}
		if err := rcloneconfig.ValidateSingleLineValue("location.username", location.Username); err != nil {
			return "", nil, "", func() {}, err
		}
		if err := rcloneconfig.ValidateSingleLineValue("location.password", location.Password); err != nil {
			return "", nil, "", func() {}, err
		}
		host, err := profileendpoint.ResolveHost("location.host", location.Host, s.cfg.AllowRemote)
		if err != nil {
			return "", nil, "", func() {}, err
		}
		port := location.Port
		if port == 0 {
			port = 21
		}
		if port < 1 || port > 65535 || strings.TrimSpace(location.Username) == "" {
			return "", nil, "", func() {}, errors.New("location.port is invalid or location.username is required")
		}
		configPath, cleanup, err := writeServerBackupFTPConfig(ctx, s.cfg.DataDir, host, port, location.Username, location.Password)
		if err != nil {
			return "", nil, "", func() {}, err
		}
		return "remote:" + strings.TrimPrefix(remotePath, "/"), nil, configPath, cleanup, nil
	case serverBackupProtocolNFS:
		if exporting {
			if err := validateLocalPathForCreate(remotePath, s.cfg.AllowedLocalDirs); err != nil {
				return "", nil, "", func() {}, err
			}
		}
		return filepath.Clean(remotePath), nil, "", func() {}, nil
	default:
		return "", nil, "", func() {}, fmt.Errorf("unsupported location.protocol %q", protocol)
	}
}

func writeServerBackupFTPConfig(ctx context.Context, dataDir, host string, port int, username, password string) (string, func(), error) {
	rclonePath, _, err := jobs.EnsureRcloneCompatible(ctx)
	if err != nil {
		return "", func() {}, err
	}
	cmd := exec.CommandContext(ctx, rclonePath, "obscure", "-") // #nosec G204 -- resolved rclone binary; password is stdin, not argv.
	cmd.Stdin = strings.NewReader(password)
	obscured, err := cmd.Output()
	if err != nil {
		return "", func() {}, errors.New("failed to protect FTP password for rclone")
	}
	for field, value := range map[string]string{"host": host, "username": username, "password": strings.TrimSpace(string(obscured))} {
		if err := rcloneconfig.ValidateSingleLineValue(field, value); err != nil {
			return "", func() {}, err
		}
	}
	baseDir := strings.TrimSpace(dataDir)
	if baseDir == "" {
		baseDir = os.TempDir()
	}
	dir := filepath.Join(baseDir, "tmp", "rclone")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", func() {}, err
	}
	f, err := os.CreateTemp(dir, "api-server-backup-ftp-*.rclone.conf")
	if err != nil {
		return "", func() {}, err
	}
	path := f.Name()
	cleanup := func() { _ = os.Remove(path) }
	if err = f.Chmod(0o600); err == nil {
		_, err = fmt.Fprintf(f, "[remote]\ntype = ftp\nhost = %s\nport = %d\nuser = %s\npass = %s\n", host, port, username, strings.TrimSpace(string(obscured)))
	}
	if closeErr := f.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		cleanup()
		return "", func() {}, err
	}
	return path, cleanup, nil
}

func runServerBackupRclone(ctx context.Context, configPath string, args ...string) error {
	rclonePath, _, err := jobs.EnsureRcloneCompatible(ctx)
	if err != nil {
		return err
	}
	fullArgs := append([]string{"--config", configPath}, args...)
	cmd := exec.CommandContext(ctx, rclonePath, fullArgs...) // #nosec G204 -- resolved binary and validated internal arguments.
	jobs.ConfigureProcessGroup(cmd)
	stderr := processio.NewLimitBuffer(processio.DefaultStderrMaxBytes)
	cmd.Stdout = io.Discard
	cmd.Stderr = stderr
	err = cmd.Run()
	if err != nil {
		return fmt.Errorf("rclone copy failed: %s", redact.Diagnostic(strings.TrimSpace(stderr.String())))
	}
	return nil
}

func copyServerBackupFile(sourcePath, targetPath string, allowedRoots []string) error {
	if err := validateLocalPathForCreate(targetPath, allowedRoots); err != nil {
		return err
	}
	source, err := os.Open(sourcePath) // #nosec G304 -- server-created backup path.
	if err != nil {
		return err
	}
	defer func() { _ = source.Close() }()
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(targetPath), ".s3desk-backup-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer func() { _ = os.Remove(tmpPath) }()
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := io.Copy(tmp, source); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, targetPath)
}

func copyServerRestoreLocalFile(sourcePath string, maxBytes int64) (string, error) {
	source, err := os.Open(sourcePath) // #nosec G304 -- validated mounted backup source.
	if err != nil {
		return "", err
	}
	defer func() { _ = source.Close() }()
	tmp, err := os.CreateTemp("", "s3desk-restore-transfer-*.tar.gz")
	if err != nil {
		return "", err
	}
	tmpPath := tmp.Name()
	cleanup := func() { _ = os.Remove(tmpPath) }
	written, err := io.Copy(tmp, io.LimitReader(source, maxBytes+1))
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil || written > maxBytes {
		cleanup()
		if err != nil {
			return "", err
		}
		return "", errors.New("backup bundle exceeds restore limit")
	}
	return tmpPath, nil
}

func writeServerBackupTransferError(w http.ResponseWriter, status int, code, message string, err error) {
	details := map[string]any(nil)
	if err != nil {
		details = map[string]any{"error": redact.Diagnostic(err.Error())}
	}
	resp := buildAPIErrorResponse(code, message, details)
	writeJSON(w, status, &resp)
}
