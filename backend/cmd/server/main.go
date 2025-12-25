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

	"object-storage/internal/app"
	"object-storage/internal/config"
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
	flag.StringVar(&cfg.DataDir, "data-dir", getEnv("DATA_DIR", "./data"), "data directory (db, staging, logs)")
	flag.StringVar(&cfg.StaticDir, "static-dir", defaultStaticDir(), "static files directory (frontend build output)")
	flag.StringVar(&cfg.APIToken, "api-token", getEnv("API_TOKEN", ""), "optional local API token (X-Api-Token)")
	flag.BoolVar(&cfg.AllowRemote, "allow-remote", getEnvBool("ALLOW_REMOTE", false), "allow non-local bind and accept private remote clients (requires API_TOKEN when using a non-loopback addr)")
	flag.StringVar(&cfg.EncryptionKey, "encryption-key", getEnv("ENCRYPTION_KEY", ""), "optional base64 key to encrypt profile credentials at rest")
	flag.IntVar(&cfg.JobConcurrency, "job-concurrency", getEnvInt("JOB_CONCURRENCY", 2), "max concurrent jobs")
	flag.Int64Var(&cfg.JobLogMaxBytes, "job-log-max-bytes", getEnvInt64("JOB_LOG_MAX_BYTES", 0), "max bytes per job log file (0=unlimited)")
	flag.DurationVar(&cfg.JobRetention, "job-retention", getEnvDuration("JOB_RETENTION", 0), "delete finished jobs older than this duration (0=keep forever)")
	flag.DurationVar(&cfg.UploadSessionTTL, "upload-ttl", getEnvDuration("UPLOAD_TTL", 24*time.Hour), "upload session TTL")
	flag.Int64Var(&cfg.UploadMaxBytes, "upload-max-bytes", getEnvInt64("UPLOAD_MAX_BYTES", 0), "max total bytes per upload session (0=unlimited)")

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

	cfg.AllowedLocalDirs = allowDirs
	cfg.AllowedHosts = normalizeHosts(allowHosts)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := app.Run(ctx, cfg); err != nil {
		log.Fatalf("server error: %v", err)
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
