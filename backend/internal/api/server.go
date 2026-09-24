package api

import (
	"context"
	"sync"

	"s3desk/internal/bucketgov"
	"s3desk/internal/config"
	"s3desk/internal/jobs"
	"s3desk/internal/keyedmutex"
	"s3desk/internal/metrics"
	"s3desk/internal/store"
	"s3desk/internal/streamlimit"
	"s3desk/internal/ws"
)

type server struct {
	cfg               config.Config
	store             *store.Store
	jobs              *jobs.Manager
	hub               *ws.Hub
	metrics           *metrics.Metrics
	serverAddr        string
	shutdownContext   context.Context
	proxySecret       []byte
	realtimeTickets   *realtimeTicketStore
	authLimit         *authFailureLimiter
	downloadLimitOnce sync.Once
	downloadLimit     *streamlimit.Limiter
	uploadLimit       *requestLimiter
	realtimeLimit     *requestLimiter
	realtimeMax       int
	bucketGov         *bucketgov.Service
	restoreMu         sync.RWMutex
	// ponytail: global process-local object transition fence; use per-object durable claims if HA or promotion throughput matters.
	uploadObjectStateMu sync.Mutex
	indexJobMu          keyedmutex.Mutex[indexJobKey]
	// Serialize only the same upload object, not every profile and file.
	multipartStateMu keyedmutex.Mutex[multipartStateKey]
}

type contextKey string

const (
	profileIDKey      contextKey = "profile_id"
	profileSecretsKey contextKey = "profile_secrets"
)

// Structured keys avoid collisions between profile, session and object paths.
type multipartStateKey struct{ profileID, uploadID, path string }
type indexJobKey struct {
	profileID, bucket, prefix string
	fullReindex               bool
}
