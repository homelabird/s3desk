package api

import (
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
	proxySecret     []byte
	realtimeTickets *realtimeTicketStore
	authLimit       *authFailureLimiter
	uploadLimit     *requestLimiter
	bucketGov       *bucketgov.Service
	restoreMu       sync.RWMutex
}

type contextKey string

const (
	profileIDKey      contextKey = "profile_id"
	profileSecretsKey contextKey = "profile_secrets"
)
