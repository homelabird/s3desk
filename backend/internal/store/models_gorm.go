package store

type profileRow struct {
	ID                    string  `gorm:"column:id;primaryKey"`
	Name                  string  `gorm:"column:name"`
	Provider              string  `gorm:"column:provider"`
	ConfigJSON            string  `gorm:"column:config_json"`
	SecretsJSON           string  `gorm:"column:secrets_json"`
	Endpoint              string  `gorm:"column:endpoint"`
	Region                string  `gorm:"column:region"`
	ForcePathStyle        int     `gorm:"column:force_path_style"`
	PreserveLeadingSlash  int     `gorm:"column:preserve_leading_slash"`
	TLSInsecureSkipVerify int     `gorm:"column:tls_insecure_skip_verify"`
	AccessKeyID           string  `gorm:"column:access_key_id"`
	SecretAccessKey       string  `gorm:"column:secret_access_key"`
	SessionToken          *string `gorm:"column:session_token"`
	CreatedAt             string  `gorm:"column:created_at"`
	UpdatedAt             string  `gorm:"column:updated_at"`
}

func (profileRow) TableName() string { return "profiles" }

type profileConnectionOptionsRow struct {
	ProfileID     string `gorm:"column:profile_id;primaryKey"`
	SchemaVersion int    `gorm:"column:schema_version"`
	OptionsEnc    string `gorm:"column:options_enc"`
	CreatedAt     string `gorm:"column:created_at"`
	UpdatedAt     string `gorm:"column:updated_at"`
}

func (profileConnectionOptionsRow) TableName() string { return "profile_connection_options" }

type jobRow struct {
	ID           string  `gorm:"column:id;primaryKey"`
	ProfileID    string  `gorm:"column:profile_id"`
	Type         string  `gorm:"column:type"`
	Status       string  `gorm:"column:status"`
	PayloadJSON  string  `gorm:"column:payload_json"`
	ProgressJSON *string `gorm:"column:progress_json"`
	Error        *string `gorm:"column:error"`
	ErrorCode    *string `gorm:"column:error_code"`
	CreatedAt    string  `gorm:"column:created_at"`
	StartedAt    *string `gorm:"column:started_at"`
	FinishedAt   *string `gorm:"column:finished_at"`
}

func (jobRow) TableName() string { return "jobs" }

type uploadSessionRow struct {
	ID         string `gorm:"column:id;primaryKey"`
	ProfileID  string `gorm:"column:profile_id"`
	Bucket     string `gorm:"column:bucket"`
	Prefix     string `gorm:"column:prefix"`
	Mode       string `gorm:"column:mode"`
	StagingDir string `gorm:"column:staging_dir"`
	Bytes      int64  `gorm:"column:bytes_tracked"`
	ExpiresAt  string `gorm:"column:expires_at"`
	CreatedAt  string `gorm:"column:created_at"`
}

func (uploadSessionRow) TableName() string { return "upload_sessions" }

type uploadMultipartRow struct {
	UploadID   string `gorm:"column:upload_id;primaryKey"`
	ProfileID  string `gorm:"column:profile_id"`
	Path       string `gorm:"column:path;primaryKey"`
	Bucket     string `gorm:"column:bucket"`
	ObjectKey  string `gorm:"column:object_key"`
	S3UploadID string `gorm:"column:s3_upload_id"`
	ChunkSize  int64  `gorm:"column:chunk_size"`
	FileSize   int64  `gorm:"column:file_size"`
	CreatedAt  string `gorm:"column:created_at"`
	UpdatedAt  string `gorm:"column:updated_at"`
}

func (uploadMultipartRow) TableName() string { return "upload_multipart_uploads" }

type objectIndexRow struct {
	ProfileID    string  `gorm:"column:profile_id;primaryKey"`
	Bucket       string  `gorm:"column:bucket;primaryKey"`
	ObjectKey    string  `gorm:"column:object_key;primaryKey"`
	Size         int64   `gorm:"column:size"`
	ETag         *string `gorm:"column:etag"`
	LastModified *string `gorm:"column:last_modified"`
	IndexedAt    string  `gorm:"column:indexed_at"`
}

func (objectIndexRow) TableName() string { return "object_index" }

type objectFavoriteRow struct {
	ProfileID string `gorm:"column:profile_id;primaryKey"`
	Bucket    string `gorm:"column:bucket;primaryKey"`
	ObjectKey string `gorm:"column:object_key;primaryKey"`
	CreatedAt string `gorm:"column:created_at"`
}

func (objectFavoriteRow) TableName() string { return "object_favorites" }
