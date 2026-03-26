package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"s3desk/internal/app"
	"s3desk/internal/config"
	"s3desk/internal/logging"
)

type stringSliceFlag []string

func (s *stringSliceFlag) String() string {
	return strings.Join(*s, ",")
}

func (s *stringSliceFlag) Set(val string) error {
	*s = append(*s, val)
	return nil
}

func main() {
	var cfg config.Config

	flag.StringVar(&cfg.Addr, "addr", getEnv("ADDR", "127.0.0.1:8080"), "listen address")
	flag.StringVar(&cfg.ExternalBaseURL, "external-base-url", getEnv("EXTERNAL_BASE_URL", ""), "external base URL used for browser-facing signed links (optional, e.g. https://s3desk.example.com)")
	flag.StringVar(&cfg.DataDir, "data-dir", getEnv("DATA_DIR", "./data"), "data directory (sqlite db, staging, logs)")
	flag.StringVar(&cfg.DBBackend, "db-backend", getEnv("DB_BACKEND", "sqlite"), "database backend (sqlite or postgres)")
	flag.StringVar(&cfg.DatabaseURL, "database-url", getEnv("DATABASE_URL", ""), "postgres connection string (required when db-backend=postgres)")
	flag.DurationVar(&cfg.DBStartupTimeout, "db-startup-timeout", 30*time.Second, "max time to wait for initial postgres availability")
	flag.DurationVar(&cfg.DBStartupRetryInterval, "db-startup-retry-interval", time.Second, "delay between postgres startup retries")
	flag.IntVar(&cfg.DBMaxOpenConns, "db-max-open-conns", 0, "max open db connections (0=default)")
	flag.IntVar(&cfg.DBMaxIdleConns, "db-max-idle-conns", 0, "max idle db connections (0=default)")
	flag.DurationVar(&cfg.DBConnMaxLifetime, "db-conn-max-lifetime", 0, "max db connection lifetime (0=default)")
	flag.DurationVar(&cfg.DBConnMaxIdleTime, "db-conn-max-idle-time", 0, "max db connection idle time (0=default)")
	flag.StringVar(&cfg.LogFormat, "log-format", getEnv("LOG_FORMAT", "text"), "log format (text or json)")
	flag.StringVar(&cfg.LogLevel, "log-level", getEnv("LOG_LEVEL", "info"), "log level (debug, info, warn, error)")
	flag.StringVar(&cfg.StaticDir, "static-dir", defaultStaticDir(), "static files directory (frontend build output)")
	flag.StringVar(&cfg.APIToken, "api-token", getEnv("API_TOKEN", ""), "optional local API token (X-Api-Token); required and must not be a placeholder when remote access is enabled on a non-loopback addr")
	flag.BoolVar(&cfg.AllowRemote, "allow-remote", false, "allow non-local bind and accept private remote clients (requires API_TOKEN when using a non-loopback addr)")
	flag.StringVar(&cfg.EncryptionKey, "encryption-key", getEnv("ENCRYPTION_KEY", ""), "optional base64 key to encrypt profile credentials at rest")
	flag.IntVar(&cfg.JobConcurrency, "job-concurrency", 2, "max concurrent jobs")
	flag.Int64Var(&cfg.JobLogMaxBytes, "job-log-max-bytes", 0, "max bytes per job log file (0=unlimited)")
	flag.BoolVar(&cfg.JobLogEmitStdout, "job-log-emit-stdout", false, "emit job logs to stdout as JSON lines")
	flag.DurationVar(&cfg.JobRetention, "job-retention", 0, "delete finished jobs older than this duration (0=keep forever)")
	flag.DurationVar(&cfg.JobLogRetention, "job-log-retention", 0, "delete job log files older than this duration (0=keep forever)")
	flag.DurationVar(&cfg.UploadSessionTTL, "upload-ttl", 24*time.Hour, "upload session TTL")
	flag.Int64Var(&cfg.UploadMaxBytes, "upload-max-bytes", 0, "max total bytes per upload session (0=unlimited)")
	flag.Int64Var(&cfg.ServerRestoreMaxBytes, "server-restore-max-bytes", 4*1024*1024*1024, "max accepted backup restore bundle bytes before staging (0=unlimited)")
	flag.BoolVar(&cfg.UploadDirectStream, "upload-direct-stream", false, "stream uploads directly to the provider (disables staging)")
	flag.IntVar(&cfg.UploadMaxConcurrentRequests, "upload-max-concurrent-requests", 16, "max concurrent upload requests (0=unlimited)")
	flag.IntVar(&cfg.RcloneDownloadMultiThreadStreams, "rclone-download-multi-thread-streams", 16, "rclone --multi-thread-streams for API downloads (0=use rclone default)")
	flag.IntVar(&cfg.RcloneDownloadMultiThreadCutoffMiB, "rclone-download-multi-thread-cutoff-mib", 4, "rclone --multi-thread-cutoff for API downloads, in MiB (0=use rclone default)")
	flag.IntVar(&cfg.RcloneDownloadBufferSizeMiB, "rclone-download-buffer-size-mib", 128, "rclone --buffer-size for API downloads, in MiB (0=use rclone default)")

	allowDirs := stringSliceFlag{}
	for _, dir := range strings.Split(getEnv("ALLOWED_LOCAL_DIRS", ""), ",") {
		dir = strings.TrimSpace(dir)
		if dir == "" {
			continue
		}
		allowDirs = append(allowDirs, dir)
	}
	flag.Var(&allowDirs, "allow-local-dir", "allowed local directory for sync jobs (repeatable); when set, localPath must be under one of these")

	allowHosts := stringSliceFlag{}
	for _, host := range strings.Split(getEnv("ALLOWED_HOSTS", ""), ",") {
		host = normalizeHost(host)
		if host == "" {
			continue
		}
		allowHosts = append(allowHosts, host)
	}
	flag.Var(&allowHosts, "allow-host", "allowed hostnames for Host/Origin checks (repeatable)")
	flag.Parse()
	if err := applyEnvConfigOverrides(&cfg, collectSetFlags(flag.CommandLine)); err != nil {
		log.Fatalf("invalid environment configuration: %v", err)
	}

	logger, err := logging.Setup(cfg.LogFormat)
	if err != nil {
		log.Fatalf("invalid LOG_FORMAT %q: %v", cfg.LogFormat, err)
	}
	level, err := logging.ParseLevel(cfg.LogLevel)
	if err != nil {
		log.Fatalf("invalid LOG_LEVEL %q: %v", cfg.LogLevel, err)
	}
	logger.SetLevel(level)

	cfg.AllowedLocalDirs = allowDirs
	cfg.AllowedHosts = normalizeHosts(allowHosts)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := app.Run(ctx, cfg); err != nil {
		logging.Fatalf("server error: %v", err)
	}
}

func defaultStaticDir() string {
	if val := os.Getenv("STATIC_DIR"); val != "" {
		return val
	}

	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		if hasIndexHTML(filepath.Join(exeDir, "ui")) {
			return filepath.Join(exeDir, "ui")
		}
	}

	candidates := []string{
		filepath.Join("dist", "ui"),
		filepath.Join("..", "dist", "ui"),
		"../frontend/dist",
	}
	for _, dir := range candidates {
		if hasIndexHTML(dir) {
			return dir
		}
	}
	return "../frontend/dist"
}

func hasIndexHTML(dir string) bool {
	info, err := os.Stat(filepath.Join(dir, "index.html"))
	return err == nil && !info.IsDir()
}

func normalizeHosts(hosts []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(hosts))
	for _, host := range hosts {
		host = normalizeHost(host)
		if host == "" {
			continue
		}
		if _, ok := seen[host]; ok {
			continue
		}
		seen[host] = struct{}{}
		out = append(out, host)
	}
	return out
}

func normalizeHost(host string) string {
	host = strings.TrimSpace(strings.ToLower(host))
	if host == "" {
		return ""
	}
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")
	return strings.TrimSuffix(host, ".")
}

func getEnv(key, defaultValue string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultValue
}

func collectSetFlags(fs *flag.FlagSet) map[string]struct{} {
	setFlags := map[string]struct{}{}
	fs.Visit(func(f *flag.Flag) {
		setFlags[f.Name] = struct{}{}
	})
	return setFlags
}

func flagWasSet(setFlags map[string]struct{}, name string) bool {
	_, ok := setFlags[name]
	return ok
}

func applyEnvConfigOverrides(cfg *config.Config, setFlags map[string]struct{}) error {
	if !flagWasSet(setFlags, "db-startup-timeout") {
		value, err := lookupEnvDuration("DB_STARTUP_TIMEOUT", cfg.DBStartupTimeout)
		if err != nil {
			return err
		}
		cfg.DBStartupTimeout = value
	}
	if !flagWasSet(setFlags, "db-startup-retry-interval") {
		value, err := lookupEnvDuration("DB_STARTUP_RETRY_INTERVAL", cfg.DBStartupRetryInterval)
		if err != nil {
			return err
		}
		cfg.DBStartupRetryInterval = value
	}
	if !flagWasSet(setFlags, "db-max-open-conns") {
		value, err := lookupEnvInt("DB_MAX_OPEN_CONNS", cfg.DBMaxOpenConns)
		if err != nil {
			return err
		}
		cfg.DBMaxOpenConns = value
	}
	if !flagWasSet(setFlags, "db-max-idle-conns") {
		value, err := lookupEnvInt("DB_MAX_IDLE_CONNS", cfg.DBMaxIdleConns)
		if err != nil {
			return err
		}
		cfg.DBMaxIdleConns = value
	}
	if !flagWasSet(setFlags, "db-conn-max-lifetime") {
		value, err := lookupEnvDuration("DB_CONN_MAX_LIFETIME", cfg.DBConnMaxLifetime)
		if err != nil {
			return err
		}
		cfg.DBConnMaxLifetime = value
	}
	if !flagWasSet(setFlags, "db-conn-max-idle-time") {
		value, err := lookupEnvDuration("DB_CONN_MAX_IDLE_TIME", cfg.DBConnMaxIdleTime)
		if err != nil {
			return err
		}
		cfg.DBConnMaxIdleTime = value
	}
	if !flagWasSet(setFlags, "allow-remote") {
		value, err := lookupEnvBool("ALLOW_REMOTE", cfg.AllowRemote)
		if err != nil {
			return err
		}
		cfg.AllowRemote = value
	}
	if !flagWasSet(setFlags, "job-concurrency") {
		value, err := lookupEnvInt("JOB_CONCURRENCY", cfg.JobConcurrency)
		if err != nil {
			return err
		}
		cfg.JobConcurrency = value
	}
	if !flagWasSet(setFlags, "job-log-max-bytes") {
		value, err := lookupEnvInt64("JOB_LOG_MAX_BYTES", cfg.JobLogMaxBytes)
		if err != nil {
			return err
		}
		cfg.JobLogMaxBytes = value
	}
	if !flagWasSet(setFlags, "job-log-emit-stdout") {
		value, err := lookupEnvBool("JOB_LOG_EMIT_STDOUT", cfg.JobLogEmitStdout)
		if err != nil {
			return err
		}
		cfg.JobLogEmitStdout = value
	}
	if !flagWasSet(setFlags, "job-retention") {
		value, err := lookupEnvDuration("JOB_RETENTION", cfg.JobRetention)
		if err != nil {
			return err
		}
		cfg.JobRetention = value
	}
	if !flagWasSet(setFlags, "job-log-retention") {
		value, err := lookupEnvDuration("JOB_LOG_RETENTION", cfg.JobLogRetention)
		if err != nil {
			return err
		}
		cfg.JobLogRetention = value
	}
	if !flagWasSet(setFlags, "upload-ttl") {
		value, err := lookupEnvDuration("UPLOAD_TTL", cfg.UploadSessionTTL)
		if err != nil {
			return err
		}
		cfg.UploadSessionTTL = value
	}
	if !flagWasSet(setFlags, "upload-max-bytes") {
		value, err := lookupEnvInt64("UPLOAD_MAX_BYTES", cfg.UploadMaxBytes)
		if err != nil {
			return err
		}
		cfg.UploadMaxBytes = value
	}
	if !flagWasSet(setFlags, "server-restore-max-bytes") {
		value, err := lookupEnvInt64("SERVER_RESTORE_MAX_BYTES", cfg.ServerRestoreMaxBytes)
		if err != nil {
			return err
		}
		cfg.ServerRestoreMaxBytes = value
	}
	if !flagWasSet(setFlags, "upload-direct-stream") {
		value, err := lookupEnvBool("UPLOAD_DIRECT_STREAM", cfg.UploadDirectStream)
		if err != nil {
			return err
		}
		cfg.UploadDirectStream = value
	}
	if !flagWasSet(setFlags, "upload-max-concurrent-requests") {
		value, err := lookupEnvInt("UPLOAD_MAX_CONCURRENT_REQUESTS", cfg.UploadMaxConcurrentRequests)
		if err != nil {
			return err
		}
		cfg.UploadMaxConcurrentRequests = value
	}
	if !flagWasSet(setFlags, "rclone-download-multi-thread-streams") {
		value, err := lookupEnvInt("RCLONE_DOWNLOAD_MULTI_THREAD_STREAMS", cfg.RcloneDownloadMultiThreadStreams)
		if err != nil {
			return err
		}
		cfg.RcloneDownloadMultiThreadStreams = value
	}
	if !flagWasSet(setFlags, "rclone-download-multi-thread-cutoff-mib") {
		value, err := lookupEnvInt("RCLONE_DOWNLOAD_MULTI_THREAD_CUTOFF_MIB", cfg.RcloneDownloadMultiThreadCutoffMiB)
		if err != nil {
			return err
		}
		cfg.RcloneDownloadMultiThreadCutoffMiB = value
	}
	if !flagWasSet(setFlags, "rclone-download-buffer-size-mib") {
		value, err := lookupEnvInt("RCLONE_DOWNLOAD_BUFFER_SIZE_MIB", cfg.RcloneDownloadBufferSizeMiB)
		if err != nil {
			return err
		}
		cfg.RcloneDownloadBufferSizeMiB = value
	}
	return nil
}

func lookupEnvInt(key string, defaultValue int) (int, error) {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return defaultValue, nil
	}
	parsed, err := strconv.Atoi(val)
	if err != nil {
		return 0, fmt.Errorf("invalid %s=%q: %w", key, val, err)
	}
	return parsed, nil
}

func lookupEnvInt64(key string, defaultValue int64) (int64, error) {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return defaultValue, nil
	}
	parsed, err := strconv.ParseInt(val, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid %s=%q: %w", key, val, err)
	}
	return parsed, nil
}

func lookupEnvDuration(key string, defaultValue time.Duration) (time.Duration, error) {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return defaultValue, nil
	}
	parsed, err := time.ParseDuration(val)
	if err != nil {
		return 0, fmt.Errorf("invalid %s=%q: %w", key, val, err)
	}
	return parsed, nil
}

func lookupEnvBool(key string, defaultValue bool) (bool, error) {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return defaultValue, nil
	}
	switch strings.ToLower(val) {
	case "1", "true", "t", "yes", "y", "on":
		return true, nil
	case "0", "false", "f", "no", "n", "off":
		return false, nil
	default:
		return false, fmt.Errorf("invalid %s=%q: expected boolean value", key, val)
	}
}
