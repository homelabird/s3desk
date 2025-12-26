package app

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"object-storage/internal/api"
	"object-storage/internal/config"
	"object-storage/internal/db"
	"object-storage/internal/jobs"
	"object-storage/internal/store"
	"object-storage/internal/ws"
)

func Run(ctx context.Context, cfg config.Config) error {
	if err := validateListenAddr(cfg.Addr, cfg.AllowRemote); err != nil {
		return err
	}
	if cfg.AllowRemote && cfg.APIToken == "" {
		isLoopback, err := isLoopbackListenAddr(cfg.Addr)
		if err != nil {
			return err
		}
		if !isLoopback {
			return fmt.Errorf("API_TOKEN (or --api-token) is required when --allow-remote is enabled and addr is non-loopback (addr=%q)", cfg.Addr)
		}
	}

	if cfg.JobConcurrency <= 0 {
		cfg.JobConcurrency = 1
	}
	if cfg.JobLogMaxBytes < 0 {
		cfg.JobLogMaxBytes = 0
	}
	if cfg.JobRetention < 0 {
		cfg.JobRetention = 0
	}
	if cfg.UploadSessionTTL <= 0 {
		cfg.UploadSessionTTL = 24 * time.Hour
	}
	if cfg.UploadMaxBytes < 0 {
		cfg.UploadMaxBytes = 0
	}

	allowedDirs, err := normalizeAllowedDirs(cfg.AllowedLocalDirs)
	if err != nil {
		return err
	}
	cfg.AllowedLocalDirs = allowedDirs

	if err := os.MkdirAll(cfg.DataDir, 0o700); err != nil {
		return err
	}
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
	var sqlDB *sql.DB
	switch dbBackend {
	case db.BackendSQLite:
		dbPath = filepath.Join(cfg.DataDir, "object-storage.db")
		sqlDB, err = db.Open(db.Config{
			Backend:    dbBackend,
			SQLitePath: dbPath,
		})
	case db.BackendPostgres:
		sqlDB, err = db.Open(db.Config{
			Backend:     dbBackend,
			DatabaseURL: cfg.DatabaseURL,
		})
	default:
		return fmt.Errorf("unsupported db backend %q", dbBackend)
	}
	if err != nil {
		return err
	}
	defer func() {
		_ = sqlDB.Close()
	}()
	if dbBackend == db.BackendSQLite {
		_ = os.Chmod(dbPath, 0o600)
	}

	st, err := store.New(sqlDB, store.Options{
		EncryptionKey: cfg.EncryptionKey,
		Backend:       dbBackend,
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
			log.Printf("encrypted %d profile(s) at rest", updated)
		}
	}

	hub := ws.NewHub()
	jobManager := jobs.NewManager(jobs.Config{
		Store:            st,
		DataDir:          cfg.DataDir,
		Hub:              hub,
		Concurrency:      cfg.JobConcurrency,
		JobLogMaxBytes:   cfg.JobLogMaxBytes,
		JobRetention:     cfg.JobRetention,
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
		log.Printf("listening on http://%s", cfg.Addr)
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
