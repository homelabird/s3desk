package api

import (
	"crypto/hmac"
	"fmt"
	"strings"

	"s3desk/internal/models"
)

type serverRestorePayloadVerification struct {
	ChecksumPresent   bool
	ChecksumVerified  bool
	SignaturePresent  bool
	SignatureVerified bool
}

func verifyServerRestorePayload(
	subject string,
	manifest models.ServerMigrationManifest,
	archiveManifest serverBackupArchiveManifest,
	payloadEntries []serverBackupPayloadEntry,
	backupPassword string,
	encryptionKey string,
) (serverRestorePayloadVerification, error) {
	var verification serverRestorePayloadVerification

	if manifest.PayloadSHA256 != "" {
		verification.ChecksumPresent = true
		fileCount, payloadBytes, payloadSHA256 := buildServerBackupPayloadSummary(payloadEntries)
		switch {
		case manifest.PayloadFileCount != 0 && manifest.PayloadFileCount != fileCount:
			return verification, fmt.Errorf("%s payload file count mismatch: manifest=%d extracted=%d", subject, manifest.PayloadFileCount, fileCount)
		case manifest.PayloadBytes != 0 && manifest.PayloadBytes != payloadBytes:
			return verification, fmt.Errorf("%s payload bytes mismatch: manifest=%d extracted=%d", subject, manifest.PayloadBytes, payloadBytes)
		case !strings.EqualFold(manifest.PayloadSHA256, payloadSHA256):
			return verification, fmt.Errorf("%s payload checksum mismatch: manifest=%s extracted=%s", subject, manifest.PayloadSHA256, payloadSHA256)
		}
		verification.ChecksumVerified = true
	}

	if archiveManifest.PayloadHMACSHA256 != "" {
		verification.SignaturePresent = true
		secrets := resolveServerBackupArchiveSecrets(manifest, backupPassword, encryptionKey)
		expectedHMAC := buildServerBackupPayloadHMAC(manifest, secrets.HMACSecret, archiveManifest.PayloadEncryptionIV)
		if expectedHMAC != "" && !hmac.Equal([]byte(strings.ToLower(strings.TrimSpace(archiveManifest.PayloadHMACSHA256))), []byte(expectedHMAC)) {
			return verification, fmt.Errorf("%s payload signature mismatch", subject)
		}
		if expectedHMAC != "" {
			verification.SignatureVerified = true
		}
	}

	return verification, nil
}
