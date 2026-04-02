package config

import (
	"net"
	"strings"
)

const (
	WarningRemoteWithoutAllowedLocalDirs = "ALLOW_REMOTE is enabled but ALLOWED_LOCAL_DIRS is empty. Startup fails closed for this configuration; set ALLOWED_LOCAL_DIRS to constrain local sync reads and writes."
	WarningRemoteWithoutAllowedHosts     = "ALLOW_REMOTE is enabled on a non-loopback addr but ALLOWED_HOSTS is empty. Startup fails closed for this configuration; set ALLOWED_HOSTS to restrict accepted Host and Origin values."
	WarningEncryptionKeyUnset            = "ENCRYPTION_KEY is not configured. Profile secrets and mTLS material are not encrypted at rest, and clear backup bundles cannot include server-key HMAC integrity verification."
)

func OperationalWarnings(cfg Config) []string {
	warnings := make([]string, 0, 3)
	if cfg.AllowRemote && !warningListenAddrIsLoopback(cfg.Addr) && len(nonEmptyStrings(cfg.AllowedHosts)) == 0 {
		warnings = append(warnings, WarningRemoteWithoutAllowedHosts)
	}
	if cfg.AllowRemote && len(nonEmptyStrings(cfg.AllowedLocalDirs)) == 0 {
		warnings = append(warnings, WarningRemoteWithoutAllowedLocalDirs)
	}
	if strings.TrimSpace(cfg.EncryptionKey) == "" {
		warnings = append(warnings, WarningEncryptionKeyUnset)
	}
	return warnings
}

func nonEmptyStrings(values []string) []string {
	trimmed := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		trimmed = append(trimmed, value)
	}
	return trimmed
}

func warningListenAddrIsLoopback(addr string) bool {
	host, _, err := warningSplitListenAddr(addr)
	if err != nil {
		return false
	}
	if host == "" {
		return true
	}
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func warningSplitListenAddr(addr string) (host string, port string, err error) {
	host, port, err = net.SplitHostPort(addr)
	if err == nil {
		return host, port, nil
	}
	if strings.Contains(addr, ":") {
		return "", "", err
	}
	return addr, "", nil
}
