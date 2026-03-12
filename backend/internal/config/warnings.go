package config

import "strings"

const (
	WarningRemoteWithoutAllowedLocalDirs = "ALLOW_REMOTE is enabled but ALLOWED_LOCAL_DIRS is empty. Remote job payloads can reference any local path permitted by the OS; set ALLOWED_LOCAL_DIRS to constrain local sync reads and writes."
	WarningEncryptionKeyUnset            = "ENCRYPTION_KEY is not configured. Profile secrets and mTLS material are not encrypted at rest, and clear backup bundles cannot include server-key HMAC integrity verification."
)

func OperationalWarnings(cfg Config) []string {
	warnings := make([]string, 0, 2)
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
