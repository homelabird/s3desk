package app

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"gorm.io/gorm"

	"s3desk/internal/api"
	"s3desk/internal/config"
	"s3desk/internal/db"
	"s3desk/internal/dirlock"
	"s3desk/internal/jobs"
	"s3desk/internal/logging"
	"s3desk/internal/metrics"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

const (
	defaultUploadSessionTTL            = 24 * time.Hour
	defaultUploadMaxConcurrentRequests = 16
	defaultDBStartupTimeout            = 30 * time.Second
	defaultDBStartupRetryInterval      = time.Second
)

type dbOpenFunc func() (*gorm.DB, error)

type retrySleepFunc func(context.Context, time.Duration) error

func Run(ctx context.Context, cfg config.Config) error {
	if err := validateListenAddr(cfg.Addr, cfg.AllowRemote); err != nil {
		return err
	}
	isLoopback, err := isLoopbackListenAddr(cfg.Addr)
	if err != nil {
		return err
	}
	if cfg.AllowRemote && !isLoopback {
		switch {
		case strings.TrimSpace(cfg.APIToken) == "":
			return fmt.Errorf("API_TOKEN (or --api-token) is required when --allow-remote is enabled and addr is non-loopback (addr=%q)", cfg.Addr)
		case isPlaceholderAPIToken(cfg.APIToken):
			return fmt.Errorf("API_TOKEN must not use a placeholder value when remote access is enabled (addr=%q)", cfg.Addr)
		}
	}

	applySafeDefaults(&cfg)

	allowedDirs, err := normalizeAllowedDirs(cfg.AllowedLocalDirs)
	if err != nil {
		return err
	}
	cfg.AllowedLocalDirs = allowedDirs

	if err := os.MkdirAll(cfg.DataDir, 0o700); err != nil {
		return err
	}

	// Prevent accidental concurrent use of the same DATA_DIR (which would corrupt
	// sqlite DB files and interleave job logs/artifacts).
	dataLock, err := dirlock.Acquire(cfg.DataDir)
	if err != nil {
		return err
	}
	defer func() { _ = dataLock.Release() }()
	if err := os.MkdirAll(filepath.Join(cfg.DataDir, "staging"), 0o700); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(cfg.DataDir, "logs", "jobs"), 0o700); err != nil {
		return err
	}

	dbBackend, err := db.ParseBackend(cfg.DBBackend)
	if err != nil {
		return err
	}

	var dbPath string
	var gormDB *gorm.DB
	switch dbBackend {
	case db.BackendSQLite:
		dbPath = filepath.Join(cfg.DataDir, "s3desk.db")
		gormDB, err = db.Open(db.Config{
			Backend:    dbBackend,
			SQLitePath: dbPath,
		})
	case db.BackendPostgres:
		gormDB, err = openPostgresWithRetry(ctx, cfg)
	default:
		return fmt.Errorf("unsupported db backend %q", dbBackend)
	}
	if err != nil {
		return err
	}
	sqlDB, err := gormDB.DB()
	if err != nil {
		return err
	}
	if cfg.DBMaxOpenConns > 0 {
		sqlDB.SetMaxOpenConns(cfg.DBMaxOpenConns)
	}
	if cfg.DBMaxIdleConns > 0 {
		sqlDB.SetMaxIdleConns(cfg.DBMaxIdleConns)
	}
	if cfg.DBConnMaxLifetime > 0 {
		sqlDB.SetConnMaxLifetime(cfg.DBConnMaxLifetime)
	}
	if cfg.DBConnMaxIdleTime > 0 {
		sqlDB.SetConnMaxIdleTime(cfg.DBConnMaxIdleTime)
	}
	defer func() { _ = sqlDB.Close() }()
	if dbBackend == db.BackendSQLite {
		_ = os.Chmod(dbPath, 0o600)
	}

	st, err := store.New(gormDB, store.Options{
		EncryptionKey: cfg.EncryptionKey,
	})
	if err != nil {
		return err
	}

	{
		migCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		updated, err := st.EnsureProfilesEncrypted(migCtx)
		cancel()
		if err != nil {
			return err
		}
		if updated > 0 {
			logging.Infof("encrypted %d profile(s) at rest", updated)
		}
	}

	m := metrics.New()
	hub := ws.NewHub()
	jobManager := jobs.NewManager(jobs.Config{
		Store:            st,
		DataDir:          cfg.DataDir,
		Hub:              hub,
		Metrics:          m,
		Concurrency:      cfg.JobConcurrency,
		JobLogMaxBytes:   cfg.JobLogMaxBytes,
		JobLogEmitStdout: cfg.JobLogEmitStdout,
		JobRetention:     cfg.JobRetention,
		JobLogRetention:  cfg.JobLogRetention,
		AllowedLocalDirs: allowedDirs,
		UploadSessionTTL: cfg.UploadSessionTTL,
	})

	if err := jobManager.RecoverAndRequeue(ctx); err != nil {
		return err
	}
	go jobManager.Run(ctx)
	go jobManager.RunMaintenance(ctx)

	handler := api.New(api.Dependencies{
		Config:     cfg,
		Store:      st,
		Jobs:       jobManager,
		Hub:        hub,
		Metrics:    m,
		ServerAddr: cfg.Addr,
	})

	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
		ReadTimeout:       0,
		WriteTimeout:      0,
	}

	errCh := make(chan error, 1)
	go func() {
		logging.Infof("listening on http://%s", cfg.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
		return nil
	case err := <-errCh:
		return err
	}
}

func applySafeDefaults(cfg *config.Config) {
	if cfg.JobConcurrency <= 0 {
		cfg.JobConcurrency = 1
	}
	if cfg.DBStartupTimeout <= 0 {
		cfg.DBStartupTimeout = defaultDBStartupTimeout
	}
	if cfg.DBStartupRetryInterval <= 0 {
		cfg.DBStartupRetryInterval = defaultDBStartupRetryInterval
	}
	if cfg.JobLogMaxBytes < 0 {
		cfg.JobLogMaxBytes = 0
	}
	if cfg.JobRetention < 0 {
		cfg.JobRetention = 0
	}
	if cfg.JobLogRetention < 0 {
		cfg.JobLogRetention = 0
	}
	if cfg.UploadSessionTTL <= 0 {
		cfg.UploadSessionTTL = defaultUploadSessionTTL
	}
	if cfg.UploadMaxBytes < 0 {
		cfg.UploadMaxBytes = 0
	}
	if cfg.UploadMaxConcurrentRequests < 0 {
		cfg.UploadMaxConcurrentRequests = defaultUploadMaxConcurrentRequests
	}
}

func openPostgresWithRetry(ctx context.Context, cfg config.Config) (*gorm.DB, error) {
	return openWithRetry(
		ctx,
		cfg.DBStartupTimeout,
		cfg.DBStartupRetryInterval,
		func() (*gorm.DB, error) {
			return db.Open(db.Config{
				Backend:     db.BackendPostgres,
				DatabaseURL: cfg.DatabaseURL,
			})
		},
		isRetriablePostgresStartupError,
		sleepWithContext,
	)
}

func openWithRetry(
	ctx context.Context,
	timeout time.Duration,
	retryInterval time.Duration,
	open dbOpenFunc,
	isRetriable func(error) bool,
	sleep retrySleepFunc,
) (*gorm.DB, error) {
	if open == nil {
		return nil, errors.New("database open func is required")
	}
	if isRetriable == nil {
		return nil, errors.New("database retry classifier is required")
	}
	if sleep == nil {
		sleep = sleepWithContext
	}
	if retryInterval <= 0 {
		retryInterval = defaultDBStartupRetryInterval
	}

	attemptCtx := ctx
	cancel := func() {}
	if timeout > 0 {
		attemptCtx, cancel = context.WithTimeout(ctx, timeout)
	}
	defer cancel()

	attempt := 1
	for {
		gormDB, err := open()
		if err == nil {
			return gormDB, nil
		}
		if !isRetriable(err) {
			return nil, err
		}
		logging.Warnf("postgres not ready yet; retrying in %s (attempt %d): %v", retryInterval, attempt, err)
		if err := sleep(attemptCtx, retryInterval); err != nil {
			if timeout > 0 && errors.Is(attemptCtx.Err(), context.DeadlineExceeded) {
				return nil, fmt.Errorf("postgres did not become ready within %s: %w", timeout, err)
			}
			if errors.Is(ctx.Err(), context.Canceled) {
				return nil, fmt.Errorf("postgres startup canceled: %w", err)
			}
			return nil, err
		}
		attempt++
	}
}

func sleepWithContext(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			return nil
		}
	}

	timer := time.NewTimer(d)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func isRetriablePostgresStartupError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, syscall.ECONNREFUSED) ||
		errors.Is(err, syscall.ECONNRESET) ||
		errors.Is(err, syscall.ETIMEDOUT) ||
		errors.Is(err, syscall.EHOSTUNREACH) ||
		errors.Is(err, syscall.ENETUNREACH) {
		return true
	}

	var netErr net.Error
	if errors.As(err, &netErr) {
		return true
	}

	message := strings.ToLower(err.Error())
	return strings.Contains(message, "connection refused") ||
		strings.Contains(message, "dial error") ||
		strings.Contains(message, "connection reset by peer") ||
		strings.Contains(message, "no such host") ||
		strings.Contains(message, "i/o timeout") ||
		strings.Contains(message, "network is unreachable")
}

func validateListenAddr(addr string, allowRemote bool) error {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("invalid addr %q (expected host:port): %w", addr, err)
	}

	if host == "" {
		if allowRemote {
			return nil
		}
		return fmt.Errorf("refusing to bind to wildcard host (addr=%q); this app is local-only", addr)
	}

	switch host {
	case "127.0.0.1", "localhost", "::1":
		return nil
	default:
		if allowRemote {
			return nil
		}
		return fmt.Errorf("refusing to bind to non-local host %q (addr=%q); this app is local-only", host, addr)
	}
}

func isLoopbackListenAddr(addr string) (bool, error) {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return false, fmt.Errorf("invalid addr %q (expected host:port): %w", addr, err)
	}
	if host == "" || host == "0.0.0.0" || host == "::" {
		return false, nil
	}
	if host == "localhost" {
		return true, nil
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return false, nil
	}
	return ip.IsLoopback(), nil
}

func normalizeAllowedDirs(dirs []string) ([]string, error) {
	if len(dirs) == 0 {
		return nil, nil
	}

	out := make([]string, 0, len(dirs))
	for _, d := range dirs {
		d = filepath.Clean(d)
		if d == "" || d == "." {
			continue
		}
		abs, err := filepath.Abs(d)
		if err != nil {
			return nil, fmt.Errorf("invalid allowed local dir %q: %w", d, err)
		}
		real, err := filepath.EvalSymlinks(abs)
		if err != nil {
			return nil, fmt.Errorf("invalid allowed local dir %q: %w", d, err)
		}
		info, err := os.Stat(real)
		if err != nil {
			return nil, fmt.Errorf("invalid allowed local dir %q: %w", d, err)
		}
		if !info.IsDir() {
			return nil, fmt.Errorf("allowed local dir must be a directory: %q", d)
		}
		out = append(out, real)
	}
	return out, nil
}

func isPlaceholderAPIToken(token string) bool {
	switch strings.TrimSpace(strings.ToLower(token)) {
	case "", "change-me", "changeme", "default", "token", "api-token", "s3desk", "s3desk-local":
		return true
	default:
		return false
	}
}
