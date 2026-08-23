package jobs

import (
	"context"
	"strings"

	"s3desk/internal/models"
)

type ctxKey string

const (
	ctxKeyJobType        ctxKey = "jobType"
	ctxKeyProfileSecrets ctxKey = "profileSecrets"
)

func withJobType(ctx context.Context, jobType string) context.Context {
	return context.WithValue(ctx, ctxKeyJobType, jobType)
}

func jobTypeFromContext(ctx context.Context) (string, bool) {
	v := ctx.Value(ctxKeyJobType)
	s, ok := v.(string)
	if !ok {
		return "", false
	}
	s = strings.TrimSpace(s)
	if s == "" {
		return "", false
	}
	return s, true
}

func withProfileSecrets(ctx context.Context, secrets models.ProfileSecrets) context.Context {
	return context.WithValue(ctx, ctxKeyProfileSecrets, secrets)
}

func (m *Manager) profileSecrets(ctx context.Context, profileID string) (models.ProfileSecrets, bool, error) {
	if secrets, ok := ctx.Value(ctxKeyProfileSecrets).(models.ProfileSecrets); ok && secrets.ID == profileID {
		return secrets, true, nil
	}
	return m.store.GetProfileSecrets(ctx, profileID)
}
