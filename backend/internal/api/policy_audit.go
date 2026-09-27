package api

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"s3desk/internal/logging"
	"s3desk/internal/version"
)

// Bump when raw policy, typed governance, or shared provider validation rules change.
// This identifies application checks, not the provider API version or live validation.
const policyValidationRulesVersion = "2026-09-27.10"

// policyAudit runs after API-token and profile authorization. Bodies are never logged.
func (s *server) policyAudit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut && r.Method != http.MethodDelete {
			next.ServeHTTP(w, r)
			return
		}
		logging.InfoFields("bucket policy change started", s.policyAuditFields(r, 0))
		wrapped := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(wrapped, r)
		status := wrapped.Status()
		if status == 0 {
			status = http.StatusOK
		}
		fields := s.policyAuditFields(r, status)
		if status >= 400 {
			logging.WarnFields("bucket policy change unconfirmed", fields)
		} else {
			logging.InfoFields("bucket policy change response", fields)
		}
	})
}

func (s *server) policyAuditFields(r *http.Request, status int) map[string]any {
	actor := "authentication_disabled"
	if s.cfg.APIToken != "" {
		digest := sha256.Sum256([]byte(s.cfg.APIToken))
		actor = "api_token_sha256:" + hex.EncodeToString(digest[:])
	}
	profile, _ := profileFromContext(r.Context())
	outcome := "started"
	if status >= 200 && status < 300 {
		outcome = "accepted_unverified"
	} else if status != 0 {
		outcome = "unconfirmed"
	}
	return map[string]any{
		"event": "bucket.policy.change", "audit_schema_version": 1,
		"validation_rules_version": policyValidationRulesVersion, "app_version": version.Version,
		"actor_credential": actor, "profile_id": profile.ID, "provider": string(profile.Provider),
		"bucket": chi.URLParam(r, "bucket"), "method": r.Method, "path": r.URL.Path,
		"request_id": middleware.GetReqID(r.Context()), "http_status": status, "outcome": outcome,
	}
}
