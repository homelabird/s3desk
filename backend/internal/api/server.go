package api

import (
	"s3desk/internal/config"
	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/store"
	"s3desk/internal/ws"
)

type server struct {
	cfg         config.Config
	store       *store.Store
	jobs        *jobs.Manager
	hub         *ws.Hub
	serverAddr  string
	proxySecret []byte
}

type contextKey string

const (
	profileIDKey      contextKey = "profile_id"
	profileSecretsKey contextKey = "profile_secrets"
)

type profileContext struct {
	ID      string
	Secrets models.ProfileSecrets
}
