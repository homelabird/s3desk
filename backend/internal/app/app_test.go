package app

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"s3desk/internal/config"

	"gorm.io/gorm"
)

func TestApplySafeDefaults(t *testing.T) {
	cfg := config.Config{
		DBStartupTimeout:            0,
		DBStartupRetryInterval:      0,
		JobConcurrency:              0,
		JobLogMaxBytes:              -1,
		JobRetention:                -time.Second,
		JobLogRetention:             -time.Second,
		UploadSessionTTL:            0,
		UploadMaxBytes:              -1,
		UploadMaxConcurrentRequests: -1,
	}

	applySafeDefaults(&cfg)

	if cfg.DBStartupTimeout != defaultDBStartupTimeout {
		t.Fatalf("DBStartupTimeout=%s, want %s", cfg.DBStartupTimeout, defaultDBStartupTimeout)
	}
	if cfg.DBStartupRetryInterval != defaultDBStartupRetryInterval {
		t.Fatalf("DBStartupRetryInterval=%s, want %s", cfg.DBStartupRetryInterval, defaultDBStartupRetryInterval)
	}
	if cfg.JobConcurrency != 1 {
		t.Fatalf("JobConcurrency=%d, want 1", cfg.JobConcurrency)
	}
	if cfg.JobLogMaxBytes != 0 {
		t.Fatalf("JobLogMaxBytes=%d, want 0", cfg.JobLogMaxBytes)
	}
	if cfg.JobRetention != 0 {
		t.Fatalf("JobRetention=%s, want 0", cfg.JobRetention)
	}
	if cfg.JobLogRetention != 0 {
		t.Fatalf("JobLogRetention=%s, want 0", cfg.JobLogRetention)
	}
	if cfg.UploadSessionTTL != defaultUploadSessionTTL {
		t.Fatalf("UploadSessionTTL=%s, want %s", cfg.UploadSessionTTL, defaultUploadSessionTTL)
	}
	if cfg.UploadMaxBytes != 0 {
		t.Fatalf("UploadMaxBytes=%d, want 0", cfg.UploadMaxBytes)
	}
	if cfg.UploadMaxConcurrentRequests != defaultUploadMaxConcurrentRequests {
		t.Fatalf("UploadMaxConcurrentRequests=%d, want %d", cfg.UploadMaxConcurrentRequests, defaultUploadMaxConcurrentRequests)
	}
}

func TestApplySafeDefaultsPreservesConfiguredValues(t *testing.T) {
	cfg := config.Config{
		DBStartupTimeout:            45 * time.Second,
		DBStartupRetryInterval:      1500 * time.Millisecond,
		JobConcurrency:              4,
		JobLogMaxBytes:              123,
		JobRetention:                2 * time.Hour,
		JobLogRetention:             3 * time.Hour,
		UploadSessionTTL:            90 * time.Minute,
		UploadMaxBytes:              1024,
		UploadMaxConcurrentRequests: 0,
	}

	applySafeDefaults(&cfg)

	if cfg.DBStartupTimeout != 45*time.Second {
		t.Fatalf("DBStartupTimeout=%s, want %s", cfg.DBStartupTimeout, 45*time.Second)
	}
	if cfg.DBStartupRetryInterval != 1500*time.Millisecond {
		t.Fatalf("DBStartupRetryInterval=%s, want %s", cfg.DBStartupRetryInterval, 1500*time.Millisecond)
	}
	if cfg.JobConcurrency != 4 {
		t.Fatalf("JobConcurrency=%d, want 4", cfg.JobConcurrency)
	}
	if cfg.JobLogMaxBytes != 123 {
		t.Fatalf("JobLogMaxBytes=%d, want 123", cfg.JobLogMaxBytes)
	}
	if cfg.JobRetention != 2*time.Hour {
		t.Fatalf("JobRetention=%s, want %s", cfg.JobRetention, 2*time.Hour)
	}
	if cfg.JobLogRetention != 3*time.Hour {
		t.Fatalf("JobLogRetention=%s, want %s", cfg.JobLogRetention, 3*time.Hour)
	}
	if cfg.UploadSessionTTL != 90*time.Minute {
		t.Fatalf("UploadSessionTTL=%s, want %s", cfg.UploadSessionTTL, 90*time.Minute)
	}
	if cfg.UploadMaxBytes != 1024 {
		t.Fatalf("UploadMaxBytes=%d, want 1024", cfg.UploadMaxBytes)
	}
	if cfg.UploadMaxConcurrentRequests != 0 {
		t.Fatalf("UploadMaxConcurrentRequests=%d, want 0", cfg.UploadMaxConcurrentRequests)
	}
}

func TestIsPlaceholderAPITokenRejectsDocumentedExamples(t *testing.T) {
	placeholderTokens := []string{
		"",
		"change-me",
		"replace-me",
		"s3desk-demo-token-0123456789abcdef012345",
		"replace-with-a-long-random-token",
		"replace-me-with-a-strong-token",
	}
	for _, token := range placeholderTokens {
		token := token
		t.Run(token, func(t *testing.T) {
			if !isPlaceholderAPIToken(token) {
				t.Fatalf("expected %q to be treated as a placeholder token", token)
			}
		})
	}

	if isPlaceholderAPIToken("s3desk-test-token-1234567890") {
		t.Fatalf("expected non-placeholder token to be accepted")
	}
}

func TestValidateRemoteAccessConfigRequiresStrongTokenAndEncryptionKey(t *testing.T) {
	t.Parallel()

	base := config.Config{
		Addr:             "0.0.0.0:8080",
		AllowRemote:      true,
		APIToken:         strings.Repeat("a", minRemoteAPITokenBytes),
		EncryptionKey:    "QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI=",
		AllowedHosts:     []string{"s3desk.example.com"},
		AllowedLocalDirs: []string{"/data"},
	}

	cases := []struct {
		name    string
		mutate  func(*config.Config)
		wantErr string
	}{
		{
			name: "empty token",
			mutate: func(cfg *config.Config) {
				cfg.APIToken = ""
			},
			wantErr: "API_TOKEN",
		},
		{
			name: "placeholder token",
			mutate: func(cfg *config.Config) {
				cfg.APIToken = "change-me"
			},
			wantErr: "placeholder",
		},
		{
			name: "short token",
			mutate: func(cfg *config.Config) {
				cfg.APIToken = strings.Repeat("a", minRemoteAPITokenBytes-1)
			},
			wantErr: "at least 32 bytes",
		},
		{
			name: "missing encryption key",
			mutate: func(cfg *config.Config) {
				cfg.EncryptionKey = ""
			},
			wantErr: "ENCRYPTION_KEY",
		},
		{
			name: "missing allowed hosts",
			mutate: func(cfg *config.Config) {
				cfg.AllowedHosts = nil
			},
			wantErr: "ALLOWED_HOSTS",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := base
			tc.mutate(&cfg)
			err := validateRemoteAccessConfig(cfg, false)
			if err == nil {
				t.Fatalf("validateRemoteAccessConfig() error=nil, want %q", tc.wantErr)
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("validateRemoteAccessConfig() error=%q, want to contain %q", err.Error(), tc.wantErr)
			}
		})
	}

	if err := validateRemoteAccessConfig(base, false); err != nil {
		t.Fatalf("validateRemoteAccessConfig(valid) error=%v", err)
	}
	if err := validateRemoteAccessConfig(config.Config{AllowRemote: true}, true); err != nil {
		t.Fatalf("validateRemoteAccessConfig(loopback) error=%v", err)
	}
	if err := validateRemoteAccessConfig(config.Config{AllowRemote: false}, false); err != nil {
		t.Fatalf("validateRemoteAccessConfig(local) error=%v", err)
	}
}

func TestOpenWithRetryRetriesTransientPostgresStartupError(t *testing.T) {
	attempts := 0
	sleeps := 0

	got, err := openWithRetry(
		context.Background(),
		time.Second,
		time.Millisecond,
		func() (*gorm.DB, error) {
			attempts++
			if attempts < 3 {
				return nil, errors.New("dial error: connect: connection refused")
			}
			return &gorm.DB{}, nil
		},
		isRetriablePostgresStartupError,
		func(context.Context, time.Duration) error {
			sleeps++
			return nil
		},
	)
	if err != nil {
		t.Fatalf("openWithRetry returned error: %v", err)
	}
	if got == nil {
		t.Fatal("openWithRetry returned nil db")
	}
	if attempts != 3 {
		t.Fatalf("attempts=%d, want 3", attempts)
	}
	if sleeps != 2 {
		t.Fatalf("sleeps=%d, want 2", sleeps)
	}
}

func TestOpenWithRetryStopsOnNonRetriableError(t *testing.T) {
	wantErr := errors.New("password authentication failed for user \"s3desk\"")
	attempts := 0

	got, err := openWithRetry(
		context.Background(),
		time.Second,
		time.Millisecond,
		func() (*gorm.DB, error) {
			attempts++
			return nil, wantErr
		},
		isRetriablePostgresStartupError,
		func(context.Context, time.Duration) error {
			t.Fatal("sleep should not be called for non-retriable errors")
			return nil
		},
	)
	if got != nil {
		t.Fatal("expected nil db on non-retriable failure")
	}
	if !errors.Is(err, wantErr) {
		t.Fatalf("error=%v, want %v", err, wantErr)
	}
	if attempts != 1 {
		t.Fatalf("attempts=%d, want 1", attempts)
	}
}

func TestOpenWithRetryReturnsTimeoutError(t *testing.T) {
	_, err := openWithRetry(
		context.Background(),
		10*time.Millisecond,
		time.Hour,
		func() (*gorm.DB, error) {
			return nil, errors.New("dial error: connect: connection refused")
		},
		isRetriablePostgresStartupError,
		func(ctx context.Context, _ time.Duration) error {
			<-ctx.Done()
			return ctx.Err()
		},
	)
	if err == nil {
		t.Fatal("expected timeout error")
	}
	if !strings.Contains(err.Error(), "postgres did not become ready within") {
		t.Fatalf("error=%q, want timeout message", err)
	}
}

func TestIsRetriablePostgresStartupError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{name: "connection refused", err: errors.New("failed to connect: dial error: connect: connection refused"), want: true},
		{name: "dns failure", err: errors.New("failed to connect: lookup postgres: no such host"), want: true},
		{name: "bad password", err: errors.New("password authentication failed for user \"s3desk\""), want: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := isRetriablePostgresStartupError(tc.err); got != tc.want {
				t.Fatalf("isRetriablePostgresStartupError()=%v, want %v", got, tc.want)
			}
		})
	}
}

func TestRunRejectsInvalidJobsEnvironment(t *testing.T) {
	t.Setenv("RCLONE_STATS_INTERVAL", "fast")

	err := Run(context.Background(), config.Config{
		Addr:      "127.0.0.1:0",
		DataDir:   t.TempDir(),
		DBBackend: "sqlite",
	})
	if err == nil {
		t.Fatal("Run() error=nil, want invalid jobs environment error")
	}
	if !strings.Contains(err.Error(), "invalid jobs environment configuration") {
		t.Fatalf("Run() error=%q, want invalid jobs environment configuration", err.Error())
	}
	if !strings.Contains(err.Error(), "RCLONE_STATS_INTERVAL") {
		t.Fatalf("Run() error=%q, want RCLONE_STATS_INTERVAL detail", err.Error())
	}
}

func TestRunClosesIncompleteRequestAfterShutdownDeadline(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := listener.Addr().String()
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	dataDir := t.TempDir()
	done := make(chan error, 1)
	go func() {
		done <- Run(ctx, config.Config{Addr: addr, DataDir: dataDir, DBBackend: "sqlite"})
	}()
	var conn net.Conn
	deadline := time.After(5 * time.Second)
	for {
		conn, err = net.DialTimeout("tcp", addr, 100*time.Millisecond)
		if err == nil {
			break
		}
		select {
		case err := <-done:
			t.Fatalf("Run exited before accepting requests: %v", err)
		case <-deadline:
			t.Fatal("server did not start")
		case <-time.After(10 * time.Millisecond):
		}
	}
	defer conn.Close()
	if err := conn.SetReadDeadline(time.Now().Add(5 * time.Second)); err != nil {
		t.Fatal(err)
	}
	if _, err := fmt.Fprintf(conn, "POST /api/v1/profiles HTTP/1.1\r\nHost: %s\r\nContent-Type: application/json\r\nContent-Length: 100\r\nExpect: 100-continue\r\n\r\n", addr); err != nil {
		t.Fatal(err)
	}
	reader := bufio.NewReader(conn)
	response, err := http.ReadResponse(reader, nil)
	if err != nil {
		select {
		case runErr := <-done:
			t.Fatalf("wait for request body read: %v; Run exited: %v", err, runErr)
		default:
		}
		t.Fatalf("wait for request body read: %v", err)
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusContinue {
		t.Fatalf("status=%d, want 100 Continue before shutdown", response.StatusCode)
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Run shutdown: %v", err)
		}
	case <-time.After(15 * time.Second):
		t.Fatal("Run did not finish shutdown")
	}
	if err := conn.SetReadDeadline(time.Now().Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	if _, err := io.ReadAll(reader); err != nil {
		t.Fatalf("request connection still open after Run returned: %v", err)
	}
}
