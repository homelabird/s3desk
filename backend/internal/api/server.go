package api

import (
	"object-storage/internal/config"
	"object-storage/internal/jobs"
	"object-storage/internal/models"
	"object-storage/internal/store"
	"object-storage/internal/ws"
)

type server struct {
	cfg        config.Config
	store      *store.Store
	jobs       *jobs.Manager
	hub        *ws.Hub
	serverAddr string
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
