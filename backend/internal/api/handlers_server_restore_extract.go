package api

import (
	"archive/tar"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

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

func extractServerRestoreArchiveEntry(
	tempRoot string,
	relativePath string,
	entryName string,
	header *tar.Header,
	entryReader io.Reader,
	payloadEntries *[]serverBackupPayloadEntry,
	entryLabel string,
) error {
	return extractServerRestoreArchiveEntryWithDiskCheck(
		tempRoot,
		relativePath,
		entryName,
		header,
		entryReader,
		payloadEntries,
		entryLabel,
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
