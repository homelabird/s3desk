package main

import (
	"context"
	"flag"
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
	flag.StringVar(&cfg.DataDir, "data-dir", getEnv("DATA_DIR", "./data"), "data directory (sqlite db, staging, logs)")
	flag.StringVar(&cfg.DBBackend, "db-backend", getEnv("DB_BACKEND", "sqlite"), "database backend (sqlite or postgres)")
	flag.StringVar(&cfg.DatabaseURL, "database-url", getEnv("DATABASE_URL", ""), "postgres connection string (required when db-backend=postgres)")
	flag.IntVar(&cfg.DBMaxOpenConns, "db-max-open-conns", getEnvInt("DB_MAX_OPEN_CONNS", 0), "max open db connections (0=default)")
	flag.IntVar(&cfg.DBMaxIdleConns, "db-max-idle-conns", getEnvInt("DB_MAX_IDLE_CONNS", 0), "max idle db connections (0=default)")
	flag.DurationVar(&cfg.DBConnMaxLifetime, "db-conn-max-lifetime", getEnvDuration("DB_CONN_MAX_LIFETIME", 0), "max db connection lifetime (0=default)")
	flag.DurationVar(&cfg.DBConnMaxIdleTime, "db-conn-max-idle-time", getEnvDuration("DB_CONN_MAX_IDLE_TIME", 0), "max db connection idle time (0=default)")
	flag.StringVar(&cfg.LogFormat, "log-format", getEnv("LOG_FORMAT", "text"), "log format (text or json)")
	flag.StringVar(&cfg.LogLevel, "log-level", getEnv("LOG_LEVEL", "info"), "log level (debug, info, warn, error)")
	flag.StringVar(&cfg.StaticDir, "static-dir", defaultStaticDir(), "static files directory (frontend build output)")
	flag.StringVar(&cfg.APIToken, "api-token", getEnv("API_TOKEN", ""), "optional local API token (X-Api-Token)")
	flag.BoolVar(&cfg.AllowRemote, "allow-remote", getEnvBool("ALLOW_REMOTE", false), "allow non-local bind and accept private remote clients (requires API_TOKEN when using a non-loopback addr)")
	flag.StringVar(&cfg.EncryptionKey, "encryption-key", getEnv("ENCRYPTION_KEY", ""), "optional base64 key to encrypt profile credentials at rest")
	flag.IntVar(&cfg.JobConcurrency, "job-concurrency", getEnvInt("JOB_CONCURRENCY", 2), "max concurrent jobs")
	flag.Int64Var(&cfg.JobLogMaxBytes, "job-log-max-bytes", getEnvInt64("JOB_LOG_MAX_BYTES", 0), "max bytes per job log file (0=unlimited)")
	flag.BoolVar(&cfg.JobLogEmitStdout, "job-log-emit-stdout", getEnvBool("JOB_LOG_EMIT_STDOUT", false), "emit job logs to stdout as JSON lines")
	flag.DurationVar(&cfg.JobRetention, "job-retention", getEnvDuration("JOB_RETENTION", 0), "delete finished jobs older than this duration (0=keep forever)")
	flag.DurationVar(&cfg.JobLogRetention, "job-log-retention", getEnvDuration("JOB_LOG_RETENTION", 0), "delete job log files older than this duration (0=keep forever)")
	flag.DurationVar(&cfg.UploadSessionTTL, "upload-ttl", getEnvDuration("UPLOAD_TTL", 24*time.Hour), "upload session TTL")
	flag.Int64Var(&cfg.UploadMaxBytes, "upload-max-bytes", getEnvInt64("UPLOAD_MAX_BYTES", 0), "max total bytes per upload session (0=unlimited)")
	flag.BoolVar(&cfg.UploadDirectStream, "upload-direct-stream", getEnvBool("UPLOAD_DIRECT_STREAM", false), "stream uploads directly to the provider (disables staging)")
	flag.IntVar(&cfg.RcloneDownloadMultiThreadStreams, "rclone-download-multi-thread-streams", getEnvInt("RCLONE_DOWNLOAD_MULTI_THREAD_STREAMS", 16), "rclone --multi-thread-streams for API downloads (0=use rclone default)")
	flag.IntVar(&cfg.RcloneDownloadMultiThreadCutoffMiB, "rclone-download-multi-thread-cutoff-mib", getEnvInt("RCLONE_DOWNLOAD_MULTI_THREAD_CUTOFF_MIB", 4), "rclone --multi-thread-cutoff for API downloads, in MiB (0=use rclone default)")
	flag.IntVar(&cfg.RcloneDownloadBufferSizeMiB, "rclone-download-buffer-size-mib", getEnvInt("RCLONE_DOWNLOAD_BUFFER_SIZE_MIB", 128), "rclone --buffer-size for API downloads, in MiB (0=use rclone default)")

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

func getEnvInt(key string, defaultValue int) int {
	val := os.Getenv(key)
	if val == "" {
		return defaultValue
	}
	parsed, err := strconv.Atoi(val)
	if err != nil {
		return defaultValue
	}
	return parsed
}

func getEnvInt64(key string, defaultValue int64) int64 {
	val := os.Getenv(key)
	if val == "" {
		return defaultValue
	}
	parsed, err := strconv.ParseInt(val, 10, 64)
	if err != nil {
		return defaultValue
	}
	return parsed
}

func getEnvDuration(key string, defaultValue time.Duration) time.Duration {
	val := os.Getenv(key)
	if val == "" {
		return defaultValue
	}
	parsed, err := time.ParseDuration(val)
	if err != nil {
		return defaultValue
	}
	return parsed
}

func getEnvBool(key string, defaultValue bool) bool {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return defaultValue
	}
	switch strings.ToLower(val) {
	case "1", "true", "t", "yes", "y", "on":
		return true
	case "0", "false", "f", "no", "n", "off":
		return false
	default:
		return defaultValue
	}
}
