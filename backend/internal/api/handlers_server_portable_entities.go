package api

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

type portableImportEntityVerification struct {
	results                 []models.ServerPortableImportEntityResult
	entityChecksumsVerified bool
	blockers                []string
}

func buildPortableImportEntityVerification(
	manifestEntities map[string]models.ServerMigrationEntityManifest,
	entityFiles map[string][]byte,
	dataDir string,
) portableImportEntityVerification {
	return buildPortableImportEntityVerificationWithOptions(manifestEntities, entityFiles, dataDir, store.PortableValidationOptions{})
}

func buildPortableImportEntityVerificationWithOptions(
	manifestEntities map[string]models.ServerMigrationEntityManifest,
	entityFiles map[string][]byte,
	dataDir string,
	opts store.PortableValidationOptions,
) portableImportEntityVerification {
	results := make([]models.ServerPortableImportEntityResult, 0, len(portableEntityOrder))
	entityChecksumsVerified := true
	blockers := make([]string, 0, len(portableEntityOrder))

	for _, name := range portableEntityOrder {
		manifestEntity, ok := manifestEntities[name]
		if !ok {
			if isOptionalPortableEntity(name) {
				continue
			}
			entityChecksumsVerified = false
			blockers = append(blockers, fmt.Sprintf("Portable manifest is missing entity summary for %s.", name))
			continue
		}
		data, ok := entityFiles[name]
		if !ok {
			entityChecksumsVerified = false
			blockers = append(blockers, fmt.Sprintf("Portable bundle is missing data/%s.jsonl.", name))
			results = append(results, models.ServerPortableImportEntityResult{
				Name:             name,
				ExportedCount:    manifestEntity.Count,
				ChecksumVerified: false,
			})
			continue
		}
		sum := sha256.Sum256(data)
		checksumVerified := strings.EqualFold(hex.EncodeToString(sum[:]), manifestEntity.SHA256)
		if !checksumVerified {
			entityChecksumsVerified = false
			blockers = append(blockers, fmt.Sprintf("Checksum mismatch for %s.", name))
		}
		actualCount, countErr := countPortableEntityRows(data)
		if countErr != nil {
			blockers = append(blockers, fmt.Sprintf("Portable bundle data/%s.jsonl is not valid JSONL: %v", name, countErr))
		} else if actualCount != manifestEntity.Count {
			blockers = append(blockers, fmt.Sprintf("Portable manifest count mismatch for %s: manifest has %d row(s), bundle has %d row(s).", name, manifestEntity.Count, actualCount))
		}
		results = append(results, models.ServerPortableImportEntityResult{
			Name:             name,
			ExportedCount:    manifestEntity.Count,
			ChecksumVerified: checksumVerified,
		})
	}
	if err := store.ValidatePortableEntityFilesWithOptions(dataDir, entityFiles, opts); err != nil {
		blockers = append(blockers, fmt.Sprintf("Portable bundle entity schema validation failed: %v", err))
	}

	return portableImportEntityVerification{
		results:                 results,
		entityChecksumsVerified: entityChecksumsVerified,
		blockers:                blockers,
	}
}

func isOptionalPortableEntity(name string) bool {
	return name == "object_index_replacements"
}

func countPortableEntityRows(data []byte) (int, error) {
	if len(bytes.TrimSpace(data)) == 0 {
		return 0, nil
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	count := 0
	for {
		var raw json.RawMessage
		if err := decoder.Decode(&raw); err != nil {
			if err == io.EOF {
				return count, nil
			}
			return 0, err
		}
		count++
	}
}

func applyPortableImportCounts(results []models.ServerPortableImportEntityResult, counts store.PortableImportCounts) []models.ServerPortableImportEntityResult {
	importedByName := map[string]int{
		"profiles":                   counts.Profiles,
		"profile_connection_options": counts.ProfileConnectionOptions,
		"jobs":                       counts.Jobs,
		"upload_sessions":            counts.UploadSessions,
		"upload_multipart_uploads":   counts.UploadMultipartUploads,
		"upload_objects":             counts.UploadObjects,
		"object_index":               counts.ObjectIndex,
		"object_index_replacements":  counts.ObjectIndexReplacements,
		"object_favorites":           counts.ObjectFavorites,
	}
	out := append([]models.ServerPortableImportEntityResult(nil), results...)
	for i := range out {
		out[i].ImportedCount = importedByName[out[i].Name]
	}
	return out
}

func verifyPortableImportCounts(results []models.ServerPortableImportEntityResult) bool {
	for _, item := range results {
		if item.ExportedCount != item.ImportedCount {
			return false
		}
		if !item.ChecksumVerified {
			return false
		}
	}
	return true
}
