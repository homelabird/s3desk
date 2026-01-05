package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
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

const rcloneRemoteName = "remote"

func rcloneRemoteBucket(bucket string) string {
	return fmt.Sprintf("%s:%s", rcloneRemoteName, strings.TrimSpace(bucket))
}

func rcloneRemoteDir(bucket, prefix string, preserveLeadingSlash bool) string {
	prefix = normalizeRclonePathInput(prefix, preserveLeadingSlash)
	if prefix == "" {
		return rcloneRemoteBucket(bucket)
	}
	return fmt.Sprintf("%s:%s/%s", rcloneRemoteName, strings.TrimSpace(bucket), prefix)
}

func rcloneRemoteObject(bucket, key string, preserveLeadingSlash bool) string {
	key = normalizeRclonePathInput(key, preserveLeadingSlash)
	if key == "" {
		return rcloneRemoteBucket(bucket)
	}
	return fmt.Sprintf("%s:%s/%s", rcloneRemoteName, strings.TrimSpace(bucket), key)
}

func normalizeRclonePathInput(value string, preserveLeadingSlash bool) string {
	value = strings.TrimSpace(value)
	if preserveLeadingSlash {
		return value
	}
	return strings.TrimPrefix(value, "/")
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
	baseDir := s.cfg.DataDir
	if strings.TrimSpace(baseDir) == "" {
		baseDir = os.TempDir()
	}
	cfgDir := filepath.Join(baseDir, "tmp", "rclone")
	if err := os.MkdirAll(cfgDir, 0o700); err != nil {
		return "", func() {}, err
	}

	prefix := "api"
	if hint != "" {
		prefix += "-" + hint
	}
	f, err := os.CreateTemp(cfgDir, prefix+"-*.rclone.conf")
	if err != nil {
		return "", func() {}, err
	}
	path = f.Name()
	cleanup = func() { _ = os.Remove(path) }
	defer func() { _ = f.Close() }()

	if _, err := fmt.Fprintf(f, "[%s]\n", "remote"); err != nil {
		cleanup()
		return "", func() {}, err
	}
	if _, err := fmt.Fprintln(f, "type = s3"); err != nil {
		cleanup()
		return "", func() {}, err
	}
	if _, err := fmt.Fprintln(f, "provider = Other"); err != nil {
		cleanup()
		return "", func() {}, err
	}
	if profile.Endpoint != "" {
		if _, err := fmt.Fprintf(f, "endpoint = %s\n", profile.Endpoint); err != nil {
			cleanup()
			return "", func() {}, err
		}
	}
	if profile.Region != "" {
		if _, err := fmt.Fprintf(f, "region = %s\n", profile.Region); err != nil {
			cleanup()
			return "", func() {}, err
		}
	}
	if _, err := fmt.Fprintf(f, "access_key_id = %s\n", profile.AccessKeyID); err != nil {
		cleanup()
		return "", func() {}, err
	}
	if _, err := fmt.Fprintf(f, "secret_access_key = %s\n", profile.SecretAccessKey); err != nil {
		cleanup()
		return "", func() {}, err
	}
	if profile.SessionToken != nil && *profile.SessionToken != "" {
		if _, err := fmt.Fprintf(f, "session_token = %s\n", *profile.SessionToken); err != nil {
			cleanup()
			return "", func() {}, err
		}
	}
	if _, err := fmt.Fprintf(f, "force_path_style = %t\n", profile.ForcePathStyle); err != nil {
		cleanup()
		return "", func() {}, err
	}
	if err := f.Close(); err != nil {
		cleanup()
		return "", func() {}, err
	}
	return path, cleanup, nil
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

func rcloneIsBucketNotEmpty(err error, stderr string) bool {
	msg := strings.ToLower(rcloneErrorMessage(err, stderr))
	return strings.Contains(msg, "not empty") || strings.Contains(msg, "directory not empty")
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
	if status, code, ok := rcloneErrorStatus(err, stderr); ok {
		writeError(w, status, code, ctx.DefaultMessage, rcloneErrorDetails(err, stderr, details))
		return
	}
	writeError(w, ctx.DefaultStatus, ctx.DefaultCode, ctx.DefaultMessage, rcloneErrorDetails(err, stderr, details))
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
	switch {
	case rcloneIsNotFound(err, stderr):
		return http.StatusNotFound, "not_found", true
	case rcloneIsSignatureMismatch(err, stderr):
		return http.StatusForbidden, "signature_mismatch", true
	case rcloneIsInvalidCredentials(err, stderr):
		return http.StatusUnauthorized, "invalid_credentials", true
	case rcloneIsAccessDenied(err, stderr):
		return http.StatusForbidden, "access_denied", true
	case rcloneIsRequestTimeSkewed(err, stderr):
		return http.StatusForbidden, "request_time_skewed", true
	case rcloneIsTimeout(err, stderr):
		return http.StatusGatewayTimeout, "upstream_timeout", true
	case rcloneIsEndpointError(err, stderr):
		return http.StatusBadGateway, "endpoint_unreachable", true
	default:
		return 0, "", false
	}
}

func rcloneIsAccessDenied(err error, stderr string) bool {
	msg := strings.ToLower(rcloneErrorMessage(err, stderr))
	if msg == "" {
		return false
	}
	switch {
	case strings.Contains(msg, "accessdenied") || strings.Contains(msg, "access denied"):
		return true
	case strings.Contains(msg, "permission denied"):
		return true
	case strings.Contains(msg, "forbidden"):
		return true
	case strings.Contains(msg, "status 403") || strings.Contains(msg, "error 403"):
		return true
	default:
		return false
	}
}

func rcloneIsInvalidCredentials(err error, stderr string) bool {
	msg := strings.ToLower(rcloneErrorMessage(err, stderr))
	if msg == "" {
		return false
	}
	switch {
	case strings.Contains(msg, "invalidaccesskeyid"):
		return true
	case strings.Contains(msg, "access key id you provided does not exist"):
		return true
	case strings.Contains(msg, "invalid access key"):
		return true
	case strings.Contains(msg, "invalidtoken") || strings.Contains(msg, "expiredtoken"):
		return true
	case strings.Contains(msg, "security token") && strings.Contains(msg, "invalid"):
		return true
	default:
		return false
	}
}

func rcloneIsSignatureMismatch(err error, stderr string) bool {
	msg := strings.ToLower(rcloneErrorMessage(err, stderr))
	if msg == "" {
		return false
	}
	switch {
	case strings.Contains(msg, "signaturedoesnotmatch"):
		return true
	case strings.Contains(msg, "signature does not match"):
		return true
	case strings.Contains(msg, "request signature we calculated does not match"):
		return true
	case strings.Contains(msg, "invalid signature"):
		return true
	case strings.Contains(msg, "authorizationheader malformed"):
		return true
	default:
		return false
	}
}

func rcloneIsRequestTimeSkewed(err error, stderr string) bool {
	msg := strings.ToLower(rcloneErrorMessage(err, stderr))
	if msg == "" {
		return false
	}
	return strings.Contains(msg, "request time too skewed") || strings.Contains(msg, "requesttime")
}

func rcloneIsTimeout(err error, stderr string) bool {
	msg := strings.ToLower(rcloneErrorMessage(err, stderr))
	if msg == "" {
		return false
	}
	return strings.Contains(msg, "timeout") || strings.Contains(msg, "context deadline exceeded")
}

func rcloneIsEndpointError(err error, stderr string) bool {
	msg := strings.ToLower(rcloneErrorMessage(err, stderr))
	if msg == "" {
		return false
	}
	switch {
	case strings.Contains(msg, "no such host"):
		return true
	case strings.Contains(msg, "temporary failure in name resolution"):
		return true
	case strings.Contains(msg, "connection refused"):
		return true
	case strings.Contains(msg, "connection reset"):
		return true
	case strings.Contains(msg, "dial tcp"):
		return true
	case strings.Contains(msg, "tls:") || strings.Contains(msg, "x509:"):
		return true
	default:
		return false
	}
}
