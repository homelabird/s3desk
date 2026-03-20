package jobs

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

func (m *Manager) runTransferSyncStagingToS3(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferSyncStagingToS3Payload(payload)
	if err != nil {
		return err
	}
	uploadID := parsed.UploadID
	if uploadID == "" {
		return errors.New("payload.uploadId is required")
	}

	us, ok, err := m.store.GetUploadSession(ctx, profileID, uploadID)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("upload session not found")
	}

	// best-effort expiry check
	if expiresAt, err := time.Parse(time.RFC3339Nano, us.ExpiresAt); err == nil {
		if time.Now().UTC().After(expiresAt) {
			return errors.New("upload session expired")
		}
	}
	if us.StagingDir == "" {
		return errors.New("upload session is missing staging directory")
	}

	// Sync staging dir -> bucket/prefix
	src, err := store.ResolveUploadStagingDir(m.dataDir, us.ID)
	if err != nil {
		return fmt.Errorf("resolve upload staging dir: %w", err)
	}
	dst := rcloneRemoteDir(us.Bucket, us.Prefix, preserveLeadingSlash)

	preflightCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	if totals, err := computeLocalTotals(preflightCtx, src, nil, nil); err == nil {
		m.trySetJobTotals(jobID, totals.Objects, totals.Bytes)
	}
	cancel()
	err = m.runRcloneSync(ctx, profileID, jobID, src, dst, false, nil, nil, false, rcloneProgressTransfers)
	if err != nil {
		return err
	}

	// Cleanup staging on success (best-effort).
	_, _ = m.store.DeleteUploadSession(context.Background(), profileID, uploadID)
	_ = os.RemoveAll(src)
	return nil
}

func (m *Manager) runTransferSyncLocalToS3(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferSyncLocalPathPayload(payload)
	if err != nil {
		return err
	}
	bucket := parsed.Bucket
	prefix := parsed.Prefix
	localPath := parsed.LocalPath
	if bucket == "" || localPath == "" {
		return errors.New("payload.bucket and payload.localPath are required")
	}

	dryRun := parsed.DryRun
	deleteExtraneous := parsed.DeleteExtraneous
	include := parsed.Include
	exclude := parsed.Exclude

	src := filepath.Clean(localPath)
	if err := m.ensureLocalPathAllowed(src); err != nil {
		return err
	}

	preflightCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	if totals, err := computeLocalTotals(preflightCtx, src, include, exclude); err == nil {
		m.trySetJobTotals(jobID, totals.Objects, totals.Bytes)
	}
	cancel()
	dst := rcloneRemoteDir(bucket, prefix, preserveLeadingSlash)
	return m.runRcloneSync(ctx, profileID, jobID, src, dst, deleteExtraneous, include, exclude, dryRun, rcloneProgressTransfers)
}

func (m *Manager) runTransferSyncS3ToLocal(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferSyncLocalPathPayload(payload)
	if err != nil {
		return err
	}
	bucket := parsed.Bucket
	prefix := parsed.Prefix
	localPath := parsed.LocalPath
	if bucket == "" || localPath == "" {
		return errors.New("payload.bucket and payload.localPath are required")
	}

	dryRun := parsed.DryRun
	deleteExtraneous := parsed.DeleteExtraneous
	include := parsed.Include
	exclude := parsed.Exclude

	bucket = strings.TrimSpace(bucket)
	prefix = normalizeKeyInput(prefix, preserveLeadingSlash)
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

	dst, err := m.prepareLocalDestination(localPath)
	if err != nil {
		return err
	}

	preflightCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	m.trySetJobTotalsFromS3Prefix(preflightCtx, profileID, jobID, bucket, prefix, include, exclude, preserveLeadingSlash)
	cancel()

	src := rcloneRemoteDir(bucket, prefix, preserveLeadingSlash)
	return m.runRcloneSync(ctx, profileID, jobID, src, dst, deleteExtraneous, include, exclude, dryRun, rcloneProgressTransfers)
}

func (m *Manager) runTransferDeletePrefix(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferDeletePrefixPayload(payload)
	if err != nil {
		return err
	}
	bucket := parsed.Bucket
	prefix := parsed.Prefix
	deleteAll := parsed.DeleteAll
	dryRun := parsed.DryRun
	allowUnsafePrefix := parsed.AllowUnsafePrefix
	include := parsed.Include
	exclude := parsed.Exclude

	bucket = strings.TrimSpace(bucket)
	prefix = normalizeKeyInput(prefix, preserveLeadingSlash)

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

	var profileSecrets models.ProfileSecrets
	if !deleteAll && !dryRun {
		secrets, ok, err := m.store.GetProfileSecrets(ctx, profileID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrProfileNotFound
		}
		profileSecrets = secrets
	}

	preflightCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	m.trySetJobObjectsTotalFromS3Prefix(preflightCtx, profileID, jobID, bucket, prefix, include, exclude, preserveLeadingSlash)
	cancel()

	cmd := "delete"
	target := rcloneRemoteDir(bucket, prefix, preserveLeadingSlash)
	if deleteAll {
		cmd = "purge"
		target = rcloneRemoteBucket(bucket)
	}

	args := []string{cmd}
	if !deleteAll {
		for _, pat := range include {
			if pat == "" {
				continue
			}
			args = append(args, "--include", pat)
		}
		for _, pat := range exclude {
			if pat == "" {
				continue
			}
			args = append(args, "--exclude", pat)
		}
	}
	args = append(args, target)

	if err := m.runRclone(ctx, profileID, jobID, args, runRcloneOptions{TrackProgress: true, DryRun: dryRun, ProgressMode: rcloneProgressDeletes}); err != nil {
		return err
	}

	if !deleteAll && !dryRun {
		if err := cleanupS3PrefixMarkerIfEmpty(ctx, profileSecrets, bucket, prefix); err != nil {
			return err
		}
	}

	return nil
}

func (m *Manager) runTransferCopyObject(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferCopyMoveObjectPayload(payload)
	if err != nil {
		return err
	}
	srcBucket := parsed.SrcBucket
	srcKey := parsed.SrcKey
	dstBucket := parsed.DstBucket
	dstKey := parsed.DstKey
	dryRun := parsed.DryRun

	srcBucket = strings.TrimSpace(srcBucket)
	srcKey = normalizeKeyInput(srcKey, preserveLeadingSlash)
	dstBucket = strings.TrimSpace(dstBucket)
	dstKey = normalizeKeyInput(dstKey, preserveLeadingSlash)

	if srcBucket == "" || srcKey == "" || dstBucket == "" || dstKey == "" {
		return errors.New("payload.srcBucket, payload.srcKey, payload.dstBucket and payload.dstKey are required")
	}
	if strings.Contains(srcKey, "*") || strings.Contains(dstKey, "*") {
		return errors.New("wildcards are not allowed in keys")
	}
	if srcBucket == dstBucket && srcKey == dstKey {
		return errors.New("source and destination must be different")
	}

	m.trySetJobTotalsFromS3Object(ctx, profileID, jobID, srcBucket, srcKey, preserveLeadingSlash)

	args := []string{"copyto", rcloneRemoteObject(srcBucket, srcKey, preserveLeadingSlash), rcloneRemoteObject(dstBucket, dstKey, preserveLeadingSlash)}
	return m.runRclone(ctx, profileID, jobID, args, runRcloneOptions{TrackProgress: true, DryRun: dryRun, ProgressMode: rcloneProgressTransfers})
}

func (m *Manager) runTransferMoveObject(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferCopyMoveObjectPayload(payload)
	if err != nil {
		return err
	}
	srcBucket := parsed.SrcBucket
	srcKey := parsed.SrcKey
	dstBucket := parsed.DstBucket
	dstKey := parsed.DstKey
	dryRun := parsed.DryRun

	srcBucket = strings.TrimSpace(srcBucket)
	srcKey = normalizeKeyInput(srcKey, preserveLeadingSlash)
	dstBucket = strings.TrimSpace(dstBucket)
	dstKey = normalizeKeyInput(dstKey, preserveLeadingSlash)

	if srcBucket == "" || srcKey == "" || dstBucket == "" || dstKey == "" {
		return errors.New("payload.srcBucket, payload.srcKey, payload.dstBucket and payload.dstKey are required")
	}
	if strings.Contains(srcKey, "*") || strings.Contains(dstKey, "*") {
		return errors.New("wildcards are not allowed in keys")
	}
	if srcBucket == dstBucket && srcKey == dstKey {
		return errors.New("source and destination must be different")
	}

	m.trySetJobTotalsFromS3Object(ctx, profileID, jobID, srcBucket, srcKey, preserveLeadingSlash)

	args := []string{"moveto", rcloneRemoteObject(srcBucket, srcKey, preserveLeadingSlash), rcloneRemoteObject(dstBucket, dstKey, preserveLeadingSlash)}
	return m.runRclone(ctx, profileID, jobID, args, runRcloneOptions{TrackProgress: true, DryRun: dryRun, ProgressMode: rcloneProgressTransfers})
}

func (m *Manager) runTransferCopyBatch(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferBatchPayload(payload)
	if err != nil {
		return err
	}
	srcBucket := parsed.SrcBucket
	dstBucket := parsed.DstBucket
	items := parsed.Items
	dryRun := parsed.DryRun

	srcBucket = strings.TrimSpace(srcBucket)
	dstBucket = strings.TrimSpace(dstBucket)
	if srcBucket == "" || dstBucket == "" {
		return errors.New("payload.srcBucket and payload.dstBucket are required")
	}
	if len(items) < 1 {
		return errors.New("payload.items is required")
	}

	pairs := make([]s3KeyPair, 0, len(items))
	for i, item := range items {
		srcKey := normalizeKeyInput(item.SrcKey, preserveLeadingSlash)
		dstKey := normalizeKeyInput(item.DstKey, preserveLeadingSlash)
		if srcKey == "" || dstKey == "" {
			return fmt.Errorf("payload.items[%d].srcKey and payload.items[%d].dstKey are required", i, i)
		}
		if strings.Contains(srcKey, "*") || strings.Contains(dstKey, "*") {
			return fmt.Errorf("wildcards are not allowed in keys (items[%d])", i)
		}
		if srcBucket == dstBucket && srcKey == dstKey {
			return fmt.Errorf("source and destination must be different (items[%d])", i)
		}
		pairs = append(pairs, s3KeyPair{SrcKey: srcKey, DstKey: dstKey})
	}
	if len(pairs) == 0 {
		return errors.New("payload.items must contain at least one item")
	}

	m.trySetJobObjectsTotal(jobID, int64(len(pairs)))

	return m.runTransferBatch(ctx, profileID, jobID, srcBucket, dstBucket, pairs, "copyto", dryRun, preserveLeadingSlash)
}

func (m *Manager) runTransferMoveBatch(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferBatchPayload(payload)
	if err != nil {
		return err
	}
	srcBucket := parsed.SrcBucket
	dstBucket := parsed.DstBucket
	items := parsed.Items
	dryRun := parsed.DryRun

	srcBucket = strings.TrimSpace(srcBucket)
	dstBucket = strings.TrimSpace(dstBucket)
	if srcBucket == "" || dstBucket == "" {
		return errors.New("payload.srcBucket and payload.dstBucket are required")
	}
	if len(items) < 1 {
		return errors.New("payload.items is required")
	}

	pairs := make([]s3KeyPair, 0, len(items))
	for i, item := range items {
		srcKey := normalizeKeyInput(item.SrcKey, preserveLeadingSlash)
		dstKey := normalizeKeyInput(item.DstKey, preserveLeadingSlash)
		if srcKey == "" || dstKey == "" {
			return fmt.Errorf("payload.items[%d].srcKey and payload.items[%d].dstKey are required", i, i)
		}
		if strings.Contains(srcKey, "*") || strings.Contains(dstKey, "*") {
			return fmt.Errorf("wildcards are not allowed in keys (items[%d])", i)
		}
		if srcBucket == dstBucket && srcKey == dstKey {
			return fmt.Errorf("source and destination must be different (items[%d])", i)
		}
		pairs = append(pairs, s3KeyPair{SrcKey: srcKey, DstKey: dstKey})
	}
	if len(pairs) == 0 {
		return errors.New("payload.items must contain at least one item")
	}

	m.trySetJobObjectsTotal(jobID, int64(len(pairs)))

	return m.runTransferBatch(ctx, profileID, jobID, srcBucket, dstBucket, pairs, "moveto", dryRun, preserveLeadingSlash)
}

func (m *Manager) runTransferBatch(ctx context.Context, profileID, jobID, srcBucket, dstBucket string, pairs []s3KeyPair, op string, dryRun bool, preserveLeadingSlash bool) error {
	for _, pair := range pairs {
		if pair.SrcKey == "" || pair.DstKey == "" {
			continue
		}
		args := []string{
			op,
			rcloneRemoteObject(srcBucket, pair.SrcKey, preserveLeadingSlash),
			rcloneRemoteObject(dstBucket, pair.DstKey, preserveLeadingSlash),
		}
		if err := m.runRclone(ctx, profileID, jobID, args, runRcloneOptions{TrackProgress: false, DryRun: dryRun, ProgressMode: rcloneProgressTransfers}); err != nil {
			return err
		}
		m.incrementJobObjectsDone(jobID, 1)
	}
	return nil
}

func (m *Manager) runTransferCopyPrefix(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferCopyMovePrefixPayload(payload)
	if err != nil {
		return err
	}
	srcBucket := parsed.SrcBucket
	srcPrefix := parsed.SrcPrefix
	dstBucket := parsed.DstBucket
	dstPrefix := parsed.DstPrefix
	dryRun := parsed.DryRun
	include := parsed.Include
	exclude := parsed.Exclude

	srcBucket = strings.TrimSpace(srcBucket)
	srcPrefix = normalizeKeyInput(srcPrefix, preserveLeadingSlash)
	dstBucket = strings.TrimSpace(dstBucket)
	dstPrefix = normalizeKeyInput(dstPrefix, preserveLeadingSlash)

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
	if srcBucket == dstBucket {
		if dstPrefix == "" {
			// ok
		} else {
			if dstPrefix == srcPrefix {
				return errors.New("source and destination must be different")
			}
			if strings.HasPrefix(dstPrefix, srcPrefix) {
				return errors.New("destination prefix must not be under source prefix")
			}
		}
	}

	preflightCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	m.trySetJobTotalsFromS3Prefix(preflightCtx, profileID, jobID, srcBucket, srcPrefix, include, exclude, preserveLeadingSlash)
	cancel()

	src := rcloneRemoteDir(srcBucket, srcPrefix, preserveLeadingSlash)
	dst := rcloneRemoteDir(dstBucket, dstPrefix, preserveLeadingSlash)

	args := []string{"copy"}
	for _, pat := range include {
		if pat == "" {
			continue
		}
		args = append(args, "--include", pat)
	}
	for _, pat := range exclude {
		if pat == "" {
			continue
		}
		args = append(args, "--exclude", pat)
	}
	args = append(args, src, dst)

	return m.runRclone(ctx, profileID, jobID, args, runRcloneOptions{TrackProgress: true, DryRun: dryRun, ProgressMode: rcloneProgressTransfers})
}

func (m *Manager) runTransferMovePrefix(ctx context.Context, profileID, jobID string, payload map[string]any, preserveLeadingSlash bool) error {
	parsed, err := parseTransferCopyMovePrefixPayload(payload)
	if err != nil {
		return err
	}
	srcBucket := parsed.SrcBucket
	srcPrefix := parsed.SrcPrefix
	dstBucket := parsed.DstBucket
	dstPrefix := parsed.DstPrefix
	dryRun := parsed.DryRun
	include := parsed.Include
	exclude := parsed.Exclude

	srcBucket = strings.TrimSpace(srcBucket)
	srcPrefix = normalizeKeyInput(srcPrefix, preserveLeadingSlash)
	dstBucket = strings.TrimSpace(dstBucket)
	dstPrefix = normalizeKeyInput(dstPrefix, preserveLeadingSlash)

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
	if srcBucket == dstBucket {
		if dstPrefix == "" {
			// ok
		} else {
			if dstPrefix == srcPrefix {
				return errors.New("source and destination must be different")
			}
			if strings.HasPrefix(dstPrefix, srcPrefix) {
				return errors.New("destination prefix must not be under source prefix")
			}
		}
	}

	preflightCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	m.trySetJobTotalsFromS3Prefix(preflightCtx, profileID, jobID, srcBucket, srcPrefix, include, exclude, preserveLeadingSlash)
	cancel()

	src := rcloneRemoteDir(srcBucket, srcPrefix, preserveLeadingSlash)
	dst := rcloneRemoteDir(dstBucket, dstPrefix, preserveLeadingSlash)

	args := []string{"move"}
	for _, pat := range include {
		if pat == "" {
			continue
		}
		args = append(args, "--include", pat)
	}
	for _, pat := range exclude {
		if pat == "" {
			continue
		}
		args = append(args, "--exclude", pat)
	}
	args = append(args, src, dst)

	return m.runRclone(ctx, profileID, jobID, args, runRcloneOptions{TrackProgress: true, DryRun: dryRun, ProgressMode: rcloneProgressTransfers})
}

func (m *Manager) runRcloneSync(ctx context.Context, profileID, jobID, src, dst string, deleteExtraneous bool, include, exclude []string, dryRun bool, mode rcloneProgressMode) error {
	cmd := "copy"
	if deleteExtraneous {
		cmd = "sync"
	}
	args := []string{cmd}
	for _, pat := range include {
		if pat == "" {
			continue
		}
		args = append(args, "--include", pat)
	}
	for _, pat := range exclude {
		if pat == "" {
			continue
		}
		args = append(args, "--exclude", pat)
	}

	args = append(args, src, dst)
	return m.runRclone(ctx, profileID, jobID, args, runRcloneOptions{TrackProgress: true, DryRun: dryRun, ProgressMode: mode})
}
