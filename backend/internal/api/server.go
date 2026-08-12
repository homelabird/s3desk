package api

import (
	"context"
	"sync"

	"s3desk/internal/bucketgov"
	"s3desk/internal/config"
	"s3desk/internal/jobs"
	"s3desk/internal/metrics"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

type server struct {
	cfg             config.Config
	store           *store.Store
	jobs            *jobs.Manager
	hub             *ws.Hub
	metrics         *metrics.Metrics
	serverAddr      string
	shutdownContext context.Context
	proxySecret     []byte
	realtimeTickets *realtimeTicketStore
	authLimit       *authFailureLimiter
	uploadLimit     *requestLimiter
	realtimeLimit   *requestLimiter
	realtimeMax     int
	bucketGov       *bucketgov.Service
	restoreMu       sync.RWMutex
	// ponytail: process-local create lock; replace with a durable claim if HA is supported.
	multipartStateMu sync.Mutex
}

type contextKey string

const (
	profileIDKey      contextKey = "profile_id"
	profileSecretsKey contextKey = "profile_secrets"
)
