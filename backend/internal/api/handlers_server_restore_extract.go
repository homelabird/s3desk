package api

import (
	"archive/tar"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

type serverRestoreExtractLimitError struct {
	Path          string
	RequiredBytes int64
	MaxBytes      int64
}

func (e serverRestoreExtractLimitError) Error() string {
	return fmt.Sprintf("restore extracted payload limit exceeded for %q: need %d bytes, max %d bytes", e.Path, e.RequiredBytes, e.MaxBytes)
}

type serverRestoreExtractBudget struct {
	maxBytes  int64
	usedBytes int64
}

func newServerRestoreExtractBudget(maxBytes int64) *serverRestoreExtractBudget {
	if maxBytes <= 0 {
		return nil
	}
	return &serverRestoreExtractBudget{maxBytes: maxBytes}
}

func (b *serverRestoreExtractBudget) Reserve(path string, size int64) error {
	if b == nil || b.maxBytes <= 0 || size <= 0 {
		return nil
	}
	if size > b.maxBytes-b.usedBytes {
		return serverRestoreExtractLimitError{
			Path:          path,
			RequiredBytes: b.usedBytes + size,
			MaxBytes:      b.maxBytes,
		}
	}
	b.usedBytes += size
	return nil
}

func ensureServerRestoreDiskSpace(root string, path string, requiredBytes int64) error {
	if requiredBytes <= 0 {
		return nil
	}
	freeBytes, err := availableDiskBytes(root)
	if err != nil {
		return err
	}
	if requiredBytes > freeBytes {
		return serverRestorePreflightError{
			Path:           path,
			RequiredBytes:  requiredBytes,
			AvailableBytes: freeBytes,
		}
	}
	return nil
}

func extractServerRestoreArchiveEntryWithBudget(
	tempRoot string,
	relativePath string,
	entryName string,
	header *tar.Header,
	entryReader io.Reader,
	payloadEntries *[]serverBackupPayloadEntry,
	entryLabel string,
	extractBudget *serverRestoreExtractBudget,
) error {
	return extractServerRestoreArchiveEntryWithBudgetAndDiskCheck(
		tempRoot,
		relativePath,
		entryName,
		header,
		entryReader,
		payloadEntries,
		entryLabel,
		extractBudget,
		ensureServerRestoreDiskSpace,
	)
}

func extractServerRestoreArchiveEntryWithDiskCheck(
	tempRoot string,
	relativePath string,
	entryName string,
	header *tar.Header,
	entryReader io.Reader,
	payloadEntries *[]serverBackupPayloadEntry,
	entryLabel string,
	ensureDiskSpace func(root string, path string, requiredBytes int64) error,
) error {
	return extractServerRestoreArchiveEntryWithBudgetAndDiskCheck(
		tempRoot,
		relativePath,
		entryName,
		header,
		entryReader,
		payloadEntries,
		entryLabel,
		nil,
		ensureDiskSpace,
	)
}

func extractServerRestoreArchiveEntryWithBudgetAndDiskCheck(
	tempRoot string,
	relativePath string,
	entryName string,
	header *tar.Header,
	entryReader io.Reader,
	payloadEntries *[]serverBackupPayloadEntry,
	entryLabel string,
	extractBudget *serverRestoreExtractBudget,
	ensureDiskSpace func(root string, path string, requiredBytes int64) error,
) error {
	targetPath, err := resolveRestorePath(tempRoot, relativePath)
	if err != nil {
		return err
	}
	switch header.Typeflag {
	case tar.TypeDir:
		return os.MkdirAll(targetPath, 0o700)
	case tar.TypeSymlink, tar.TypeLink:
		return fmt.Errorf("%s %q uses an unsupported link type", entryLabel, header.Name)
	default:
		if !header.FileInfo().Mode().IsRegular() {
			return fmt.Errorf("%s %q uses unsupported type %d", entryLabel, header.Name, header.Typeflag)
		}
		if err := extractBudget.Reserve(relativePath, header.Size); err != nil {
			return err
		}
		if err := ensureDiskSpace(tempRoot, relativePath, header.Size); err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(targetPath), 0o700); err != nil {
			return err
		}
		fileMode, err := archiveEntryFileMode(header.Mode)
		if err != nil {
			return err
		}
		// #nosec G304 -- targetPath is confined to tempRoot by resolveRestorePath.
		out, err := os.OpenFile(targetPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, fileMode)
		if err != nil {
			return err
		}
		defer out.Close()
		hasher := sha256.New()
		if _, err := io.Copy(io.MultiWriter(out, hasher), entryReader); err != nil {
			return err
		}
		*payloadEntries = append(*payloadEntries, serverBackupPayloadEntry{
			ArchivePath: entryName,
			Size:        header.Size,
			SHA256:      hex.EncodeToString(hasher.Sum(nil)),
		})
		return nil
	}
}

func writeServerRestoreExtractLimitError(w http.ResponseWriter, code, message string, err serverRestoreExtractLimitError) {
	writeError(w, http.StatusRequestEntityTooLarge, code, message, map[string]any{
		"error":         err.Error(),
		"path":          err.Path,
		"requiredBytes": err.RequiredBytes,
		"maxBytes":      err.MaxBytes,
	})
}

func asServerRestoreExtractLimitError(err error) (serverRestoreExtractLimitError, bool) {
	var limitErr serverRestoreExtractLimitError
	if errors.As(err, &limitErr) {
		return limitErr, true
	}
	return serverRestoreExtractLimitError{}, false
}
