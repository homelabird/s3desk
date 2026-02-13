package api

import (
	"net/http"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
	"s3desk/internal/version"
)

func (s *server) handleGetMeta(w http.ResponseWriter, r *http.Request) {
	path, ok := jobs.DetectRclone()
	rcloneVersion, vok := jobs.DetectRcloneVersion(r.Context())
	compatible := false
	if ok && vok {
		compatible = jobs.IsRcloneVersionCompatible(rcloneVersion)
	}
	var jobLogMaxBytes *int64
	if s.cfg.JobLogMaxBytes > 0 {
		v := s.cfg.JobLogMaxBytes
		jobLogMaxBytes = &v
	}
	var jobRetentionSeconds *int64
	if s.cfg.JobRetention > 0 {
		v := int64(s.cfg.JobRetention.Seconds())
		jobRetentionSeconds = &v
	}
	var jobLogRetentionSeconds *int64
	if s.cfg.JobLogRetention > 0 {
		v := int64(s.cfg.JobLogRetention.Seconds())
		jobLogRetentionSeconds = &v
	}
	var uploadMaxBytes *int64
	if s.cfg.UploadMaxBytes > 0 {
		v := s.cfg.UploadMaxBytes
		uploadMaxBytes = &v
	}
	tlsCapability := models.FeatureCapability{
		Enabled: s.cfg.EncryptionKey != "",
	}
	if !tlsCapability.Enabled {
		tlsCapability.Reason = "ENCRYPTION_KEY is required to store mTLS material"
	}
	resp := models.MetaResponse{
		Version:           version.Version,
		ServerAddr:        s.serverAddr,
		DataDir:           s.cfg.DataDir,
		StaticDir:         s.cfg.StaticDir,
		APITokenEnabled:   s.cfg.APIToken != "",
		EncryptionEnabled: s.cfg.EncryptionKey != "",
		Capabilities: models.MetaCapabilities{
			ProfileTLS: tlsCapability,
			Providers:  providerCapabilityMatrix(s.cfg.UploadDirectStream),
		},
		AllowedLocalDirs:        s.cfg.AllowedLocalDirs,
		JobConcurrency:          s.cfg.JobConcurrency,
		JobLogMaxBytes:          jobLogMaxBytes,
		JobRetentionSeconds:     jobRetentionSeconds,
		JobLogRetentionSeconds:  jobLogRetentionSeconds,
		UploadSessionTTLSeconds: int64(s.cfg.UploadSessionTTL.Seconds()),
		UploadMaxBytes:          uploadMaxBytes,
		UploadDirectStream:      s.cfg.UploadDirectStream,
		TransferEngine: models.TransferEngineInfo{
			Name:       "rclone",
			Available:  ok,
			Compatible: compatible,
			MinVersion: jobs.MinSupportedRcloneVersion,
			Path:       path,
			Version: func() string {
				if !vok {
					return ""
				}
				return rcloneVersion
			}(),
		},
	}
	writeJSON(w, http.StatusOK, resp)
}

func providerCapabilityMatrix(uploadDirectStream bool) map[models.ProfileProvider]models.ProviderCapability {
	const (
		reasonBucketPolicyS3Only             = "Supported only by S3-compatible providers (aws_s3, s3_compatible, oci_s3_compat)."
		reasonGCSIAMPolicyOnly               = "Supported only by gcp_gcs."
		reasonAzureContainerPolicyOnly       = "Supported only by azure_blob."
		reasonPresignedUploadS3Only          = "Presigned upload is supported only by S3-compatible providers (aws_s3, s3_compatible, oci_s3_compat)."
		reasonPresignedMultipartUploadS3Only = "Presigned multipart upload is supported only by S3-compatible providers (aws_s3, s3_compatible, oci_s3_compat)."
		reasonDirectUploadDisabledByConfig   = "Direct upload mode is disabled on this server (UPLOAD_DIRECT_STREAM=false)."
	)

	newBase := func() models.ProviderCapability {
		cap := models.ProviderCapability{
			BucketCRUD:   true,
			ObjectCRUD:   true,
			JobTransfer:  true,
			DirectUpload: uploadDirectStream,
		}
		if !uploadDirectStream {
			cap.Reasons = &models.ProviderCapabilityReasons{
				DirectUpload: reasonDirectUploadDisabledByConfig,
			}
		}
		return cap
	}

	out := map[models.ProfileProvider]models.ProviderCapability{
		models.ProfileProviderAwsS3:            newBase(),
		models.ProfileProviderS3Compatible:     newBase(),
		models.ProfileProviderOciS3Compat:      newBase(),
		models.ProfileProviderAzureBlob:        newBase(),
		models.ProfileProviderGcpGcs:           newBase(),
		models.ProfileProviderOciObjectStorage: newBase(),
	}

	s3Like := []models.ProfileProvider{
		models.ProfileProviderAwsS3,
		models.ProfileProviderS3Compatible,
		models.ProfileProviderOciS3Compat,
	}
	for _, provider := range s3Like {
		cap := out[provider]
		cap.BucketPolicy = true
		cap.PresignedUpload = true
		cap.PresignedMultipartUpload = true
		out[provider] = cap
	}

	azure := out[models.ProfileProviderAzureBlob]
	azure.AzureContainerAccessPolicy = true
	out[models.ProfileProviderAzureBlob] = azure

	gcs := out[models.ProfileProviderGcpGcs]
	gcs.GCSIAMPolicy = true
	out[models.ProfileProviderGcpGcs] = gcs

	ensureReasons := func(cap *models.ProviderCapability) *models.ProviderCapabilityReasons {
		if cap.Reasons == nil {
			cap.Reasons = &models.ProviderCapabilityReasons{}
		}
		return cap.Reasons
	}

	for provider, cap := range out {
		if !cap.BucketPolicy {
			ensureReasons(&cap).BucketPolicy = reasonBucketPolicyS3Only
		}
		if !cap.GCSIAMPolicy {
			ensureReasons(&cap).GCSIAMPolicy = reasonGCSIAMPolicyOnly
		}
		if !cap.AzureContainerAccessPolicy {
			ensureReasons(&cap).AzureContainerAccessPolicy = reasonAzureContainerPolicyOnly
		}
		if !cap.PresignedUpload {
			ensureReasons(&cap).PresignedUpload = reasonPresignedUploadS3Only
		}
		if !cap.PresignedMultipartUpload {
			ensureReasons(&cap).PresignedMultipartUpload = reasonPresignedMultipartUploadS3Only
		}
		out[provider] = cap
	}

	return out
}
