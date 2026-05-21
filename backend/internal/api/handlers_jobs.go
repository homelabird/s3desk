package api

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"s3desk/internal/jobs"
	"s3desk/internal/localpath"
	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
)

func (s *server) handleListJobs(w http.ResponseWriter, r *http.Request) {
	newJobListHTTPService(s).handleListJobs(w, r)
}

func (s *server) handleCreateJob(w http.ResponseWriter, r *http.Request) {
	newJobSubmissionHTTPService(s).handleCreateJob(w, r)
}

func (s *server) handleGetJob(w http.ResponseWriter, r *http.Request) {
	newJobReadHTTPService(s).handleGetJob(w, r)
}

func (s *server) handleGetJobArtifact(w http.ResponseWriter, r *http.Request) {
	newJobReadHTTPService(s).handleGetJobArtifact(w, r)
}

func (s *server) handleDeleteJob(w http.ResponseWriter, r *http.Request) {
	newJobMutationHTTPService(s).handleDeleteJob(w, r)
}

func (s *server) handleRetryJob(w http.ResponseWriter, r *http.Request) {
	newJobSubmissionHTTPService(s).handleRetryJob(w, r)
}

func (s *server) handleGetJobLogs(w http.ResponseWriter, r *http.Request) {
	newJobReadHTTPService(s).handleGetJobLogs(w, r)
}

func (s *server) handleCancelJob(w http.ResponseWriter, r *http.Request) {
	newJobMutationHTTPService(s).handleCancelJob(w, r)
}

func validateS3ZipPrefixPayload(payload map[string]any) error {
	bucket, _ := payload["bucket"].(string)
	prefix, _ := payload["prefix"].(string)

	bucket = strings.TrimSpace(bucket)
	prefix = strings.TrimLeft(strings.TrimSpace(prefix), "/")

	if bucket == "" {
		return errors.New("payload.bucket is required")
	}
	if strings.ContainsRune(prefix, 0) {
		return errors.New("payload.prefix contains invalid characters")
	}

	payload["bucket"] = bucket
	payload["prefix"] = prefix
	return nil
}

func validateS3ZipObjectsPayload(payload map[string]any) error {
	bucket, _ := payload["bucket"].(string)
	stripPrefix, _ := payload["stripPrefix"].(string)

	bucket = strings.TrimSpace(bucket)
	stripPrefix = strings.TrimLeft(strings.TrimSpace(stripPrefix), "/")

	if bucket == "" {
		return errors.New("payload.bucket is required")
	}

	rawKeys, ok := payload["keys"].([]any)
	if !ok || len(rawKeys) == 0 {
		return errors.New("payload.keys must contain at least one key")
	}
	if len(rawKeys) > 10_000 {
		return errors.New("payload.keys is too large (max 10000)")
	}

	keys := make([]string, 0, len(rawKeys))
	for i, v := range rawKeys {
		k, ok := v.(string)
		if !ok {
			return fmt.Errorf("payload.keys[%d] must be a string", i)
		}
		if err := rcloneconfig.ValidateSingleLineValue(fmt.Sprintf("payload.keys[%d]", i), k); err != nil {
			return err
		}
		k = strings.TrimPrefix(strings.TrimSpace(k), "/")
		if k == "" {
			return errors.New("payload.keys contains an empty key")
		}
		if strings.ContainsRune(k, 0) {
			return errors.New("payload.keys contains an invalid key")
		}
		keys = append(keys, k)
	}
	if strings.ContainsRune(stripPrefix, 0) {
		return errors.New("payload.stripPrefix contains invalid characters")
	}

	payload["bucket"] = bucket
	payload["stripPrefix"] = stripPrefix
	payload["keys"] = keys
	return nil
}

func jobArtifactFilename(job models.Job) string {
	bucket, _ := job.Payload["bucket"].(string)
	prefix, _ := job.Payload["prefix"].(string)
	stripPrefix, _ := job.Payload["stripPrefix"].(string)

	bucket = strings.TrimSpace(bucket)
	prefix = strings.Trim(strings.TrimLeft(strings.TrimSpace(prefix), "/"), "/")
	stripPrefix = strings.Trim(strings.TrimLeft(strings.TrimSpace(stripPrefix), "/"), "/")

	base := "download"
	switch job.Type {
	case jobs.JobTypeS3ZipPrefix:
		if bucket != "" && prefix != "" {
			base = bucket + "-" + prefix
		} else if bucket != "" {
			base = bucket
		}
	case jobs.JobTypeS3ZipObjects:
		if bucket != "" && stripPrefix != "" {
			base = bucket + "-" + stripPrefix
		} else if bucket != "" {
			base = bucket + "-selection"
		}
	default:
		if job.ID != "" {
			base = "job-" + job.ID
		}
	}
	return safeFilename(base) + ".zip"
}

func safeFilename(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "download"
	}
	var b strings.Builder
	b.Grow(len(value))
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
		case r >= 'A' && r <= 'Z':
			b.WriteRune(r)
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == '_' || r == '.' || r == ' ':
			b.WriteRune(r)
		default:
			b.WriteByte('-')
		}
	}
	out := strings.TrimSpace(b.String())
	out = strings.Trim(out, ".")
	out = strings.ReplaceAll(out, " ", "-")
	out = strings.Trim(out, "-")
	if out == "" {
		out = "download"
	}
	if len(out) > 120 {
		out = out[:120]
	}
	return out
}

func validateTransferDeletePrefixPayload(payload map[string]any) error {
	bucket, _ := payload["bucket"].(string)
	prefix, _ := payload["prefix"].(string)
	deleteAll, _ := payload["deleteAll"].(bool)
	allowUnsafePrefix, _ := payload["allowUnsafePrefix"].(bool)

	bucket = strings.TrimSpace(bucket)
	prefix = strings.TrimLeft(strings.TrimSpace(prefix), "/")

	if bucket == "" {
		return errors.New("payload.bucket is required")
	}
	if deleteAll && prefix != "" {
		return errors.New("payload.prefix must be empty when payload.deleteAll=true")
	}
	if prefix == "" && !deleteAll {
		return errors.New("payload.prefix is required (or set payload.deleteAll=true)")
	}
	if strings.Contains(prefix, "*") {
		return errors.New("wildcards are not allowed in prefix")
	}
	if prefix != "" && !strings.HasSuffix(prefix, "/") && !allowUnsafePrefix {
		return errors.New("payload.prefix must end with '/' (or set payload.allowUnsafePrefix=true)")
	}

	payload["bucket"] = bucket
	payload["prefix"] = prefix
	return nil
}

func validateTransferSyncLocalToS3Payload(payload map[string]any, allowedRoots []string) error {
	bucket, _ := payload["bucket"].(string)
	prefix, _ := payload["prefix"].(string)
	localPath, _ := payload["localPath"].(string)

	bucket = strings.TrimSpace(bucket)
	prefix = strings.TrimPrefix(strings.TrimSpace(prefix), "/")
	localPath = strings.TrimSpace(localPath)

	if bucket == "" {
		return errors.New("payload.bucket is required")
	}
	if localPath == "" {
		return errors.New("payload.localPath is required")
	}
	if strings.Contains(prefix, "*") {
		return errors.New("wildcards are not allowed in prefix")
	}
	if err := validateLocalPathForRead(localPath, allowedRoots); err != nil {
		return err
	}

	payload["bucket"] = bucket
	payload["prefix"] = prefix
	payload["localPath"] = localPath
	return nil
}

func validateTransferSyncS3ToLocalPayload(payload map[string]any, allowedRoots []string) error {
	bucket, _ := payload["bucket"].(string)
	prefix, _ := payload["prefix"].(string)
	localPath, _ := payload["localPath"].(string)

	bucket = strings.TrimSpace(bucket)
	prefix = strings.TrimPrefix(strings.TrimSpace(prefix), "/")
	localPath = strings.TrimSpace(localPath)

	if bucket == "" {
		return errors.New("payload.bucket is required")
	}
	if localPath == "" {
		return errors.New("payload.localPath is required")
	}
	if strings.Contains(prefix, "*") {
		return errors.New("wildcards are not allowed in prefix")
	}
	if err := validateLocalPathForCreate(localPath, allowedRoots); err != nil {
		return err
	}

	payload["bucket"] = bucket
	payload["prefix"] = prefix
	payload["localPath"] = localPath
	return nil
}

func validateLocalPathForRead(localPath string, allowedRoots []string) error {
	if len(allowedRoots) == 0 {
		return nil
	}

	abs, err := filepath.Abs(filepath.Clean(localPath))
	if err != nil {
		return errors.New("payload.localPath is invalid")
	}
	real, err := filepath.EvalSymlinks(abs)
	if err != nil {
		if os.IsNotExist(err) {
			return errors.New("payload.localPath not found")
		}
		return fmt.Errorf("payload.localPath is invalid: %w", err)
	}
	if _, err := os.Stat(real); err != nil {
		if os.IsNotExist(err) {
			return errors.New("payload.localPath not found")
		}
		return fmt.Errorf("payload.localPath is invalid: %w", err)
	}
	for _, root := range allowedRoots {
		if isUnderDir(root, real) {
			if err := localpath.RejectSymlinkComponentsUnderRoots(abs, allowedRoots); err != nil {
				return fmt.Errorf("payload.localPath is invalid: %w", err)
			}
			return nil
		}
	}
	return fmt.Errorf("payload.localPath %q is not under an allowed local directory", real)
}

func validateLocalPathForCreate(localPath string, allowedRoots []string) error {
	if len(allowedRoots) == 0 {
		return nil
	}

	real, err := resolveLocalPathForCreate(localPath)
	if err != nil {
		return err
	}
	for _, root := range allowedRoots {
		if isUnderDir(root, real) {
			if err := rejectLocalPathSymlinkComponentsForCreate(localPath, allowedRoots); err != nil {
				return err
			}
			return nil
		}
	}
	return fmt.Errorf("payload.localPath %q is not under an allowed local directory", real)
}

func rejectLocalPathSymlinkComponentsForCreate(localPath string, allowedRoots []string) error {
	clean := filepath.Clean(localPath)
	if clean == "" || clean == "." {
		return errors.New("payload.localPath is invalid")
	}
	abs, err := filepath.Abs(clean)
	if err != nil {
		return errors.New("payload.localPath is invalid")
	}
	if err := localpath.RejectSymlinkComponentsUnderRoots(abs, allowedRoots); err != nil {
		return fmt.Errorf("payload.localPath is invalid: %w", err)
	}
	return nil
}

func resolveLocalPathForCreate(localPath string) (string, error) {
	clean := filepath.Clean(localPath)
	if clean == "" || clean == "." {
		return "", errors.New("payload.localPath is invalid")
	}
	abs, err := filepath.Abs(clean)
	if err != nil {
		return "", errors.New("payload.localPath is invalid")
	}
	if real, err := filepath.EvalSymlinks(abs); err == nil {
		return real, nil
	} else if !os.IsNotExist(err) {
		return "", fmt.Errorf("payload.localPath is invalid: %w", err)
	}

	current := abs
	for {
		parent := filepath.Dir(current)
		if parent == current {
			return abs, nil
		}

		info, err := os.Stat(parent)
		if err != nil {
			if os.IsNotExist(err) {
				current = parent
				continue
			}
			return "", fmt.Errorf("payload.localPath is invalid: %w", err)
		}
		if !info.IsDir() {
			return "", fmt.Errorf("payload.localPath is invalid: %q is not a directory", parent)
		}

		realParent, err := filepath.EvalSymlinks(parent)
		if err != nil {
			return "", fmt.Errorf("payload.localPath is invalid: %w", err)
		}
		rel, err := filepath.Rel(parent, abs)
		if err != nil {
			return "", fmt.Errorf("payload.localPath is invalid: %w", err)
		}
		return filepath.Join(realParent, rel), nil
	}
}

func validateTransferSyncStagingToS3Payload(payload map[string]any) error {
	uploadID, _ := payload["uploadId"].(string)
	uploadID = strings.TrimSpace(uploadID)
	if uploadID == "" {
		return errors.New("payload.uploadId is required")
	}
	payload["uploadId"] = uploadID
	return nil
}

func validateS3DeleteObjectsPayload(payload map[string]any) error {
	bucket, _ := payload["bucket"].(string)
	bucket = strings.TrimSpace(bucket)
	if bucket == "" {
		return errors.New("payload.bucket is required")
	}

	rawKeys, ok := payload["keys"].([]any)
	if !ok {
		return errors.New("payload.keys must be an array of strings")
	}
	keys := make([]string, 0, len(rawKeys))
	for i, item := range rawKeys {
		s, ok := item.(string)
		if !ok {
			return errors.New("payload.keys must be an array of strings")
		}
		if err := rcloneconfig.ValidateSingleLineValue(fmt.Sprintf("payload.keys[%d]", i), s); err != nil {
			return err
		}
		if s == "" {
			continue
		}
		keys = append(keys, s)
	}
	if len(keys) == 0 {
		return errors.New("payload.keys must contain at least one key")
	}
	if len(keys) > 50_000 {
		return errors.New("payload.keys is too large (max 50000); use a prefix delete job instead")
	}

	payload["bucket"] = bucket
	payload["keys"] = keys
	return nil
}

func validateS3IndexObjectsPayload(payload map[string]any) error {
	bucket, _ := payload["bucket"].(string)
	prefix, _ := payload["prefix"].(string)

	bucket = strings.TrimSpace(bucket)
	prefix = strings.TrimPrefix(strings.TrimSpace(prefix), "/")

	if bucket == "" {
		return errors.New("payload.bucket is required")
	}
	if strings.Contains(prefix, "*") {
		return errors.New("wildcards are not allowed in prefix")
	}

	fullReindex := true
	if v, ok := payload["fullReindex"]; ok {
		b, ok := v.(bool)
		if !ok {
			return errors.New("payload.fullReindex must be a boolean")
		}
		fullReindex = b
	}

	payload["bucket"] = bucket
	payload["prefix"] = prefix
	payload["fullReindex"] = fullReindex
	return nil
}

func validateTransferCopyMoveObjectPayload(payload map[string]any) error {
	srcBucket, _ := payload["srcBucket"].(string)
	srcKey, _ := payload["srcKey"].(string)
	dstBucket, _ := payload["dstBucket"].(string)
	dstKey, _ := payload["dstKey"].(string)

	srcBucket = strings.TrimSpace(srcBucket)
	srcKey = strings.TrimPrefix(strings.TrimSpace(srcKey), "/")
	dstBucket = strings.TrimSpace(dstBucket)
	dstKey = strings.TrimPrefix(strings.TrimSpace(dstKey), "/")

	if srcBucket == "" || srcKey == "" || dstBucket == "" || dstKey == "" {
		return errors.New("payload.srcBucket, payload.srcKey, payload.dstBucket and payload.dstKey are required")
	}
	if strings.Contains(srcKey, "*") || strings.Contains(dstKey, "*") {
		return errors.New("wildcards are not allowed in keys")
	}
	if srcBucket == dstBucket && srcKey == dstKey {
		return errors.New("source and destination must be different")
	}

	payload["srcBucket"] = srcBucket
	payload["srcKey"] = srcKey
	payload["dstBucket"] = dstBucket
	payload["dstKey"] = dstKey
	return nil
}

func validateTransferCopyMoveBatchPayload(payload map[string]any) error {
	srcBucket, _ := payload["srcBucket"].(string)
	dstBucket, _ := payload["dstBucket"].(string)

	srcBucket = strings.TrimSpace(srcBucket)
	dstBucket = strings.TrimSpace(dstBucket)

	if srcBucket == "" || dstBucket == "" {
		return errors.New("payload.srcBucket and payload.dstBucket are required")
	}

	rawItems, ok := payload["items"].([]any)
	if !ok || len(rawItems) < 1 {
		return errors.New("payload.items is required")
	}
	if len(rawItems) > 5000 {
		return errors.New("payload.items exceeds max length (5000)")
	}

	sanitized := make([]any, 0, len(rawItems))
	for i, item := range rawItems {
		mm, ok := item.(map[string]any)
		if !ok {
			return fmt.Errorf("payload.items[%d] must be an object", i)
		}
		srcKey, _ := mm["srcKey"].(string)
		dstKey, _ := mm["dstKey"].(string)
		srcKey = strings.TrimPrefix(strings.TrimSpace(srcKey), "/")
		dstKey = strings.TrimPrefix(strings.TrimSpace(dstKey), "/")
		if srcKey == "" || dstKey == "" {
			return fmt.Errorf("payload.items[%d].srcKey and payload.items[%d].dstKey are required", i, i)
		}
		if strings.Contains(srcKey, "*") || strings.Contains(dstKey, "*") {
			return fmt.Errorf("wildcards are not allowed in keys (items[%d])", i)
		}
		if srcBucket == dstBucket && srcKey == dstKey {
			return fmt.Errorf("source and destination must be different (items[%d])", i)
		}
		sanitized = append(sanitized, map[string]any{"srcKey": srcKey, "dstKey": dstKey})
	}

	payload["srcBucket"] = srcBucket
	payload["dstBucket"] = dstBucket
	payload["items"] = sanitized
	return nil
}

func validateTransferCopyMovePrefixPayload(payload map[string]any) error {
	srcBucket, _ := payload["srcBucket"].(string)
	srcPrefix, _ := payload["srcPrefix"].(string)
	dstBucket, _ := payload["dstBucket"].(string)
	dstPrefix, _ := payload["dstPrefix"].(string)

	srcBucket = strings.TrimSpace(srcBucket)
	srcPrefix = strings.TrimPrefix(strings.TrimSpace(srcPrefix), "/")
	dstBucket = strings.TrimSpace(dstBucket)
	dstPrefix = strings.TrimPrefix(strings.TrimSpace(dstPrefix), "/")

	if srcBucket == "" || dstBucket == "" {
		return errors.New("payload.srcBucket and payload.dstBucket are required")
	}
	if srcPrefix == "" {
		return errors.New("payload.srcPrefix is required")
	}
	if strings.Contains(srcPrefix, "*") || strings.Contains(dstPrefix, "*") {
		return errors.New("wildcards are not allowed in prefixes")
	}
	if !strings.HasSuffix(srcPrefix, "/") {
		return errors.New("payload.srcPrefix must end with '/'")
	}
	if dstPrefix != "" && !strings.HasSuffix(dstPrefix, "/") {
		dstPrefix += "/"
	}
	if srcBucket == dstBucket && dstPrefix != "" {
		if dstPrefix == srcPrefix {
			return errors.New("source and destination must be different")
		}
		if strings.HasPrefix(dstPrefix, srcPrefix) {
			return errors.New("destination prefix must not be under source prefix")
		}
	}

	payload["srcBucket"] = srcBucket
	payload["srcPrefix"] = srcPrefix
	payload["dstBucket"] = dstBucket
	payload["dstPrefix"] = dstPrefix
	return nil
}
