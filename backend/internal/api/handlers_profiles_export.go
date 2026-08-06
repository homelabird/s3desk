package api

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"gopkg.in/yaml.v3"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

type profileExportPreparationError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type profileExportPreparedRequest struct {
	profileID      string
	secrets        models.ProfileSecrets
	download       bool
	includeSecrets bool
	err            error
}

type profileExportHTTPService struct {
	server *server
}

type profileExport struct {
	Profile profileExportProfile `yaml:"profile"`
	TLS     *profileExportTLS    `yaml:"tls,omitempty"`
}

type profileExportProfile struct {
	ID       string                 `yaml:"id,omitempty"`
	Name     string                 `yaml:"name"`
	Provider models.ProfileProvider `yaml:"provider,omitempty"`

	Endpoint       string `yaml:"endpoint,omitempty"`
	PublicEndpoint string `yaml:"publicEndpoint,omitempty"`
	Region         string `yaml:"region,omitempty"`

	AccessKeyID     string  `yaml:"accessKeyId,omitempty"`
	SecretAccessKey string  `yaml:"secretAccessKey,omitempty"`
	SessionToken    *string `yaml:"sessionToken,omitempty"`
	ForcePathStyle  *bool   `yaml:"forcePathStyle,omitempty"`

	AccountName    string `yaml:"accountName,omitempty"`
	AccountKey     string `yaml:"accountKey,omitempty"`
	SubscriptionID string `yaml:"subscriptionId,omitempty"`
	ResourceGroup  string `yaml:"resourceGroup,omitempty"`
	TenantID       string `yaml:"tenantId,omitempty"`
	ClientID       string `yaml:"clientId,omitempty"`
	ClientSecret   string `yaml:"clientSecret,omitempty"`
	UseEmulator    *bool  `yaml:"useEmulator,omitempty"`

	ServiceAccountJSON string `yaml:"serviceAccountJson,omitempty"`
	Anonymous          *bool  `yaml:"anonymous,omitempty"`
	ProjectNumber      string `yaml:"projectNumber,omitempty"`

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

func (e *profileExportPreparationError) Error() string {
	return e.message
}

func newProfileExportHTTPService(s *server) profileExportHTTPService {
	return profileExportHTTPService{server: s}
}

func newProfileExportPreparationError(status int, code, message string, details map[string]any) *profileExportPreparationError {
	return &profileExportPreparationError{
		status:  status,
		code:    code,
		message: message,
		details: details,
	}
}

func (svc profileExportHTTPService) prepareExportProfile(r *http.Request) profileExportPreparedRequest {
	profileID := chi.URLParam(r, "profileId")
	if profileID == "" {
		return profileExportPreparedRequest{
			err: newProfileExportPreparationError(
				http.StatusBadRequest,
				"invalid_request",
				"profileId is required",
				nil,
			),
		}
	}
	download, err := wantsProfileExportDownload(r)
	if err != nil {
		return profileExportPreparedRequest{
			profileID: profileID,
			err: newProfileExportPreparationError(
				http.StatusBadRequest,
				"invalid_request",
				"download must be a boolean",
				map[string]any{"download": strings.TrimSpace(r.URL.Query().Get("download"))},
			),
		}
	}
	includeSecrets, err := wantsProfileExportIncludeSecrets(r)
	if err != nil {
		return profileExportPreparedRequest{
			profileID: profileID,
			err: newProfileExportPreparationError(
				http.StatusBadRequest,
				"invalid_request",
				"includeSecrets must be a boolean",
				map[string]any{"includeSecrets": strings.TrimSpace(r.URL.Query().Get("includeSecrets"))},
			),
		}
	}

	secrets, ok, err := svc.server.store.GetProfileSecrets(r.Context(), profileID)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrEncryptedCredentials):
			return profileExportPreparedRequest{
				profileID: profileID,
				err: newProfileExportPreparationError(
					http.StatusBadRequest,
					"encrypted_credentials",
					err.Error(),
					nil,
				),
			}
		case errors.Is(err, store.ErrEncryptionKeyRequired):
			return profileExportPreparedRequest{
				profileID: profileID,
				err: newProfileExportPreparationError(
					http.StatusBadRequest,
					"encryption_required",
					err.Error(),
					nil,
				),
			}
		default:
			return profileExportPreparedRequest{
				profileID: profileID,
				err: newProfileExportPreparationError(
					http.StatusInternalServerError,
					"internal_error",
					"failed to load profile",
					nil,
				),
			}
		}
	}
	if !ok {
		return profileExportPreparedRequest{
			profileID: profileID,
			err: newProfileExportPreparationError(
				http.StatusNotFound,
				"not_found",
				"profile not found",
				map[string]any{"profileId": profileID},
			),
		}
	}

	return profileExportPreparedRequest{
		profileID:      profileID,
		secrets:        secrets,
		download:       download,
		includeSecrets: includeSecrets,
	}
}

func buildProfileExportFromSecrets(secrets models.ProfileSecrets, includeSecrets bool) profileExport {
	exportProfile := profileExportProfile{
		ID:                    secrets.ID,
		Name:                  secrets.Name,
		Provider:              secrets.Provider,
		PreserveLeadingSlash:  secrets.PreserveLeadingSlash,
		TLSInsecureSkipVerify: secrets.TLSInsecureSkipVerify,
	}

	switch secrets.Provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible:
		force := secrets.ForcePathStyle
		exportProfile.Endpoint = secrets.Endpoint
		exportProfile.PublicEndpoint = secrets.PublicEndpoint
		exportProfile.Region = secrets.Region
		exportProfile.AccessKeyID = secrets.AccessKeyID
		if includeSecrets {
			exportProfile.SecretAccessKey = secrets.SecretAccessKey
			exportProfile.SessionToken = secrets.SessionToken
		}
		exportProfile.ForcePathStyle = &force
	case models.ProfileProviderAzureBlob:
		exportProfile.AccountName = secrets.AzureAccountName
		exportProfile.SubscriptionID = secrets.AzureSubscriptionID
		exportProfile.ResourceGroup = secrets.AzureResourceGroup
		exportProfile.TenantID = secrets.AzureTenantID
		exportProfile.ClientID = secrets.AzureClientID
		if includeSecrets {
			exportProfile.AccountKey = secrets.AzureAccountKey
			exportProfile.ClientSecret = secrets.AzureClientSecret
		}
		exportProfile.Endpoint = secrets.AzureEndpoint
		if secrets.AzureUseEmulator {
			useEmulator := true
			exportProfile.UseEmulator = &useEmulator
		}
	case models.ProfileProviderGcpGcs:
		if includeSecrets {
			exportProfile.ServiceAccountJSON = secrets.GcpServiceAccountJSON
		}
		exportProfile.Endpoint = secrets.GcpEndpoint
		if secrets.GcpAnonymous {
			anonymous := true
			exportProfile.Anonymous = &anonymous
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
	if includeSecrets && secrets.TLSConfig != nil {
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
	return export
}

func marshalProfileExport(export profileExport) ([]byte, error) {
	return yaml.Marshal(export)
}

func (svc profileExportHTTPService) executePrepared(prepared profileExportPreparedRequest) ([]byte, string, error) {
	if prepared.err != nil {
		return nil, "", prepared.err
	}

	data, err := marshalProfileExport(buildProfileExportFromSecrets(prepared.secrets, prepared.includeSecrets))
	if err != nil {
		return nil, "", newProfileExportPreparationError(
			http.StatusInternalServerError,
			"internal_error",
			"failed to serialize profile export",
			nil,
		)
	}

	filename := ""
	if prepared.download {
		filename = buildProfileExportFilename(prepared.secrets.Name, prepared.secrets.ID)
	}
	return data, filename, nil
}

func (svc profileExportHTTPService) executeExport(r *http.Request) ([]byte, string, error) {
	return svc.executePrepared(svc.prepareExportProfile(r))
}

func (svc profileExportHTTPService) handleExportProfile(w http.ResponseWriter, r *http.Request) {
	body, downloadFilename, err := svc.executeExport(r)
	if err != nil {
		var prepErr *profileExportPreparationError
		if errors.As(err, &prepErr) {
			resp := buildAPIErrorResponse(prepErr.code, prepErr.message, prepErr.details)
			writeJSON(w, prepErr.status, &resp)
			return
		}
		resp := buildAPIErrorResponse("internal_error", "failed to export profile", nil)
		writeJSON(w, http.StatusInternalServerError, &resp)
		return
	}
	contentDisposition := buildProfileExportContentDisposition(downloadFilename)
	if contentDisposition != "" {
		w.Header().Set("Content-Disposition", contentDisposition)
	}
	if w.Header().Get("Content-Type") == "" {
		w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func wantsProfileExportDownload(r *http.Request) (bool, error) {
	return parseProfileExportBoolQuery(r, "download")
}

func wantsProfileExportIncludeSecrets(r *http.Request) (bool, error) {
	return parseProfileExportBoolQuery(r, "includeSecrets")
}

func parseProfileExportBoolQuery(r *http.Request, name string) (bool, error) {
	value := strings.TrimSpace(strings.ToLower(r.URL.Query().Get(name)))
	switch value {
	case "":
		return false, nil
	case "1", "true", "t", "yes", "y", "on":
		return true, nil
	case "0", "false", "f", "no", "n", "off":
		return false, nil
	default:
		return false, fmt.Errorf("%s must be a boolean", name)
	}
}

func buildProfileExportContentDisposition(filename string) string {
	if filename == "" {
		return ""
	}
	return fmt.Sprintf("attachment; filename=\"%s\"", filename)
}

func buildProfileExportFilename(name, id string) string {
	base := sanitizeProfileExportFilename(name)
	if base == "" {
		base = sanitizeProfileExportFilename(id)
	}
	if base == "" {
		base = "profile"
	}
	return fmt.Sprintf("%s.yaml", base)
}

func sanitizeProfileExportFilename(value string) string {
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
