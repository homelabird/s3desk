package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"strings"
	"time"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/rcloneerrors"
)

type rcloneListEntry struct {
	Path     string            `json:"Path"`
	Name     string            `json:"Name"`
	Size     int64             `json:"Size"`
	ModTime  string            `json:"ModTime"`
	MimeType string            `json:"MimeType"`
	IsDir    bool              `json:"IsDir"`
	IsBucket bool              `json:"IsBucket"`
	Hashes   map[string]string `json:"Hashes"`
	Metadata map[string]string `json:"Metadata"`
}

type rcloneProcess struct {
	stdout io.ReadCloser
	stderr *bytes.Buffer
	wait   func() error
}

var errRcloneListStop = errors.New("rclone list stop")

func rcloneRemoteBucket(bucket string) string {
	return rcloneconfig.RemoteBucket(bucket)
}

func rcloneRemoteDir(bucket, prefix string, preserveLeadingSlash bool) string {
	return rcloneconfig.RemoteDir(bucket, prefix, preserveLeadingSlash)
}

func rcloneRemoteObject(bucket, key string, preserveLeadingSlash bool) string {
	return rcloneconfig.RemoteObject(bucket, key, preserveLeadingSlash)
}

func (s *server) rcloneDownloadFlags() []string {
	flags := make([]string, 0, 6)
	if s.cfg.RcloneDownloadMultiThreadStreams > 0 {
		flags = append(flags, "--multi-thread-streams", fmt.Sprintf("%d", s.cfg.RcloneDownloadMultiThreadStreams))
	}
	if s.cfg.RcloneDownloadMultiThreadCutoffMiB > 0 {
		flags = append(flags, "--multi-thread-cutoff", fmt.Sprintf("%dM", s.cfg.RcloneDownloadMultiThreadCutoffMiB))
	}
	if s.cfg.RcloneDownloadBufferSizeMiB > 0 {
		flags = append(flags, "--buffer-size", fmt.Sprintf("%dM", s.cfg.RcloneDownloadBufferSizeMiB))
	}
	return flags
}

func (s *server) prepareRcloneConfig(profile models.ProfileSecrets, hint string) (path string, cleanup func(), err error) {
	return rcloneconfig.WriteTempConfig(s.cfg.DataDir, "api", hint, profile)
}

func (s *server) startRclone(ctx context.Context, profile models.ProfileSecrets, args []string, hint string) (*rcloneProcess, error) {
	rclonePath, _, err := jobs.EnsureRcloneCompatible(ctx)
	if err != nil {
		return nil, err
	}

	configPath, configCleanup, err := s.prepareRcloneConfig(profile, hint)
	if err != nil {
		return nil, err
	}

	tlsArgs, tlsCleanup, err := jobs.PrepareRcloneTLSFlags(profile)
	if err != nil {
		configCleanup()
		return nil, err
	}

	fullArgs := []string{"--config", configPath}
	fullArgs = append(fullArgs, tlsArgs...)
	fullArgs = append(fullArgs, args...)

	// #nosec G204 -- rclonePath and arguments are derived from trusted config and internal inputs.
	cmd := exec.CommandContext(ctx, rclonePath, fullArgs...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		configCleanup()
		tlsCleanup()
		return nil, err
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		configCleanup()
		tlsCleanup()
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		configCleanup()
		tlsCleanup()
		return nil, err
	}

	var stderrBuf bytes.Buffer
	stderrDone := make(chan struct{})
	go func() {
		_, _ = io.Copy(&stderrBuf, stderrPipe)
		close(stderrDone)
	}()

	wait := func() error {
		err := cmd.Wait()
		<-stderrDone
		configCleanup()
		tlsCleanup()
		return err
	}

	return &rcloneProcess{
		stdout: stdout,
		stderr: &stderrBuf,
		wait:   wait,
	}, nil
}

func (s *server) runRcloneCapture(ctx context.Context, profile models.ProfileSecrets, args []string, hint string) (string, string, error) {
	proc, err := s.startRclone(ctx, profile, args, hint)
	if err != nil {
		return "", "", err
	}

	out, readErr := io.ReadAll(proc.stdout)
	waitErr := proc.wait()

	if readErr != nil {
		return "", strings.TrimSpace(proc.stderr.String()), readErr
	}
	if waitErr != nil {
		return string(out), strings.TrimSpace(proc.stderr.String()), waitErr
	}
	return string(out), strings.TrimSpace(proc.stderr.String()), nil
}

func decodeRcloneList(r io.Reader, onEntry func(entry rcloneListEntry) error) error {
	dec := json.NewDecoder(r)
	tok, err := dec.Token()
	if err != nil {
		return err
	}
	delim, ok := tok.(json.Delim)
	if !ok || delim != '[' {
		return fmt.Errorf("unexpected rclone lsjson output")
	}
	for dec.More() {
		var entry rcloneListEntry
		if err := dec.Decode(&entry); err != nil {
			return err
		}
		if err := onEntry(entry); err != nil {
			return err
		}
	}
	if _, err := dec.Token(); err != nil {
		return err
	}
	return nil
}

func (s *server) rcloneStat(ctx context.Context, profile models.ProfileSecrets, target string, withHash bool, withMetadata bool, hint string) (rcloneListEntry, string, error) {
	args := []string{"lsjson", "--stat"}
	if withHash {
		args = append(args, "--hash")
	}
	if withMetadata {
		args = append(args, "--metadata")
	}
	args = append(args, target)

	out, stderr, err := s.runRcloneCapture(ctx, profile, args, hint)
	if err != nil {
		return rcloneListEntry{}, stderr, err
	}
	if strings.TrimSpace(out) == "" {
		return rcloneListEntry{}, stderr, errors.New("empty rclone response")
	}
	var entry rcloneListEntry
	if err := json.Unmarshal([]byte(out), &entry); err != nil {
		return rcloneListEntry{}, stderr, err
	}
	return entry, stderr, nil
}

func rcloneETagFromHashes(hashes map[string]string) string {
	if len(hashes) == 0 {
		return ""
	}
	if v := strings.TrimSpace(hashes["ETag"]); v != "" {
		return v
	}
	if v := strings.TrimSpace(hashes["etag"]); v != "" {
		return v
	}
	if v := strings.TrimSpace(hashes["MD5"]); v != "" {
		return v
	}
	if v := strings.TrimSpace(hashes["md5"]); v != "" {
		return v
	}
	for _, v := range hashes {
		v = strings.TrimSpace(v)
		if v != "" {
			return v
		}
	}
	return ""
}

func rcloneObjectKey(prefix, name string, preserveLeadingSlash bool) string {
	if !preserveLeadingSlash {
		prefix = strings.TrimPrefix(prefix, "/")
		name = strings.TrimPrefix(name, "/")
	}
	if prefix == "" {
		return name
	}
	if name == "" {
		return strings.TrimSuffix(prefix, "/")
	}
	if strings.HasSuffix(prefix, "/") {
		return prefix + name
	}
	return prefix + "/" + name
}

func rcloneTokenForObject(key string) string {
	return "o:" + key
}

func rcloneTokenForPrefix(prefix string) string {
	return "p:" + prefix
}

func rcloneMatchToken(token, entryToken, rawKey string) bool {
	if token == "" {
		return false
	}
	if token == entryToken {
		return true
	}
	if strings.HasPrefix(token, "o:") || strings.HasPrefix(token, "p:") {
		return false
	}
	return token == rawKey
}

func rcloneErrorMessage(err error, stderr string) string {
	if msg := strings.TrimSpace(stderr); msg != "" {
		return msg
	}
	if err != nil {
		return err.Error()
	}
	return ""
}

func rcloneIsNotFound(err error, stderr string) bool {
	msg := strings.ToLower(rcloneErrorMessage(err, stderr))
	switch {
	case strings.Contains(msg, "not found"):
		return true
	case strings.Contains(msg, "no such file") || strings.Contains(msg, "no such key"):
		return true
	case strings.Contains(msg, "nosuchkey") || strings.Contains(msg, "nosuchbucket"):
		return true
	case strings.Contains(msg, "404"):
		return true
	default:
		return false
	}
}

func rcloneIsBucketNotFound(err error, stderr string) bool {
	msg := strings.ToLower(rcloneErrorMessage(err, stderr))
	return strings.Contains(msg, "bucket") && strings.Contains(msg, "not found") || strings.Contains(msg, "nosuchbucket")
}

func rcloneParseTime(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if t, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return t.UTC().Format(time.RFC3339Nano)
	}
	if t, err := time.Parse(time.RFC3339, value); err == nil {
		return t.UTC().Format(time.RFC3339Nano)
	}
	return ""
}

type rcloneAPIErrorContext struct {
	MissingMessage string
	DefaultStatus  int
	DefaultCode    string
	DefaultMessage string
}

func writeRcloneAPIError(w http.ResponseWriter, err error, stderr string, ctx rcloneAPIErrorContext, details map[string]any) {
	if errors.Is(err, jobs.ErrRcloneNotFound) {
		writeError(w, http.StatusBadRequest, "transfer_engine_missing", ctx.MissingMessage, nil)
		return
	}
	var ie *jobs.RcloneIncompatibleError
	if errors.As(err, &ie) {
		out := map[string]any{}
		for k, v := range details {
			out[k] = v
		}
		if ie.CurrentVersion != "" {
			out["currentVersion"] = ie.CurrentVersion
		}
		if ie.MinVersion != "" {
			out["minVersion"] = ie.MinVersion
		}
		writeError(w, http.StatusBadRequest, "transfer_engine_incompatible", ie.Error(), out)
		return
	}
	cls := rcloneerrors.Classify(err, stderr)
	norm := &models.NormalizedError{Code: models.NormalizedErrorCode(cls.Code), Retryable: cls.Retryable}

	// Rate-limited responses are actionable for clients; expose a conservative backoff hint.
	if cls.Code == rcloneerrors.CodeRateLimited {
		if w.Header().Get("Retry-After") == "" {
			w.Header().Set("Retry-After", "3")
		}
	}

	if status, code, ok := rcloneErrorStatus(err, stderr); ok {
		writeJSON(w, status, models.ErrorResponse{
			Error: models.APIError{
				Code:            code,
				Message:         ctx.DefaultMessage,
				NormalizedError: norm,
				Details:         rcloneErrorDetails(err, stderr, details),
			},
		})
		return
	}
	writeJSON(w, ctx.DefaultStatus, models.ErrorResponse{
		Error: models.APIError{
			Code:            ctx.DefaultCode,
			Message:         ctx.DefaultMessage,
			NormalizedError: norm,
			Details:         rcloneErrorDetails(err, stderr, details),
		},
	})
}

func rcloneErrorDetails(err error, stderr string, details map[string]any) map[string]any {
	msg := strings.TrimSpace(rcloneErrorMessage(err, stderr))
	if msg == "" && len(details) == 0 {
		return details
	}
	out := make(map[string]any, len(details)+1)
	for k, v := range details {
		out[k] = v
	}
	if msg != "" {
		if _, ok := out["error"]; !ok {
			out["error"] = msg
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func rcloneErrorStatus(err error, stderr string) (int, string, bool) {
	cls := rcloneerrors.Classify(err, stderr)
	switch cls.Code {
	case rcloneerrors.CodeNotFound:
		return http.StatusNotFound, string(cls.Code), true
	case rcloneerrors.CodeInvalidCredentials:
		return http.StatusUnauthorized, string(cls.Code), true
	case rcloneerrors.CodeAccessDenied, rcloneerrors.CodeSignatureMismatch, rcloneerrors.CodeRequestTimeSkewed:
		return http.StatusForbidden, string(cls.Code), true
	case rcloneerrors.CodeRateLimited:
		return http.StatusTooManyRequests, string(cls.Code), true
	case rcloneerrors.CodeConflict:
		return http.StatusConflict, string(cls.Code), true
	case rcloneerrors.CodeUpstreamTimeout:
		return http.StatusGatewayTimeout, string(cls.Code), true
	case rcloneerrors.CodeEndpointUnreachable, rcloneerrors.CodeNetworkError:
		return http.StatusBadGateway, string(cls.Code), true
	case rcloneerrors.CodeInvalidConfig:
		return http.StatusBadRequest, string(cls.Code), true
	default:
		return 0, "", false
	}
}
