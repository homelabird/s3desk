package jobs

import (
	"context"
	cryptorand "crypto/rand"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
	"s3desk/internal/rcloneerrors"
)

func connectivityDetailsBase(profile models.ProfileSecrets) map[string]any {
	details := map[string]any{"provider": profile.Provider}
	if rcloneconfig.IsS3LikeProvider(profile.Provider) {
		storageType, storageSource := detectStorageType(profile.Endpoint, nil)
		if storageType != "" {
			details["storageType"] = storageType
		}
		if storageSource != "" {
			details["storageTypeSource"] = storageSource
		}
	}
	return details
}

func addNormalizedErrorDetails(details map[string]any, err error, stderr string) {
	msg := strings.TrimSpace(stderr)
	if msg == "" && err != nil {
		msg = err.Error()
	}
	if msg != "" {
		details["error"] = msg
	}
	cls := rcloneerrors.Classify(err, stderr)
	details["normalizedError"] = map[string]any{
		"code":      string(cls.Code),
		"retryable": cls.Retryable,
	}
}

func benchmarkFailureResponse(profile models.ProfileSecrets, message string, err error, stderr string) models.ProfileBenchmarkResponse {
	details := connectivityDetailsBase(profile)
	if err != nil || strings.TrimSpace(stderr) != "" {
		addNormalizedErrorDetails(details, err, stderr)
	}
	return models.ProfileBenchmarkResponse{
		OK:      false,
		Message: message,
		Details: details,
	}
}

func (m *Manager) TestConnectivity(ctx context.Context, profileID string) (ok bool, details map[string]any, err error) {
	profileSecrets, found, err := m.store.GetProfileSecrets(ctx, profileID)
	if err != nil {
		return false, nil, err
	}
	if !found {
		return false, nil, ErrProfileNotFound
	}

	callCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	configID := fmt.Sprintf("profile-test-%s-%d", profileID, time.Now().UnixNano())
	proc, err := m.startRcloneCommand(callCtx, profileSecrets, configID, []string{"lsjson", "--dirs-only", rcloneRemoteBucket("")})
	if err != nil {
		return false, nil, err
	}

	bucketCount := 0
	listErr := decodeRcloneList(proc.stdout, func(entry rcloneListEntry) error {
		if entry.IsDir || entry.IsBucket {
			bucketCount++
		}
		return nil
	})
	waitErr := proc.wait()

	details = connectivityDetailsBase(profileSecrets)

	if listErr != nil {
		if waitErr != nil {
			addNormalizedErrorDetails(details, waitErr, proc.stderr.String())
			return false, details, nil
		}
		addNormalizedErrorDetails(details, listErr, proc.stderr.String())
		return false, details, nil
	}
	if waitErr != nil {
		addNormalizedErrorDetails(details, waitErr, proc.stderr.String())
		return false, details, nil
	}
	details["buckets"] = bucketCount
	return true, details, nil
}

// TestS3Connectivity is kept for backwards compatibility.
func (m *Manager) TestS3Connectivity(ctx context.Context, profileID string) (ok bool, details map[string]any, err error) {
	return m.TestConnectivity(ctx, profileID)
}

// BenchmarkConnectivity uploads a small test file, downloads it back, then deletes it,
// returning upload/download throughput so users can gauge their connection speed.
func (m *Manager) BenchmarkConnectivity(ctx context.Context, profileID string) (models.ProfileBenchmarkResponse, error) {
	const benchFileSize = 1 << 20 // 1 MiB
	profileSecrets, found, err := m.store.GetProfileSecrets(ctx, profileID)
	if err != nil {
		return models.ProfileBenchmarkResponse{}, err
	}
	if !found {
		return models.ProfileBenchmarkResponse{}, ErrProfileNotFound
	}

	// List buckets so we can pick the first one available.
	listCtx, listCancel := context.WithTimeout(ctx, 10*time.Second)
	defer listCancel()
	configID := fmt.Sprintf("profile-bench-%s-%d", profileID, time.Now().UnixNano())
	listProc, err := m.startRcloneCommand(listCtx, profileSecrets, configID, []string{"lsjson", "--dirs-only", rcloneRemoteBucket("")})
	if err != nil {
		if isTransferEngineError(err) {
			return models.ProfileBenchmarkResponse{}, err
		}
		return benchmarkFailureResponse(profileSecrets, "failed to list buckets: "+err.Error(), err, ""), nil
	}
	var firstBucket string
	listErr := decodeRcloneList(listProc.stdout, func(entry rcloneListEntry) error {
		if firstBucket == "" && (entry.IsDir || entry.IsBucket) {
			name := strings.TrimSpace(entry.Name)
			if name == "" {
				name = strings.TrimSpace(strings.TrimSuffix(entry.Path, "/"))
			}
			firstBucket = name
		}
		return nil
	})
	waitErr := listProc.wait()
	if listErr != nil {
		if waitErr != nil {
			msg := strings.TrimSpace(listProc.stderr.String())
			if msg == "" {
				msg = waitErr.Error()
			}
			return benchmarkFailureResponse(profileSecrets, "failed to list buckets: "+msg, waitErr, listProc.stderr.String()), nil
		}
		return benchmarkFailureResponse(profileSecrets, "failed to list buckets: "+listErr.Error(), listErr, listProc.stderr.String()), nil
	}
	if waitErr != nil {
		msg := strings.TrimSpace(listProc.stderr.String())
		if msg == "" {
			msg = waitErr.Error()
		}
		return benchmarkFailureResponse(profileSecrets, "failed to list buckets: "+msg, waitErr, listProc.stderr.String()), nil
	}
	if firstBucket == "" {
		resp := benchmarkFailureResponse(profileSecrets, "no buckets found; create a bucket first", nil, "")
		resp.Details["buckets"] = 0
		return resp, nil
	}

	// Write a temporary 1 MiB file filled with random data.
	tmpFile, err := os.CreateTemp("", "s3desk-bench-*.bin")
	if err != nil {
		return models.ProfileBenchmarkResponse{}, fmt.Errorf("create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	if _, err := io.CopyN(tmpFile, cryptorand.Reader, benchFileSize); err != nil {
		if closeErr := tmpFile.Close(); closeErr != nil {
			return models.ProfileBenchmarkResponse{}, fmt.Errorf("write temp file: %w (close temp file: %v)", err, closeErr)
		}
		return models.ProfileBenchmarkResponse{}, fmt.Errorf("write temp file: %w", err)
	}
	if err := tmpFile.Close(); err != nil {
		return models.ProfileBenchmarkResponse{}, fmt.Errorf("close temp file: %w", err)
	}

	benchKey := fmt.Sprintf(".s3desk-benchmark-%d.bin", time.Now().UnixNano())
	remoteObj := rcloneRemoteObject(firstBucket, benchKey, false)

	// --- upload ---
	uploadCtx, uploadCancel := context.WithTimeout(ctx, 60*time.Second)
	defer uploadCancel()
	uploadConfigID := fmt.Sprintf("profile-bench-up-%s-%d", profileID, time.Now().UnixNano())
	uploadStart := time.Now()
	upProc, err := m.startRcloneCommand(uploadCtx, profileSecrets, uploadConfigID, []string{"copyto", tmpPath, remoteObj})
	if err != nil {
		if isTransferEngineError(err) {
			return models.ProfileBenchmarkResponse{}, err
		}
		return benchmarkFailureResponse(profileSecrets, "upload failed: "+err.Error(), err, ""), nil
	}
	_, _ = io.Copy(io.Discard, upProc.stdout)
	if err := upProc.wait(); err != nil {
		msg := strings.TrimSpace(upProc.stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return benchmarkFailureResponse(profileSecrets, "upload failed: "+msg, err, upProc.stderr.String()), nil
	}
	uploadMs := time.Since(uploadStart).Milliseconds()
	var uploadBps int64
	if uploadMs > 0 {
		uploadBps = benchFileSize * 8 * 1000 / uploadMs
	}

	// --- download ---
	dlCtx, dlCancel := context.WithTimeout(ctx, 60*time.Second)
	defer dlCancel()
	dlConfigID := fmt.Sprintf("profile-bench-dl-%s-%d", profileID, time.Now().UnixNano())
	dlStart := time.Now()
	dlProc, err := m.startRcloneCommand(dlCtx, profileSecrets, dlConfigID, []string{"cat", remoteObj})
	if err != nil {
		if isTransferEngineError(err) {
			return models.ProfileBenchmarkResponse{}, err
		}
		return benchmarkFailureResponse(profileSecrets, "download failed: "+err.Error(), err, ""), nil
	}
	dlBytes, _ := io.Copy(io.Discard, dlProc.stdout)
	if err := dlProc.wait(); err != nil {
		msg := strings.TrimSpace(dlProc.stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return benchmarkFailureResponse(profileSecrets, "download failed: "+msg, err, dlProc.stderr.String()), nil
	}
	downloadMs := time.Since(dlStart).Milliseconds()
	var downloadBps int64
	if downloadMs > 0 {
		downloadBps = dlBytes * 8 * 1000 / downloadMs
	}

	// --- cleanup ---
	cleanCtx, cleanCancel := context.WithTimeout(ctx, 15*time.Second)
	defer cleanCancel()
	cleanConfigID := fmt.Sprintf("profile-bench-rm-%s-%d", profileID, time.Now().UnixNano())
	cleanProc, err := m.startRcloneCommand(cleanCtx, profileSecrets, cleanConfigID, []string{"deletefile", remoteObj})
	cleanedUp := false
	if err == nil {
		_, _ = io.Copy(io.Discard, cleanProc.stdout)
		if err := cleanProc.wait(); err == nil {
			cleanedUp = true
		}
	}

	fileSize := int64(benchFileSize)
	return models.ProfileBenchmarkResponse{
		OK:            true,
		Message:       "ok",
		Details:       connectivityDetailsBase(profileSecrets),
		UploadBps:     &uploadBps,
		DownloadBps:   &downloadBps,
		UploadMs:      &uploadMs,
		DownloadMs:    &downloadMs,
		FileSizeBytes: &fileSize,
		CleanedUp:     cleanedUp,
	}, nil
}
