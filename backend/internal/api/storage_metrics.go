package api

import (
	"strings"
	"time"
)

type storageMetric struct {
	server    *server
	provider  string
	operation string
	status    string
	startedAt time.Time
}

func (s *server) beginStorageMetric(provider, operation string) *storageMetric {
	return &storageMetric{
		server:    s,
		provider:  normalizeStorageMetricProvider(provider),
		operation: normalizeStorageMetricOperation(operation),
		status:    "error",
		startedAt: time.Now(),
	}
}

func (m *storageMetric) SetProvider(provider string) {
	if m == nil {
		return
	}
	m.provider = normalizeStorageMetricProvider(provider)
}

func (m *storageMetric) SetStatus(status string) {
	if m == nil {
		return
	}
	m.status = normalizeStorageMetricStatus(status)
}

func (m *storageMetric) Observe() {
	if m == nil || m.server == nil || m.server.metrics == nil {
		return
	}
	m.server.metrics.ObserveStorageOperation(m.provider, m.operation, m.status, time.Since(m.startedAt))
}

func normalizeStorageMetricProvider(provider string) string {
	provider = strings.TrimSpace(provider)
	if provider == "" {
		return "unknown"
	}
	return provider
}

func normalizeStorageMetricOperation(operation string) string {
	operation = strings.TrimSpace(operation)
	if operation == "" {
		return "unknown"
	}
	return operation
}

func normalizeStorageMetricStatus(status string) string {
	switch strings.TrimSpace(status) {
	case "success", "cache_hit", "db_only", "proxy_only":
		return status
	case "missing_profile", "invalid_request", "invalid_json", "invalid_config", "client_error":
		return "client_error"
	case "unauthorized", "invalid_credentials", "auth_error":
		return "auth_error"
	case "not_found":
		return "not_found"
	case "unsupported", "thumbnail_engine_missing", "too_large":
		return "unsupported"
	case "internal_error":
		return "internal_error"
	case "remote_error", "endpoint_unreachable", "s3_error", "invalid_request_upstream":
		return "remote_error"
	default:
		return "error"
	}
}
