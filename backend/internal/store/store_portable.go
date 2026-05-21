package store

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
	"gorm.io/gorm"

	"s3desk/internal/gcsauth"
	"s3desk/internal/models"
	"s3desk/internal/profileendpoint"
)

type PortableEntityFile struct {
	Name   string
	Data   []byte
	Count  int
	SHA256 string
}

type PortableExportBundle struct {
	EntityFiles map[string]PortableEntityFile
}

type PortableImportCounts struct {
	Profiles                 int
	ProfileConnectionOptions int
	Jobs                     int
	UploadSessions           int
	UploadMultipartUploads   int
	UploadObjects            int
	ObjectIndex              int
	ObjectIndexReplacements  int
	ObjectFavorites          int
}

type PortableValidationOptions struct {
	AllowRemote bool
}

func (s *Store) ExportPortableEntityFiles(ctx context.Context) (PortableExportBundle, error) {
	tx := s.db.WithContext(ctx)
	files := map[string]PortableEntityFile{}

	profiles, err := orderedRows[profileRow](tx, "id")
	if err != nil {
		return PortableExportBundle{}, err
	}
	files["profiles"] = marshalPortableEntityFile("profiles", profiles)

	profileConnectionOptions, err := orderedRows[profileConnectionOptionsRow](tx, "profile_id")
	if err != nil {
		return PortableExportBundle{}, err
	}
	files["profile_connection_options"] = marshalPortableEntityFile("profile_connection_options", profileConnectionOptions)

	jobsRows, err := orderedRows[jobRow](tx, "created_at, id")
	if err != nil {
		return PortableExportBundle{}, err
	}
	files["jobs"] = marshalPortableEntityFile("jobs", jobsRows)

	uploadSessions, err := orderedRows[uploadSessionRow](tx, "created_at, id")
	if err != nil {
		return PortableExportBundle{}, err
	}
	files["upload_sessions"] = marshalPortableEntityFile("upload_sessions", uploadSessions)

	uploadMultipartUploads, err := orderedRows[uploadMultipartRow](tx, "upload_id, path")
	if err != nil {
		return PortableExportBundle{}, err
	}
	files["upload_multipart_uploads"] = marshalPortableEntityFile("upload_multipart_uploads", uploadMultipartUploads)

	uploadObjects, err := orderedRows[uploadObjectRow](tx, "upload_id, path")
	if err != nil {
		return PortableExportBundle{}, err
	}
	files["upload_objects"] = marshalPortableEntityFile("upload_objects", uploadObjects)

	objectIndex, err := orderedRows[objectIndexRow](tx, "profile_id, bucket, object_key")
	if err != nil {
		return PortableExportBundle{}, err
	}
	files["object_index"] = marshalPortableEntityFile("object_index", objectIndex)

	objectIndexReplacements, err := orderedRows[objectIndexReplacementRow](tx, "replacement_id, profile_id, bucket, object_key")
	if err != nil {
		return PortableExportBundle{}, err
	}
	files["object_index_replacements"] = marshalPortableEntityFile("object_index_replacements", objectIndexReplacements)

	objectFavorites, err := orderedRows[objectFavoriteRow](tx, "profile_id, bucket, object_key")
	if err != nil {
		return PortableExportBundle{}, err
	}
	files["object_favorites"] = marshalPortableEntityFile("object_favorites", objectFavorites)

	return PortableExportBundle{EntityFiles: files}, nil
}

func (s *Store) ImportPortableEntityFilesReplace(ctx context.Context, entityFiles map[string][]byte, dataDir string) (PortableImportCounts, error) {
	return s.ImportPortableEntityFilesReplaceWithOptions(ctx, entityFiles, dataDir, PortableValidationOptions{})
}

func (s *Store) ImportPortableEntityFilesReplaceWithOptions(ctx context.Context, entityFiles map[string][]byte, dataDir string, opts PortableValidationOptions) (PortableImportCounts, error) {
	var counts PortableImportCounts

	rows, err := parseAndValidatePortableEntityFiles(dataDir, entityFiles, opts)
	if err != nil {
		return PortableImportCounts{}, err
	}
	profiles := rows.profiles
	profileConnectionOptions := rows.profileConnectionOptions
	jobsRows := rows.jobsRows
	uploadSessions := rows.uploadSessions
	uploadMultipartUploads := rows.uploadMultipartUploads
	uploadObjects := rows.uploadObjects
	objectIndex := rows.objectIndex
	objectIndexReplacements := rows.objectIndexReplacements
	objectFavorites := rows.objectFavorites

	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		deleteTables := []any{
			&objectFavoriteRow{},
			&objectIndexReplacementRow{},
			&objectIndexRow{},
			&uploadObjectRow{},
			&uploadMultipartRow{},
			&uploadSessionRow{},
			&jobRow{},
			&profileConnectionOptionsRow{},
			&profileRow{},
		}
		for _, table := range deleteTables {
			if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(table).Error; err != nil {
				return err
			}
		}

		if len(profiles) > 0 {
			if err := tx.CreateInBatches(profiles, 100).Error; err != nil {
				return err
			}
			counts.Profiles = len(profiles)
		}
		if len(profileConnectionOptions) > 0 {
			if err := tx.CreateInBatches(profileConnectionOptions, 100).Error; err != nil {
				return err
			}
			counts.ProfileConnectionOptions = len(profileConnectionOptions)
		}
		if len(jobsRows) > 0 {
			if err := tx.CreateInBatches(jobsRows, 100).Error; err != nil {
				return err
			}
			counts.Jobs = len(jobsRows)
		}
		if len(uploadSessions) > 0 {
			if err := tx.CreateInBatches(uploadSessions, 100).Error; err != nil {
				return err
			}
			counts.UploadSessions = len(uploadSessions)
		}
		if len(uploadMultipartUploads) > 0 {
			if err := tx.CreateInBatches(uploadMultipartUploads, 100).Error; err != nil {
				return err
			}
			counts.UploadMultipartUploads = len(uploadMultipartUploads)
		}
		if len(uploadObjects) > 0 {
			if err := tx.CreateInBatches(uploadObjects, 100).Error; err != nil {
				return err
			}
			counts.UploadObjects = len(uploadObjects)
		}
		if len(objectIndex) > 0 {
			if err := tx.CreateInBatches(objectIndex, 250).Error; err != nil {
				return err
			}
			counts.ObjectIndex = len(objectIndex)
		}
		if len(objectIndexReplacements) > 0 {
			if err := tx.CreateInBatches(objectIndexReplacements, 250).Error; err != nil {
				return err
			}
			counts.ObjectIndexReplacements = len(objectIndexReplacements)
		}
		if len(objectFavorites) > 0 {
			if err := tx.CreateInBatches(objectFavorites, 250).Error; err != nil {
				return err
			}
			counts.ObjectFavorites = len(objectFavorites)
		}
		return nil
	})
	if err != nil {
		return PortableImportCounts{}, err
	}

	return counts, nil
}

type portableImportEntityRows struct {
	profiles                 []profileRow
	profileConnectionOptions []profileConnectionOptionsRow
	jobsRows                 []jobRow
	uploadSessions           []uploadSessionRow
	uploadMultipartUploads   []uploadMultipartRow
	uploadObjects            []uploadObjectRow
	objectIndex              []objectIndexRow
	objectIndexReplacements  []objectIndexReplacementRow
	objectFavorites          []objectFavoriteRow
}

func ValidatePortableEntityFiles(dataDir string, entityFiles map[string][]byte) error {
	return ValidatePortableEntityFilesWithOptions(dataDir, entityFiles, PortableValidationOptions{})
}

func ValidatePortableEntityFilesWithOptions(dataDir string, entityFiles map[string][]byte, opts PortableValidationOptions) error {
	_, err := parseAndValidatePortableEntityFiles(dataDir, entityFiles, opts)
	return err
}

func parseAndValidatePortableEntityFiles(dataDir string, entityFiles map[string][]byte, opts PortableValidationOptions) (portableImportEntityRows, error) {
	var rows portableImportEntityRows

	profiles, err := parsePortableRows[profileRow](entityFiles["profiles"])
	if err != nil {
		return rows, fmt.Errorf("parse profiles: %w", err)
	}
	if err := validatePortableProfileRows(profiles, opts); err != nil {
		return rows, err
	}
	profiles = normalizePortableProfileRows(profiles)
	profileIDs := portableProfileIDSet(profiles)
	profileConnectionOptions, err := parsePortableRows[profileConnectionOptionsRow](entityFiles["profile_connection_options"])
	if err != nil {
		return rows, fmt.Errorf("parse profile_connection_options: %w", err)
	}
	if err := validatePortableProfileReferences(profileIDs, "profile_connection_options", profileConnectionOptions, func(row profileConnectionOptionsRow) string {
		return row.ProfileID
	}); err != nil {
		return rows, err
	}
	jobsRows, err := parsePortableRows[jobRow](entityFiles["jobs"])
	if err != nil {
		return rows, fmt.Errorf("parse jobs: %w", err)
	}
	if err := validatePortableJobRows(jobsRows); err != nil {
		return rows, err
	}
	if err := validatePortableProfileReferences(profileIDs, "jobs", jobsRows, func(row jobRow) string {
		return row.ProfileID
	}); err != nil {
		return rows, err
	}
	jobsRows = quarantinePortableExecutableJobs(jobsRows)
	uploadSessions, err := parsePortableRows[uploadSessionRow](entityFiles["upload_sessions"])
	if err != nil {
		return rows, fmt.Errorf("parse upload_sessions: %w", err)
	}
	if err := validatePortableProfileReferences(profileIDs, "upload_sessions", uploadSessions, func(row uploadSessionRow) string {
		return row.ProfileID
	}); err != nil {
		return rows, err
	}
	uploadSessions, err = normalizePortableUploadSessions(dataDir, uploadSessions)
	if err != nil {
		return rows, fmt.Errorf("normalize upload_sessions: %w", err)
	}
	uploadSessionRefs, err := portableUploadSessionRefSet(uploadSessions)
	if err != nil {
		return rows, err
	}
	uploadMultipartUploads, err := parsePortableRows[uploadMultipartRow](entityFiles["upload_multipart_uploads"])
	if err != nil {
		return rows, fmt.Errorf("parse upload_multipart_uploads: %w", err)
	}
	if err := validatePortableProfileReferences(profileIDs, "upload_multipart_uploads", uploadMultipartUploads, func(row uploadMultipartRow) string {
		return row.ProfileID
	}); err != nil {
		return rows, err
	}
	if err := validatePortableUploadRowSessions(uploadSessionRefs, "upload_multipart_uploads", uploadMultipartUploads, func(row uploadMultipartRow) portableUploadRowRef {
		return portableUploadRowRef{
			ProfileID: row.ProfileID,
			UploadID:  row.UploadID,
			Bucket:    row.Bucket,
			ObjectKey: row.ObjectKey,
		}
	}); err != nil {
		return rows, err
	}
	uploadObjects, err := parsePortableRows[uploadObjectRow](entityFiles["upload_objects"])
	if err != nil {
		return rows, fmt.Errorf("parse upload_objects: %w", err)
	}
	if err := validatePortableProfileReferences(profileIDs, "upload_objects", uploadObjects, func(row uploadObjectRow) string {
		return row.ProfileID
	}); err != nil {
		return rows, err
	}
	if err := validatePortableUploadRowSessions(uploadSessionRefs, "upload_objects", uploadObjects, func(row uploadObjectRow) portableUploadRowRef {
		return portableUploadRowRef{
			ProfileID: row.ProfileID,
			UploadID:  row.UploadID,
			Bucket:    row.Bucket,
			ObjectKey: row.ObjectKey,
		}
	}); err != nil {
		return rows, err
	}
	objectIndex, err := parsePortableRows[objectIndexRow](entityFiles["object_index"])
	if err != nil {
		return rows, fmt.Errorf("parse object_index: %w", err)
	}
	if err := validatePortableProfileReferences(profileIDs, "object_index", objectIndex, func(row objectIndexRow) string {
		return row.ProfileID
	}); err != nil {
		return rows, err
	}
	objectIndexReplacements, err := parsePortableRows[objectIndexReplacementRow](entityFiles["object_index_replacements"])
	if err != nil {
		return rows, fmt.Errorf("parse object_index_replacements: %w", err)
	}
	if err := validatePortableProfileReferences(profileIDs, "object_index_replacements", objectIndexReplacements, func(row objectIndexReplacementRow) string {
		return row.ProfileID
	}); err != nil {
		return rows, err
	}
	objectFavorites, err := parsePortableRows[objectFavoriteRow](entityFiles["object_favorites"])
	if err != nil {
		return rows, fmt.Errorf("parse object_favorites: %w", err)
	}
	if err := validatePortableProfileReferences(profileIDs, "object_favorites", objectFavorites, func(row objectFavoriteRow) string {
		return row.ProfileID
	}); err != nil {
		return rows, err
	}

	rows.profiles = profiles
	rows.profileConnectionOptions = profileConnectionOptions
	rows.jobsRows = jobsRows
	rows.uploadSessions = uploadSessions
	rows.uploadMultipartUploads = uploadMultipartUploads
	rows.uploadObjects = uploadObjects
	rows.objectIndex = objectIndex
	rows.objectIndexReplacements = objectIndexReplacements
	rows.objectFavorites = objectFavorites
	return rows, nil
}

func validatePortableProfileRows(rows []profileRow, opts PortableValidationOptions) error {
	for i, row := range rows {
		if _, err := ulid.ParseStrict(row.ID); err != nil {
			return fmt.Errorf("invalid portable profile id at row %d: %q", i+1, row.ID)
		}
		if err := validatePortableProfileRow(row, opts); err != nil {
			return fmt.Errorf("invalid portable profile at row %d: %w", i+1, err)
		}
	}
	return nil
}

func validatePortableProfileRow(row profileRow, opts PortableValidationOptions) error {
	provider, err := validatePortableProfileProvider(row.Provider)
	if err != nil {
		return err
	}
	switch provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible:
		if err := validatePortableJSONField(row.ConfigJSON, &map[string]any{}); err != nil {
			return fmt.Errorf("config_json: %w", err)
		}
		if err := validatePortableJSONField(row.SecretsJSON, &map[string]any{}); err != nil {
			return fmt.Errorf("secrets_json: %w", err)
		}
		if strings.TrimSpace(row.Region) == "" {
			return errors.New("region is required")
		}
		if provider == models.ProfileProviderS3Compatible && strings.TrimSpace(row.Endpoint) == "" {
			return errors.New("endpoint is required for s3_compatible")
		}
		if err := validatePortableEndpointURL("endpoint", row.Endpoint, opts); err != nil {
			return err
		}
		if err := validatePortableEndpointURL("publicEndpoint", row.PublicEndpoint, opts); err != nil {
			return err
		}
		if row.TLSInsecureSkipVerify != 0 {
			if err := validatePortableTLSSkipVerifyEndpoint("endpoint", row.Endpoint, opts); err != nil {
				return err
			}
		}
		if strings.TrimSpace(row.AccessKeyID) == "" || strings.TrimSpace(row.SecretAccessKey) == "" {
			return errors.New("s3 credentials are required")
		}
	case models.ProfileProviderAzureBlob:
		var cfg azureProfileConfig
		if err := validatePortableJSONField(row.ConfigJSON, &cfg); err != nil {
			return fmt.Errorf("config_json: %w", err)
		}
		var sec azureProfileSecrets
		if err := validatePortableJSONField(row.SecretsJSON, &sec); err != nil {
			return fmt.Errorf("secrets_json: %w", err)
		}
		if strings.TrimSpace(cfg.AccountName) == "" || strings.TrimSpace(sec.AccountKey) == "" {
			return errors.New("azure accountName and accountKey are required")
		}
		if err := validatePortableEndpointURL("endpoint", cfg.Endpoint, opts); err != nil {
			return err
		}
		if row.TLSInsecureSkipVerify != 0 {
			if err := validatePortableTLSSkipVerifyEndpoint("endpoint", cfg.Endpoint, opts); err != nil {
				return err
			}
		}
		armFieldsProvided := strings.TrimSpace(cfg.SubscriptionID) != "" ||
			strings.TrimSpace(cfg.ResourceGroup) != "" ||
			strings.TrimSpace(cfg.TenantID) != "" ||
			strings.TrimSpace(cfg.ClientID) != "" ||
			strings.TrimSpace(sec.ClientSecret) != ""
		if armFieldsProvided && (strings.TrimSpace(cfg.SubscriptionID) == "" ||
			strings.TrimSpace(cfg.ResourceGroup) == "" ||
			strings.TrimSpace(cfg.TenantID) == "" ||
			strings.TrimSpace(cfg.ClientID) == "" ||
			strings.TrimSpace(sec.ClientSecret) == "") {
			return errors.New("azure ARM configuration requires subscriptionId, resourceGroup, tenantId, clientId, and clientSecret together")
		}
	case models.ProfileProviderGcpGcs:
		var cfg gcpProfileConfig
		if err := validatePortableJSONField(row.ConfigJSON, &cfg); err != nil {
			return fmt.Errorf("config_json: %w", err)
		}
		var sec gcpProfileSecrets
		if err := validatePortableJSONField(row.SecretsJSON, &sec); err != nil {
			return fmt.Errorf("secrets_json: %w", err)
		}
		if strings.TrimSpace(cfg.ProjectNumber) == "" {
			return errors.New("projectNumber is required")
		}
		if err := validatePortableEndpointURL("endpoint", cfg.Endpoint, opts); err != nil {
			return err
		}
		if row.TLSInsecureSkipVerify != 0 {
			if err := validatePortableTLSSkipVerifyEndpoint("endpoint", cfg.Endpoint, opts); err != nil {
				return err
			}
		}
		if !cfg.Anonymous && strings.TrimSpace(sec.ServiceAccountJSON) == "" {
			return errors.New("serviceAccountJson is required unless anonymous=true")
		}
		if strings.TrimSpace(sec.ServiceAccountJSON) != "" {
			if err := gcsauth.ValidateServiceAccountJSON(sec.ServiceAccountJSON); err != nil {
				return err
			}
		}
	case models.ProfileProviderOciObjectStorage:
		var cfg ociObjectStorageProfileConfig
		if err := validatePortableJSONField(row.ConfigJSON, &cfg); err != nil {
			return fmt.Errorf("config_json: %w", err)
		}
		if err := validatePortableJSONField(row.SecretsJSON, &map[string]any{}); err != nil {
			return fmt.Errorf("secrets_json: %w", err)
		}
		if strings.TrimSpace(cfg.Region) == "" ||
			strings.TrimSpace(cfg.Namespace) == "" ||
			strings.TrimSpace(cfg.Compartment) == "" {
			return errors.New("region, namespace, and compartment are required")
		}
		if err := validatePortableEndpointURL("endpoint", cfg.Endpoint, opts); err != nil {
			return err
		}
		if row.TLSInsecureSkipVerify != 0 {
			if err := validatePortableTLSSkipVerifyEndpoint("endpoint", cfg.Endpoint, opts); err != nil {
				return err
			}
		}
	}
	return nil
}

func validatePortableEndpointURL(field, raw string, opts PortableValidationOptions) error {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil
	}
	return profileendpoint.ValidateURL(field, &value, opts.AllowRemote)
}

func validatePortableTLSSkipVerifyEndpoint(field, raw string, opts PortableValidationOptions) error {
	value := strings.TrimSpace(raw)
	if err := profileendpoint.ValidateTLSSkipVerifyEndpoint(field, &value, opts.AllowRemote); err != nil {
		return err
	}
	return nil
}

func validatePortableProfileProvider(raw string) (models.ProfileProvider, error) {
	value := strings.TrimSpace(raw)
	if value == "oci_s3_compat" {
		return models.ProfileProviderS3Compatible, nil
	}
	switch models.ProfileProvider(value) {
	case models.ProfileProviderAwsS3,
		models.ProfileProviderS3Compatible,
		models.ProfileProviderAzureBlob,
		models.ProfileProviderGcpGcs,
		models.ProfileProviderOciObjectStorage:
		return models.ProfileProvider(value), nil
	default:
		return "", fmt.Errorf("unsupported provider %q", raw)
	}
}

func normalizePortableProfileRows(rows []profileRow) []profileRow {
	normalized := append([]profileRow(nil), rows...)
	for i := range normalized {
		provider, err := validatePortableProfileProvider(normalized[i].Provider)
		if err == nil {
			normalized[i].Provider = string(provider)
		}
	}
	return normalized
}

func validatePortableJSONField(raw string, dest any) error {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		trimmed = "{}"
	}
	return json.Unmarshal([]byte(trimmed), dest)
}

func portableProfileIDSet(rows []profileRow) map[string]struct{} {
	ids := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		ids[row.ID] = struct{}{}
	}
	return ids
}

func validatePortableProfileReferences[T any](profileIDs map[string]struct{}, entity string, rows []T, profileID func(T) string) error {
	for i, row := range rows {
		id := profileID(row)
		if _, err := ulid.ParseStrict(id); err != nil {
			return fmt.Errorf("invalid portable %s profile id at row %d: %q", entity, i+1, id)
		}
		if _, ok := profileIDs[id]; !ok {
			return fmt.Errorf("portable %s profile id at row %d references missing profile: %q", entity, i+1, id)
		}
	}
	return nil
}

type portableUploadSessionRef struct {
	ProfileID string
	UploadID  string
}

type portableUploadRowRef struct {
	ProfileID string
	UploadID  string
	Bucket    string
	ObjectKey string
}

func portableUploadSessionRefSet(rows []uploadSessionRow) (map[portableUploadSessionRef]uploadSessionRow, error) {
	refs := make(map[portableUploadSessionRef]uploadSessionRow, len(rows))
	for i, row := range rows {
		if _, err := ulid.ParseStrict(row.ID); err != nil {
			return nil, fmt.Errorf("invalid portable upload_sessions id at row %d: %q", i+1, row.ID)
		}
		refs[portableUploadSessionRef{ProfileID: row.ProfileID, UploadID: row.ID}] = row
	}
	return refs, nil
}

func validatePortableUploadRowSessions[T any](
	sessionRefs map[portableUploadSessionRef]uploadSessionRow,
	entity string,
	rows []T,
	refFor func(T) portableUploadRowRef,
) error {
	for i, row := range rows {
		ref := refFor(row)
		if _, err := ulid.ParseStrict(ref.UploadID); err != nil {
			return fmt.Errorf("invalid portable %s upload id at row %d: %q", entity, i+1, ref.UploadID)
		}
		session, ok := sessionRefs[portableUploadSessionRef{ProfileID: ref.ProfileID, UploadID: ref.UploadID}]
		if !ok {
			return fmt.Errorf("portable %s row %d references missing upload session: profile_id=%q upload_id=%q", entity, i+1, ref.ProfileID, ref.UploadID)
		}
		if ref.Bucket != session.Bucket {
			return fmt.Errorf("portable %s row %d bucket %q does not match upload session bucket %q", entity, i+1, ref.Bucket, session.Bucket)
		}
		if session.Prefix != "" && !strings.HasPrefix(ref.ObjectKey, session.Prefix) {
			return fmt.Errorf("portable %s row %d object key %q is outside upload session prefix %q", entity, i+1, ref.ObjectKey, session.Prefix)
		}
	}
	return nil
}

func validatePortableJobRows(rows []jobRow) error {
	for i, row := range rows {
		if _, err := ulid.ParseStrict(row.ID); err != nil {
			return fmt.Errorf("invalid portable job id at row %d: %q", i+1, row.ID)
		}
	}
	return nil
}

func quarantinePortableExecutableJobs(rows []jobRow) []jobRow {
	normalized := append([]jobRow(nil), rows...)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	message := "portable import quarantined executable job state"
	errorCode := "portable_import_quarantined"

	for i := range normalized {
		switch models.JobStatus(strings.TrimSpace(normalized[i].Status)) {
		case models.JobStatusQueued, models.JobStatusRunning:
			normalized[i].Status = string(models.JobStatusFailed)
			normalized[i].StartedAt = nil
			normalized[i].FinishedAt = &now
			normalized[i].Error = &message
			normalized[i].ErrorCode = &errorCode
		}
	}
	return normalized
}

func normalizePortableUploadSessions(dataDir string, rows []uploadSessionRow) ([]uploadSessionRow, error) {
	normalized := append([]uploadSessionRow(nil), rows...)
	for i := range normalized {
		mode := strings.TrimSpace(strings.ToLower(normalized[i].Mode))
		switch mode {
		case "direct", "presigned":
			normalized[i].StagingDir = ""
		default:
			stagingDir, err := ResolveUploadStagingDir(dataDir, normalized[i].ID)
			if err != nil {
				return nil, fmt.Errorf("session %q: %w", normalized[i].ID, err)
			}
			normalized[i].StagingDir = stagingDir
		}
	}
	return normalized, nil
}

func orderedRows[T any](tx *gorm.DB, order string) ([]T, error) {
	var rows []T
	if err := tx.Order(order).Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func marshalPortableEntityFile[T any](name string, rows []T) PortableEntityFile {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	for _, row := range rows {
		_ = enc.Encode(row)
	}
	sum := sha256.Sum256(buf.Bytes())
	return PortableEntityFile{
		Name:   name,
		Data:   buf.Bytes(),
		Count:  len(rows),
		SHA256: hex.EncodeToString(sum[:]),
	}
}

func parsePortableRows[T any](data []byte) ([]T, error) {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 {
		return []T{}, nil
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	rows := make([]T, 0, 16)
	for {
		var row T
		if err := decoder.Decode(&row); err != nil {
			if err == io.EOF {
				break
			}
			return nil, err
		}
		rows = append(rows, row)
	}
	return rows, nil
}
