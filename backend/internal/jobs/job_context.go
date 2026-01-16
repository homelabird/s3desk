package jobs

import (
	"context"
	"strings"
)

type ctxKey string

const ctxKeyJobType ctxKey = "jobType"

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
