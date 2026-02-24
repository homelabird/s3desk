package models

import "encoding/json"

type ErrorResponse struct {
	Error APIError `json:"error"`
}

// NormalizedErrorCode is a provider-agnostic error code intended for stable UX/logic.
//
// It is primarily derived from rclone stderr (see internal/rcloneerrors).
type NormalizedErrorCode string

const (
	NormalizedErrorInvalidCredentials NormalizedErrorCode = "invalid_credentials" // #nosec G101 -- error code, not credentials
	NormalizedErrorAccessDenied       NormalizedErrorCode = "access_denied"
	NormalizedErrorNotFound           NormalizedErrorCode = "not_found"
	NormalizedErrorRateLimited        NormalizedErrorCode = "rate_limited"
	NormalizedErrorNetworkError       NormalizedErrorCode = "network_error"
	NormalizedErrorInvalidConfig      NormalizedErrorCode = "invalid_config"

	// Extended (still provider-agnostic) codes.
	NormalizedErrorSignatureMismatch   NormalizedErrorCode = "signature_mismatch"
	NormalizedErrorRequestTimeSkewed   NormalizedErrorCode = "request_time_skewed"
	NormalizedErrorConflict            NormalizedErrorCode = "conflict"
	NormalizedErrorUpstreamTimeout     NormalizedErrorCode = "upstream_timeout"
	NormalizedErrorEndpointUnreachable NormalizedErrorCode = "endpoint_unreachable"
	NormalizedErrorCanceled            NormalizedErrorCode = "canceled"
	NormalizedErrorUnknown             NormalizedErrorCode = "unknown"
)

type NormalizedError struct {
	Code      NormalizedErrorCode `json:"code"`
	Retryable bool                `json:"retryable"`
}

type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	// NormalizedError is an optional, stable classification meant for UI and retry logic.
	NormalizedError *NormalizedError `json:"normalizedError,omitempty"`
	Details         map[string]any   `json:"details,omitempty"`
}

type ProfileProvider string

const (
	ProfileProviderAwsS3            ProfileProvider = "aws_s3"
	ProfileProviderS3Compatible     ProfileProvider = "s3_compatible"
	ProfileProviderOciS3Compat      ProfileProvider = "oci_s3_compat"
	ProfileProviderAzureBlob        ProfileProvider = "azure_blob"
	ProfileProviderGcpGcs           ProfileProvider = "gcp_gcs"
	ProfileProviderOciObjectStorage ProfileProvider = "oci_object_storage"
)

type Profile struct {
	ID       string          `json:"id"`
	Name     string          `json:"name"`
	Provider ProfileProvider `json:"provider"`

	// S3-style providers
	Endpoint       string `json:"endpoint,omitempty"`
	Region         string `json:"region,omitempty"`
	ForcePathStyle *bool  `json:"forcePathStyle,omitempty"`

	// Azure Blob
	AccountName string `json:"accountName,omitempty"`
	UseEmulator *bool  `json:"useEmulator,omitempty"`

	// GCP GCS
	ProjectID     string `json:"projectId,omitempty"`
	ClientEmail   string `json:"clientEmail,omitempty"`
	Anonymous     *bool  `json:"anonymous,omitempty"`
	ProjectNumber string `json:"projectNumber,omitempty"`

	// OCI Object Storage
	Namespace     string `json:"namespace,omitempty"`
	Compartment   string `json:"compartment,omitempty"`
	AuthProvider  string `json:"authProvider,omitempty"`
	ConfigFile    string `json:"configFile,omitempty"`
	ConfigProfile string `json:"configProfile,omitempty"`

	PreserveLeadingSlash  bool   `json:"preserveLeadingSlash"`
	TLSInsecureSkipVerify bool   `json:"tlsInsecureSkipVerify"`
	CreatedAt             string `json:"createdAt"`
	UpdatedAt             string `json:"updatedAt"`
}

type ProfileSecrets struct {
	ID       string          `json:"-"`
	Name     string          `json:"-"`
	Provider ProfileProvider `json:"-"`

	// S3-style secrets
	Endpoint        string  `json:"-"`
	Region          string  `json:"-"`
	ForcePathStyle  bool    `json:"-"`
	AccessKeyID     string  `json:"-"`
	SecretAccessKey string  `json:"-"`
	SessionToken    *string `json:"-"`

	// Azure Blob secrets
	AzureAccountName string `json:"-"`
	AzureAccountKey  string `json:"-"`
	AzureEndpoint    string `json:"-"`
	AzureUseEmulator bool   `json:"-"`

	// GCP GCS secrets
	GcpServiceAccountJSON string `json:"-"`
	GcpEndpoint           string `json:"-"`
	GcpAnonymous          bool   `json:"-"`
	GcpProjectNumber      string `json:"-"`

	// OCI Object Storage
	OciNamespace     string `json:"-"`
	OciCompartment   string `json:"-"`
	OciAuthProvider  string `json:"-"`
	OciConfigFile    string `json:"-"`
	OciConfigProfile string `json:"-"`
	OciEndpoint      string `json:"-"`

	// Common
	PreserveLeadingSlash  bool              `json:"-"`
	TLSInsecureSkipVerify bool              `json:"-"`
	TLSConfig             *ProfileTLSConfig `json:"-"`
	TLSConfigUpdatedAt    string            `json:"-"`
}

type ProfileCreateRequest struct {
	// Provider is required by the OpenAPI schema, but we accept empty (defaults to s3_compatible)
	// to preserve compatibility with older clients.
	Provider ProfileProvider `json:"provider,omitempty"`
	Name     string          `json:"name"`

	// S3-style
	Endpoint        *string `json:"endpoint,omitempty"`
	Region          *string `json:"region,omitempty"`
	AccessKeyID     *string `json:"accessKeyId,omitempty"`
	SecretAccessKey *string `json:"secretAccessKey,omitempty"`
	SessionToken    *string `json:"sessionToken,omitempty"`
	ForcePathStyle  *bool   `json:"forcePathStyle,omitempty"`

	// Azure Blob
	AccountName *string `json:"accountName,omitempty"`
	AccountKey  *string `json:"accountKey,omitempty"`
	UseEmulator *bool   `json:"useEmulator,omitempty"`

	// GCP GCS
	ServiceAccountJSON *string `json:"serviceAccountJson,omitempty"`
	Anonymous          *bool   `json:"anonymous,omitempty"`
	ProjectNumber      *string `json:"projectNumber,omitempty"`

	// OCI Object Storage
	Namespace     *string `json:"namespace,omitempty"`
	Compartment   *string `json:"compartment,omitempty"`
	AuthProvider  *string `json:"authProvider,omitempty"`
	ConfigFile    *string `json:"configFile,omitempty"`
	ConfigProfile *string `json:"configProfile,omitempty"`

	// Common
	PreserveLeadingSlash  bool `json:"preserveLeadingSlash"`
	TLSInsecureSkipVerify bool `json:"tlsInsecureSkipVerify"`
}

type ProfileUpdateRequest struct {
	// Provider is required by the OpenAPI schema. We use it as a discriminator to validate
	// and to prevent accidental provider changes.
	Provider ProfileProvider `json:"provider,omitempty"`

	Name     *string `json:"name,omitempty"`
	Endpoint *string `json:"endpoint,omitempty"`
	Region   *string `json:"region,omitempty"`

	AccessKeyID     *string `json:"accessKeyId,omitempty"`
	SecretAccessKey *string `json:"secretAccessKey,omitempty"`
	SessionToken    *string `json:"sessionToken,omitempty"`

	ForcePathStyle        *bool `json:"forcePathStyle,omitempty"`
	PreserveLeadingSlash  *bool `json:"preserveLeadingSlash,omitempty"`
	TLSInsecureSkipVerify *bool `json:"tlsInsecureSkipVerify,omitempty"`

	// Azure Blob
	AccountName *string `json:"accountName,omitempty"`
	AccountKey  *string `json:"accountKey,omitempty"`
	UseEmulator *bool   `json:"useEmulator,omitempty"`

	// GCP GCS
	ServiceAccountJSON *string `json:"serviceAccountJson,omitempty"`
	Anonymous          *bool   `json:"anonymous,omitempty"`
	ProjectNumber      *string `json:"projectNumber,omitempty"`

	// OCI Object Storage
	Namespace     *string `json:"namespace,omitempty"`
	Compartment   *string `json:"compartment,omitempty"`
	AuthProvider  *string `json:"authProvider,omitempty"`
	ConfigFile    *string `json:"configFile,omitempty"`
	ConfigProfile *string `json:"configProfile,omitempty"`
}

type ProfileTestResponse struct {
	OK      bool           `json:"ok"`
	Message string         `json:"message,omitempty"`
	Details map[string]any `json:"details,omitempty"`
}

type ProfileBenchmarkResponse struct {
	OK             bool    `json:"ok"`
	Message        string  `json:"message,omitempty"`
	UploadBps      *int64  `json:"uploadBps,omitempty"`
	DownloadBps    *int64  `json:"downloadBps,omitempty"`
	UploadMs       *int64  `json:"uploadMs,omitempty"`
	DownloadMs     *int64  `json:"downloadMs,omitempty"`
	FileSizeBytes  *int64  `json:"fileSizeBytes,omitempty"`
	CleanedUp      bool    `json:"cleanedUp"`
}

type ProfileTLSMode string

const (
	ProfileTLSModeDisabled ProfileTLSMode = "disabled"
	ProfileTLSModeMTLS     ProfileTLSMode = "mtls"
)

type ProfileTLSConfig struct {
	Mode          ProfileTLSMode `json:"mode"`
	ClientCertPEM string         `json:"clientCertPem,omitempty"`
	ClientKeyPEM  string         `json:"clientKeyPem,omitempty"`
	CACertPEM     string         `json:"caCertPem,omitempty"`
}

type ProfileTLSStatus struct {
	Mode          ProfileTLSMode `json:"mode"`
	HasClientCert bool           `json:"hasClientCert"`
	HasClientKey  bool           `json:"hasClientKey"`
	HasCACert     bool           `json:"hasCa"`
	UpdatedAt     string         `json:"updatedAt,omitempty"`
}

type Bucket struct {
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt,omitempty"`
}

type BucketCreateRequest struct {
	Name   string `json:"name"`
	Region string `json:"region,omitempty"`
}

type BucketPolicyResponse struct {
	Bucket string          `json:"bucket"`
	Exists bool            `json:"exists"`
	Policy json.RawMessage `json:"policy,omitempty"`
}

type BucketPolicyPutRequest struct {
	Policy json.RawMessage `json:"policy"`
}

// BucketPolicyValidateResponse is a provider-agnostic, non-mutating validation result for bucket access policies.
// It performs static checks only; provider-side validation happens when applying policies (PUT).
type BucketPolicyValidateResponse struct {
	Ok       bool            `json:"ok"`
	Provider ProfileProvider `json:"provider"`
	Errors   []string        `json:"errors,omitempty"`
	Warnings []string        `json:"warnings,omitempty"`
}

type ObjectItem struct {
	Key          string `json:"key"`
	Size         int64  `json:"size"`
	ETag         string `json:"etag,omitempty"`
	LastModified string `json:"lastModified"`
	StorageClass string `json:"storageClass,omitempty"`
}

type ObjectFavorite struct {
	Key       string `json:"key"`
	CreatedAt string `json:"createdAt"`
}

type ObjectFavoriteCreateRequest struct {
	Key string `json:"key"`
}

type FavoriteObjectItem struct {
	ObjectItem
	CreatedAt string `json:"createdAt"`
}

type ObjectFavoritesResponse struct {
	Bucket string               `json:"bucket"`
	Prefix string               `json:"prefix,omitempty"`
	Items  []FavoriteObjectItem `json:"items"`
}

type ListObjectsResponse struct {
	Bucket                string       `json:"bucket"`
	Prefix                string       `json:"prefix"`
	Delimiter             string       `json:"delimiter"`
	CommonPrefixes        []string     `json:"commonPrefixes"`
	Items                 []ObjectItem `json:"items"`
	NextContinuationToken *string      `json:"nextContinuationToken,omitempty"`
	IsTruncated           bool         `json:"isTruncated"`
}

type SearchObjectsResponse struct {
	Bucket     string       `json:"bucket"`
	Query      string       `json:"query"`
	Prefix     string       `json:"prefix,omitempty"`
	Items      []ObjectItem `json:"items"`
	NextCursor *string      `json:"nextCursor,omitempty"`
}

type ObjectIndexSummaryResponse struct {
	Bucket      string   `json:"bucket"`
	Prefix      string   `json:"prefix,omitempty"`
	ObjectCount int64    `json:"objectCount"`
	TotalBytes  int64    `json:"totalBytes"`
	SampleKeys  []string `json:"sampleKeys"`
	IndexedAt   *string  `json:"indexedAt,omitempty"`
}

type LocalEntry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"isDir"`
}

type ListLocalEntriesResponse struct {
	BasePath string       `json:"basePath,omitempty"`
	Entries  []LocalEntry `json:"entries"`
}

type ObjectMeta struct {
	Key          string            `json:"key"`
	Size         int64             `json:"size"`
	ETag         string            `json:"etag,omitempty"`
	LastModified string            `json:"lastModified,omitempty"`
	ContentType  string            `json:"contentType,omitempty"`
	Metadata     map[string]string `json:"metadata,omitempty"`
}

type PresignedURLResponse struct {
	URL       string `json:"url"`
	ExpiresAt string `json:"expiresAt"`
}

type CreateFolderRequest struct {
	Key string `json:"key"`
}

type CreateFolderResponse struct {
	Key string `json:"key"`
}

type DeleteObjectsRequest struct {
	Keys []string `json:"keys"`
}

type DeleteObjectsResponse struct {
	Deleted int `json:"deleted"`
}

type UploadCreateRequest struct {
	Bucket string `json:"bucket"`
	Prefix string `json:"prefix,omitempty"`
	Mode   string `json:"mode,omitempty"`
}

type UploadCreateResponse struct {
	UploadID  string `json:"uploadId"`
	Mode      string `json:"mode"`
	MaxBytes  *int64 `json:"maxBytes,omitempty"`
	ExpiresAt string `json:"expiresAt"`
}

type UploadChunkState struct {
	Present []int `json:"present"`
}

type UploadPresignRequest struct {
	Path           string                     `json:"path"`
	ContentType    string                     `json:"contentType,omitempty"`
	Size           *int64                     `json:"size,omitempty"`
	ExpiresSeconds *int                       `json:"expiresSeconds,omitempty"`
	Multipart      *UploadMultipartPresignReq `json:"multipart,omitempty"`
}

type UploadMultipartPresignReq struct {
	FileSize      *int64 `json:"fileSize,omitempty"`
	PartSizeBytes int64  `json:"partSizeBytes,omitempty"`
	PartNumbers   []int  `json:"partNumbers,omitempty"`
}

type UploadPresignResponse struct {
	Mode      string                  `json:"mode"`
	Bucket    string                  `json:"bucket"`
	Key       string                  `json:"key"`
	Method    string                  `json:"method,omitempty"`
	URL       string                  `json:"url,omitempty"`
	Headers   map[string]string       `json:"headers,omitempty"`
	ExpiresAt string                  `json:"expiresAt"`
	Multipart *UploadPresignMultipart `json:"multipart,omitempty"`
}

type UploadPresignMultipart struct {
	UploadID      string              `json:"uploadId"`
	PartSizeBytes int64               `json:"partSizeBytes"`
	PartCount     int                 `json:"partCount"`
	Parts         []UploadPresignPart `json:"parts,omitempty"`
}

type UploadPresignPart struct {
	Number  int               `json:"number"`
	Method  string            `json:"method,omitempty"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers,omitempty"`
}

type UploadMultipartCompleteRequest struct {
	Path  string                        `json:"path"`
	Parts []UploadMultipartCompletePart `json:"parts"`
}

type UploadMultipartCompletePart struct {
	Number int    `json:"number"`
	ETag   string `json:"etag"`
}

type UploadMultipartAbortRequest struct {
	Path string `json:"path"`
}

type JobStatus string

const (
	JobStatusQueued    JobStatus = "queued"
	JobStatusRunning   JobStatus = "running"
	JobStatusSucceeded JobStatus = "succeeded"
	JobStatusFailed    JobStatus = "failed"
	JobStatusCanceled  JobStatus = "canceled"
)

type JobProgress struct {
	ObjectsDone      *int64 `json:"objectsDone,omitempty"`
	ObjectsTotal     *int64 `json:"objectsTotal,omitempty"`
	ObjectsPerSecond *int64 `json:"objectsPerSecond,omitempty"`
	BytesDone        *int64 `json:"bytesDone,omitempty"`
	BytesTotal       *int64 `json:"bytesTotal,omitempty"`
	SpeedBps         *int64 `json:"speedBps,omitempty"`
	EtaSeconds       *int   `json:"etaSeconds,omitempty"`
}

type Job struct {
	ID         string         `json:"id"`
	Type       string         `json:"type"`
	Status     JobStatus      `json:"status"`
	Payload    map[string]any `json:"payload"`
	Progress   *JobProgress   `json:"progress,omitempty"`
	Error      *string        `json:"error,omitempty"`
	ErrorCode  *string        `json:"errorCode,omitempty"`
	CreatedAt  string         `json:"createdAt"`
	StartedAt  *string        `json:"startedAt,omitempty"`
	FinishedAt *string        `json:"finishedAt,omitempty"`
}

type JobCreateRequest struct {
	Type    string         `json:"type"`
	Payload map[string]any `json:"payload"`
}

type JobCreatedResponse struct {
	JobID string `json:"jobId"`
}

type JobsListResponse struct {
	Items      []Job   `json:"items"`
	NextCursor *string `json:"nextCursor,omitempty"`
}

type FeatureCapability struct {
	Enabled bool   `json:"enabled"`
	Reason  string `json:"reason,omitempty"`
}

type MetaCapabilities struct {
	ProfileTLS FeatureCapability                      `json:"profileTls"`
	Providers  map[ProfileProvider]ProviderCapability `json:"providers,omitempty"`
}

// ProviderCapabilityReasons carries per-capability reason messages when a capability is false.
// Keys mirror ProviderCapability JSON field names.
type ProviderCapabilityReasons struct {
	BucketCRUD                 string `json:"bucketCrud,omitempty"`
	ObjectCRUD                 string `json:"objectCrud,omitempty"`
	JobTransfer                string `json:"jobTransfer,omitempty"`
	BucketPolicy               string `json:"bucketPolicy,omitempty"`
	GCSIAMPolicy               string `json:"gcsIamPolicy,omitempty"`
	AzureContainerAccessPolicy string `json:"azureContainerAccessPolicy,omitempty"`
	PresignedUpload            string `json:"presignedUpload,omitempty"`
	PresignedMultipartUpload   string `json:"presignedMultipartUpload,omitempty"`
	DirectUpload               string `json:"directUpload,omitempty"`
}

// ProviderCapability describes provider-level feature availability so the UI can
// hide unsupported controls before making API calls.
type ProviderCapability struct {
	BucketCRUD                 bool                       `json:"bucketCrud"`
	ObjectCRUD                 bool                       `json:"objectCrud"`
	JobTransfer                bool                       `json:"jobTransfer"`
	BucketPolicy               bool                       `json:"bucketPolicy"`
	GCSIAMPolicy               bool                       `json:"gcsIamPolicy"`
	AzureContainerAccessPolicy bool                       `json:"azureContainerAccessPolicy"`
	PresignedUpload            bool                       `json:"presignedUpload"`
	PresignedMultipartUpload   bool                       `json:"presignedMultipartUpload"`
	DirectUpload               bool                       `json:"directUpload"`
	Reasons                    *ProviderCapabilityReasons `json:"reasons,omitempty"`
}

type MetaResponse struct {
	Version                 string             `json:"version"`
	ServerAddr              string             `json:"serverAddr"`
	DataDir                 string             `json:"dataDir"`
	StaticDir               string             `json:"staticDir"`
	APITokenEnabled         bool               `json:"apiTokenEnabled"`
	EncryptionEnabled       bool               `json:"encryptionEnabled"`
	Capabilities            MetaCapabilities   `json:"capabilities"`
	AllowedLocalDirs        []string           `json:"allowedLocalDirs,omitempty"`
	JobConcurrency          int                `json:"jobConcurrency"`
	JobLogMaxBytes          *int64             `json:"jobLogMaxBytes,omitempty"`
	JobRetentionSeconds     *int64             `json:"jobRetentionSeconds,omitempty"`
	JobLogRetentionSeconds  *int64             `json:"jobLogRetentionSeconds,omitempty"`
	UploadSessionTTLSeconds int64              `json:"uploadSessionTTLSeconds"`
	UploadMaxBytes          *int64             `json:"uploadMaxBytes,omitempty"`
	UploadDirectStream      bool               `json:"uploadDirectStream"`
	TransferEngine          TransferEngineInfo `json:"transferEngine"`
}

type TransferEngineInfo struct {
	Name       string `json:"name"`
	Available  bool   `json:"available"`
	Compatible bool   `json:"compatible"`
	MinVersion string `json:"minVersion"`
	Path       string `json:"path,omitempty"`
	Version    string `json:"version,omitempty"`
}
