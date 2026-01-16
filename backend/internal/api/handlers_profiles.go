package api

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"gopkg.in/yaml.v3"

	"s3desk/internal/jobs"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

func (s *server) handleListProfiles(w http.ResponseWriter, r *http.Request) {
	profiles, err := s.store.ListProfiles(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to list profiles", nil)
		return
	}
	writeJSON(w, http.StatusOK, profiles)
}

func (s *server) handleCreateProfile(w http.ResponseWriter, r *http.Request) {
	var req models.ProfileCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	provider := models.ProfileProvider(strings.TrimSpace(string(req.Provider)))
	if provider == "" {
		// Backwards compatibility for older clients.
		provider = models.ProfileProviderS3Compatible
	}
	req.Provider = provider

	trimPtrNilIfEmpty := func(p **string) {
		if *p == nil {
			return
		}
		v := strings.TrimSpace(**p)
		if v == "" {
			*p = nil
			return
		}
		*p = &v
	}

	// Trim optional string fields (and normalize empty to nil where it makes sense).
	trimPtrNilIfEmpty(&req.Endpoint)
	trimPtrNilIfEmpty(&req.Region)
	trimPtrNilIfEmpty(&req.AccessKeyID)
	trimPtrNilIfEmpty(&req.SecretAccessKey)
	trimPtrNilIfEmpty(&req.SessionToken)
	trimPtrNilIfEmpty(&req.AccountName)
	trimPtrNilIfEmpty(&req.AccountKey)
	trimPtrNilIfEmpty(&req.ServiceAccountJSON)
	trimPtrNilIfEmpty(&req.ProjectNumber)
	trimPtrNilIfEmpty(&req.Namespace)
	trimPtrNilIfEmpty(&req.Compartment)
	trimPtrNilIfEmpty(&req.AuthProvider)
	trimPtrNilIfEmpty(&req.ConfigFile)
	trimPtrNilIfEmpty(&req.ConfigProfile)

	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "name is required", nil)
		return
	}

	switch provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible, models.ProfileProviderOciS3Compat:
		// Validate S3-style providers.
		if provider != models.ProfileProviderAwsS3 {
			if req.Endpoint == nil || strings.TrimSpace(*req.Endpoint) == "" {
				writeError(w, http.StatusBadRequest, "invalid_request", "endpoint is required", nil)
				return
			}
		}
		if req.Region == nil || strings.TrimSpace(*req.Region) == "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "region is required", nil)
			return
		}
		if req.AccessKeyID == nil || strings.TrimSpace(*req.AccessKeyID) == "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "accessKeyId is required", nil)
			return
		}
		if req.SecretAccessKey == nil || strings.TrimSpace(*req.SecretAccessKey) == "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "secretAccessKey is required", nil)
			return
		}
		// forcePathStyle is required by OpenAPI; default to false for leniency.
		if req.ForcePathStyle == nil {
			f := false
			req.ForcePathStyle = &f
		}
		// Reject fields from other providers.
		if req.AccountName != nil || req.AccountKey != nil || req.UseEmulator != nil || req.ServiceAccountJSON != nil || req.Anonymous != nil || req.ProjectNumber != nil || req.Namespace != nil || req.Compartment != nil || req.AuthProvider != nil || req.ConfigFile != nil || req.ConfigProfile != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", "unexpected fields for s3 provider", nil)
			return
		}

	case models.ProfileProviderAzureBlob:
		if req.AccountName == nil || *req.AccountName == "" || req.AccountKey == nil || *req.AccountKey == "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "accountName and accountKey are required", nil)
			return
		}
		if req.Region != nil || req.AccessKeyID != nil || req.SecretAccessKey != nil || req.SessionToken != nil || req.ForcePathStyle != nil || req.ServiceAccountJSON != nil || req.Anonymous != nil || req.ProjectNumber != nil || req.Namespace != nil || req.Compartment != nil || req.AuthProvider != nil || req.ConfigFile != nil || req.ConfigProfile != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", "unexpected fields for azure_blob", nil)
			return
		}

	case models.ProfileProviderGcpGcs:
		anonymous := req.Anonymous != nil && *req.Anonymous
		if !anonymous {
			if req.ServiceAccountJSON == nil || *req.ServiceAccountJSON == "" {
				writeError(w, http.StatusBadRequest, "invalid_request", "serviceAccountJson is required unless anonymous=true", nil)
				return
			}
		}
		if req.Region != nil || req.AccessKeyID != nil || req.SecretAccessKey != nil || req.SessionToken != nil || req.ForcePathStyle != nil || req.AccountName != nil || req.AccountKey != nil || req.UseEmulator != nil || req.Namespace != nil || req.Compartment != nil || req.AuthProvider != nil || req.ConfigFile != nil || req.ConfigProfile != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", "unexpected fields for gcp_gcs", nil)
			return
		}

	case models.ProfileProviderOciObjectStorage:
		if req.Region == nil || strings.TrimSpace(*req.Region) == "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "region is required", nil)
			return
		}
		if req.Namespace == nil || strings.TrimSpace(*req.Namespace) == "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "namespace is required", nil)
			return
		}
		if req.Compartment == nil || strings.TrimSpace(*req.Compartment) == "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "compartment is required", nil)
			return
		}
		if req.AccessKeyID != nil || req.SecretAccessKey != nil || req.SessionToken != nil || req.ForcePathStyle != nil || req.AccountName != nil || req.AccountKey != nil || req.UseEmulator != nil || req.ServiceAccountJSON != nil || req.Anonymous != nil || req.ProjectNumber != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", "unexpected fields for oci_object_storage", nil)
			return
		}
	default:
		writeError(w, http.StatusBadRequest, "invalid_request", "unknown provider", map[string]any{"provider": provider})
		return
	}

	profile, err := s.store.CreateProfile(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to create profile", map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, profile)
}

func (s *server) handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	profileID := chi.URLParam(r, "profileId")
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profileId is required", nil)
		return
	}

	var req models.ProfileUpdateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}

	// Trim all string pointer fields in-place. For update requests, an explicit empty string
	// can be meaningful (e.g. clearing sessionToken), so we don't nil them out.
	trimPtr := func(p **string) {
		if *p == nil {
			return
		}
		v := strings.TrimSpace(**p)
		*p = &v
	}

	if strings.TrimSpace(string(req.Provider)) != "" {
		p := strings.TrimSpace(string(req.Provider))
		req.Provider = models.ProfileProvider(p)
	}
	trimPtr(&req.Name)
	trimPtr(&req.Endpoint)
	trimPtr(&req.Region)
	trimPtr(&req.AccessKeyID)
	trimPtr(&req.SecretAccessKey)
	trimPtr(&req.SessionToken)
	trimPtr(&req.AccountName)
	trimPtr(&req.AccountKey)
	trimPtr(&req.ServiceAccountJSON)
	trimPtr(&req.ProjectNumber)
	trimPtr(&req.Namespace)
	trimPtr(&req.Compartment)
	trimPtr(&req.AuthProvider)
	trimPtr(&req.ConfigFile)
	trimPtr(&req.ConfigProfile)
	trimPtr(&req.ProjectNumber)
	trimPtr(&req.Namespace)
	trimPtr(&req.Compartment)
	trimPtr(&req.AuthProvider)
	trimPtr(&req.ConfigFile)
	trimPtr(&req.ConfigProfile)

	if req.Name != nil && *req.Name == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "name must not be empty", nil)
		return
	}
	if req.AccessKeyID != nil && *req.AccessKeyID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "accessKeyId must not be empty", nil)
		return
	}
	if req.SecretAccessKey != nil && *req.SecretAccessKey == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "secretAccessKey must not be empty", nil)
		return
	}

	profile, ok, err := s.store.UpdateProfile(r.Context(), profileID, req)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrEncryptedCredentials):
			writeError(w, http.StatusBadRequest, "encrypted_credentials", err.Error(), nil)
		case errors.Is(err, store.ErrEncryptionKeyRequired):
			writeError(w, http.StatusBadRequest, "encryption_required", err.Error(), nil)
		default:
			// Most UpdateProfile errors are user-input validation errors.
			writeError(w, http.StatusBadRequest, "invalid_request", "failed to update profile", map[string]any{"error": err.Error()})
		}
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "profile not found", map[string]any{"profileId": profileID})
		return
	}

	writeJSON(w, http.StatusOK, profile)
}

func (s *server) handleDeleteProfile(w http.ResponseWriter, r *http.Request) {
	profileID := chi.URLParam(r, "profileId")
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profileId is required", nil)
		return
	}

	// Best-effort cleanup of local artifacts (logs, staging) before cascading deletes.
	if runningIDs, err := s.store.ListJobIDsByProfileAndStatus(r.Context(), profileID, models.JobStatusRunning); err == nil {
		for _, id := range runningIDs {
			s.jobs.Cancel(id)
		}
	}
	if jobIDs, err := s.store.ListJobIDsByProfile(r.Context(), profileID); err == nil {
		for _, id := range jobIDs {
			_ = os.Remove(filepath.Join(s.cfg.DataDir, "logs", "jobs", id+".log"))
		}
	}
	if sessions, err := s.store.ListUploadSessionsByProfile(r.Context(), profileID, 10_000); err == nil {
		for _, us := range sessions {
			if us.StagingDir != "" {
				_ = os.RemoveAll(us.StagingDir)
			}
		}
	}

	ok, err := s.store.DeleteProfile(r.Context(), profileID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to delete profile", nil)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "profile not found", map[string]any{"profileId": profileID})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleTestProfile(w http.ResponseWriter, r *http.Request) {
	profileID := chi.URLParam(r, "profileId")
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profileId is required", nil)
		return
	}

	ok, details, err := s.jobs.TestConnectivity(r.Context(), profileID)
	if err != nil {
		switch {
		case errors.Is(err, jobs.ErrProfileNotFound):
			writeError(w, http.StatusNotFound, "not_found", "profile not found", map[string]any{"profileId": profileID})
			return
		case errors.Is(err, jobs.ErrRcloneNotFound):
			writeError(w, http.StatusBadRequest, "transfer_engine_missing", "rclone is required to test connectivity (install it or set RCLONE_PATH)", nil)
			return
		default:
			var inc *jobs.RcloneIncompatibleError
			if errors.As(err, &inc) {
				writeError(w, http.StatusBadRequest, "transfer_engine_incompatible", "rclone version is incompatible", map[string]any{"currentVersion": inc.CurrentVersion, "minVersion": inc.MinVersion})
				return
			}
		}

		writeError(w, http.StatusBadRequest, "test_failed", "profile test failed", map[string]any{"error": err.Error()})
		return
	}

	resp := models.ProfileTestResponse{OK: ok}
	if ok {
		resp.Message = "ok"
	} else {
		resp.Message = "failed"
	}
	resp.Details = details
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleExportProfile(w http.ResponseWriter, r *http.Request) {
	profileID := chi.URLParam(r, "profileId")
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "profileId is required", nil)
		return
	}

	secrets, ok, err := s.store.GetProfileSecrets(r.Context(), profileID)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrEncryptedCredentials):
			writeError(w, http.StatusBadRequest, "encrypted_credentials", err.Error(), nil)
		case errors.Is(err, store.ErrEncryptionKeyRequired):
			writeError(w, http.StatusBadRequest, "encryption_required", err.Error(), nil)
		default:
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to load profile", nil)
		}
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "profile not found", map[string]any{"profileId": profileID})
		return
	}

	exportProfile := profileExportProfile{
		ID:                    secrets.ID,
		Name:                  secrets.Name,
		Provider:              secrets.Provider,
		PreserveLeadingSlash:  secrets.PreserveLeadingSlash,
		TLSInsecureSkipVerify: secrets.TLSInsecureSkipVerify,
	}
	switch secrets.Provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible, models.ProfileProviderOciS3Compat:
		force := secrets.ForcePathStyle
		exportProfile.Endpoint = secrets.Endpoint
		exportProfile.Region = secrets.Region
		exportProfile.AccessKeyID = secrets.AccessKeyID
		exportProfile.SecretAccessKey = secrets.SecretAccessKey
		exportProfile.SessionToken = secrets.SessionToken
		exportProfile.ForcePathStyle = &force

	case models.ProfileProviderAzureBlob:
		exportProfile.AccountName = secrets.AzureAccountName
		exportProfile.AccountKey = secrets.AzureAccountKey
		exportProfile.Endpoint = secrets.AzureEndpoint
		if secrets.AzureUseEmulator {
			v := true
			exportProfile.UseEmulator = &v
		}

	case models.ProfileProviderGcpGcs:
		exportProfile.ServiceAccountJSON = secrets.GcpServiceAccountJSON
		exportProfile.Endpoint = secrets.GcpEndpoint
		if secrets.GcpAnonymous {
			v := true
			exportProfile.Anonymous = &v
		}
		exportProfile.ProjectNumber = secrets.GcpProjectNumber

	case models.ProfileProviderOciObjectStorage:
		exportProfile.Region = secrets.Region
		exportProfile.Endpoint = secrets.OciEndpoint
		exportProfile.Namespace = secrets.OciNamespace
		exportProfile.Compartment = secrets.OciCompartment
		exportProfile.AuthProvider = secrets.OciAuthProvider
		exportProfile.ConfigFile = secrets.OciConfigFile
		exportProfile.ConfigProfile = secrets.OciConfigProfile
	}

	export := profileExport{Profile: exportProfile}

	if secrets.TLSConfig != nil {
		tls := profileExportTLS{
			Mode:          secrets.TLSConfig.Mode,
			ClientCertPEM: secrets.TLSConfig.ClientCertPEM,
			ClientKeyPEM:  secrets.TLSConfig.ClientKeyPEM,
			CACertPEM:     secrets.TLSConfig.CACertPEM,
		}
		if strings.TrimSpace(secrets.TLSConfigUpdatedAt) != "" {
			tls.UpdatedAt = secrets.TLSConfigUpdatedAt
		}
		export.TLS = &tls
	}

	data, err := yaml.Marshal(export)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to serialize profile export", nil)
		return
	}

	if wantsDownload(r) {
		filename := buildProfileExportFilename(secrets.Name, secrets.ID)
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	}
	if w.Header().Get("Content-Type") == "" {
		w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

type profileExport struct {
	Profile profileExportProfile `yaml:"profile"`
	TLS     *profileExportTLS    `yaml:"tls,omitempty"`
}

type profileExportProfile struct {
	ID       string                 `yaml:"id,omitempty"`
	Name     string                 `yaml:"name"`
	Provider models.ProfileProvider `yaml:"provider,omitempty"`

	// Common-ish (used by multiple providers)
	Endpoint string `yaml:"endpoint,omitempty"`
	Region   string `yaml:"region,omitempty"`

	// S3-style
	AccessKeyID     string  `yaml:"accessKeyId,omitempty"`
	SecretAccessKey string  `yaml:"secretAccessKey,omitempty"`
	SessionToken    *string `yaml:"sessionToken,omitempty"`
	ForcePathStyle  *bool   `yaml:"forcePathStyle,omitempty"`

	// Azure Blob
	AccountName string `yaml:"accountName,omitempty"`
	AccountKey  string `yaml:"accountKey,omitempty"`
	UseEmulator *bool  `yaml:"useEmulator,omitempty"`

	// GCP GCS
	ServiceAccountJSON string `yaml:"serviceAccountJson,omitempty"`
	Anonymous          *bool  `yaml:"anonymous,omitempty"`
	ProjectNumber      string `yaml:"projectNumber,omitempty"`

	// OCI Object Storage
	Namespace     string `yaml:"namespace,omitempty"`
	Compartment   string `yaml:"compartment,omitempty"`
	AuthProvider  string `yaml:"authProvider,omitempty"`
	ConfigFile    string `yaml:"configFile,omitempty"`
	ConfigProfile string `yaml:"configProfile,omitempty"`

	PreserveLeadingSlash  bool `yaml:"preserveLeadingSlash"`
	TLSInsecureSkipVerify bool `yaml:"tlsInsecureSkipVerify"`
}

type profileExportTLS struct {
	Mode          models.ProfileTLSMode `yaml:"mode"`
	ClientCertPEM string                `yaml:"clientCertPem,omitempty"`
	ClientKeyPEM  string                `yaml:"clientKeyPem,omitempty"`
	CACertPEM     string                `yaml:"caCertPem,omitempty"`
	UpdatedAt     string                `yaml:"updatedAt,omitempty"`
}

func wantsDownload(r *http.Request) bool {
	value := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("download")))
	return value == "1" || value == "true" || value == "yes"
}

func buildProfileExportFilename(name, id string) string {
	base := sanitizeExportFilename(name)
	if base == "" {
		base = sanitizeExportFilename(id)
	}
	if base == "" {
		base = "profile"
	}
	return fmt.Sprintf("%s.yaml", base)
}

func sanitizeExportFilename(value string) string {
	cleaned := strings.TrimSpace(value)
	if cleaned == "" {
		return ""
	}
	replacer := strings.NewReplacer(
		"\\", "-",
		"/", "-",
		":", "-",
		"*", "-",
		"?", "-",
		"\"", "-",
		"<", "-",
		">", "-",
		"|", "-",
	)
	cleaned = replacer.Replace(cleaned)
	cleaned = strings.Join(strings.Fields(cleaned), "_")
	cleaned = strings.Trim(cleaned, "._-")
	return cleaned
}
