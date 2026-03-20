package store

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"gorm.io/gorm"
)

type PortableEntityFile struct {
	Name   string
	Data   []byte
	Count  int
	SHA256 string
}

type PortableExportBundle struct {
	EntityFiles map[string]PortableEntityFile
}

type PortableImportCounts struct {
	Profiles                 int
	ProfileConnectionOptions int
	Jobs                     int
	UploadSessions           int
	UploadMultipartUploads   int
	UploadObjects            int
	ObjectIndex              int
	ObjectFavorites          int
}

func (s *Store) ExportPortableEntityFiles(ctx context.Context) (PortableExportBundle, error) {
	tx := s.db.WithContext(ctx)
	files := map[string]PortableEntityFile{}

	profiles, err := orderedRows[profileRow](tx, "id")
	if err != nil {
		return PortableExportBundle{}, err
	}
	files["profiles"] = marshalPortableEntityFile("profiles", profiles)

	profileConnectionOptions, err := orderedRows[profileConnectionOptionsRow](tx, "profile_id")
	if err != nil {
		return PortableExportBundle{}, err
	}
	files["profile_connection_options"] = marshalPortableEntityFile("profile_connection_options", profileConnectionOptions)

	jobsRows, err := orderedRows[jobRow](tx, "created_at, id")
	if err != nil {
		return PortableExportBundle{}, err
	}
	files["jobs"] = marshalPortableEntityFile("jobs", jobsRows)

	uploadSessions, err := orderedRows[uploadSessionRow](tx, "created_at, id")
	if err != nil {
		return PortableExportBundle{}, err
	}
	files["upload_sessions"] = marshalPortableEntityFile("upload_sessions", uploadSessions)

	uploadMultipartUploads, err := orderedRows[uploadMultipartRow](tx, "upload_id, path")
	if err != nil {
		return PortableExportBundle{}, err
	}
	files["upload_multipart_uploads"] = marshalPortableEntityFile("upload_multipart_uploads", uploadMultipartUploads)

	uploadObjects, err := orderedRows[uploadObjectRow](tx, "upload_id, path")
	if err != nil {
		return PortableExportBundle{}, err
	}
	files["upload_objects"] = marshalPortableEntityFile("upload_objects", uploadObjects)

	objectIndex, err := orderedRows[objectIndexRow](tx, "profile_id, bucket, object_key")
	if err != nil {
		return PortableExportBundle{}, err
	}
	files["object_index"] = marshalPortableEntityFile("object_index", objectIndex)

	objectFavorites, err := orderedRows[objectFavoriteRow](tx, "profile_id, bucket, object_key")
	if err != nil {
		return PortableExportBundle{}, err
	}
	files["object_favorites"] = marshalPortableEntityFile("object_favorites", objectFavorites)

	return PortableExportBundle{EntityFiles: files}, nil
}

func (s *Store) ImportPortableEntityFilesReplace(ctx context.Context, entityFiles map[string][]byte, dataDir string) (PortableImportCounts, error) {
	var counts PortableImportCounts

	profiles, err := parsePortableRows[profileRow](entityFiles["profiles"])
	if err != nil {
		return PortableImportCounts{}, fmt.Errorf("parse profiles: %w", err)
	}
	profileConnectionOptions, err := parsePortableRows[profileConnectionOptionsRow](entityFiles["profile_connection_options"])
	if err != nil {
		return PortableImportCounts{}, fmt.Errorf("parse profile_connection_options: %w", err)
	}
	jobsRows, err := parsePortableRows[jobRow](entityFiles["jobs"])
	if err != nil {
		return PortableImportCounts{}, fmt.Errorf("parse jobs: %w", err)
	}
	uploadSessions, err := parsePortableRows[uploadSessionRow](entityFiles["upload_sessions"])
	if err != nil {
		return PortableImportCounts{}, fmt.Errorf("parse upload_sessions: %w", err)
	}
	uploadSessions, err = normalizePortableUploadSessions(dataDir, uploadSessions)
	if err != nil {
		return PortableImportCounts{}, fmt.Errorf("normalize upload_sessions: %w", err)
	}
	uploadMultipartUploads, err := parsePortableRows[uploadMultipartRow](entityFiles["upload_multipart_uploads"])
	if err != nil {
		return PortableImportCounts{}, fmt.Errorf("parse upload_multipart_uploads: %w", err)
	}
	uploadObjects, err := parsePortableRows[uploadObjectRow](entityFiles["upload_objects"])
	if err != nil {
		return PortableImportCounts{}, fmt.Errorf("parse upload_objects: %w", err)
	}
	objectIndex, err := parsePortableRows[objectIndexRow](entityFiles["object_index"])
	if err != nil {
		return PortableImportCounts{}, fmt.Errorf("parse object_index: %w", err)
	}
	objectFavorites, err := parsePortableRows[objectFavoriteRow](entityFiles["object_favorites"])
	if err != nil {
		return PortableImportCounts{}, fmt.Errorf("parse object_favorites: %w", err)
	}

	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		deleteTables := []any{
			&objectFavoriteRow{},
			&objectIndexRow{},
			&uploadObjectRow{},
			&uploadMultipartRow{},
			&uploadSessionRow{},
			&jobRow{},
			&profileConnectionOptionsRow{},
			&profileRow{},
		}
		for _, table := range deleteTables {
			if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(table).Error; err != nil {
				return err
			}
		}

		if len(profiles) > 0 {
			if err := tx.CreateInBatches(profiles, 100).Error; err != nil {
				return err
			}
			counts.Profiles = len(profiles)
		}
		if len(profileConnectionOptions) > 0 {
			if err := tx.CreateInBatches(profileConnectionOptions, 100).Error; err != nil {
				return err
			}
			counts.ProfileConnectionOptions = len(profileConnectionOptions)
		}
		if len(jobsRows) > 0 {
			if err := tx.CreateInBatches(jobsRows, 100).Error; err != nil {
				return err
			}
			counts.Jobs = len(jobsRows)
		}
		if len(uploadSessions) > 0 {
			if err := tx.CreateInBatches(uploadSessions, 100).Error; err != nil {
				return err
			}
			counts.UploadSessions = len(uploadSessions)
		}
		if len(uploadMultipartUploads) > 0 {
			if err := tx.CreateInBatches(uploadMultipartUploads, 100).Error; err != nil {
				return err
			}
			counts.UploadMultipartUploads = len(uploadMultipartUploads)
		}
		if len(uploadObjects) > 0 {
			if err := tx.CreateInBatches(uploadObjects, 100).Error; err != nil {
				return err
			}
			counts.UploadObjects = len(uploadObjects)
		}
		if len(objectIndex) > 0 {
			if err := tx.CreateInBatches(objectIndex, 250).Error; err != nil {
				return err
			}
			counts.ObjectIndex = len(objectIndex)
		}
		if len(objectFavorites) > 0 {
			if err := tx.CreateInBatches(objectFavorites, 250).Error; err != nil {
				return err
			}
			counts.ObjectFavorites = len(objectFavorites)
		}
		return nil
	})
	if err != nil {
		return PortableImportCounts{}, err
	}

	return counts, nil
}

func normalizePortableUploadSessions(dataDir string, rows []uploadSessionRow) ([]uploadSessionRow, error) {
	normalized := append([]uploadSessionRow(nil), rows...)
	for i := range normalized {
		mode := strings.TrimSpace(strings.ToLower(normalized[i].Mode))
		switch mode {
		case "direct", "presigned":
			normalized[i].StagingDir = ""
		default:
			stagingDir, err := ResolveUploadStagingDir(dataDir, normalized[i].ID)
			if err != nil {
				return nil, fmt.Errorf("session %q: %w", normalized[i].ID, err)
			}
			normalized[i].StagingDir = stagingDir
		}
	}
	return normalized, nil
}

func orderedRows[T any](tx *gorm.DB, order string) ([]T, error) {
	var rows []T
	if err := tx.Order(order).Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func marshalPortableEntityFile[T any](name string, rows []T) PortableEntityFile {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	for _, row := range rows {
		_ = enc.Encode(row)
	}
	sum := sha256.Sum256(buf.Bytes())
	return PortableEntityFile{
		Name:   name,
		Data:   buf.Bytes(),
		Count:  len(rows),
		SHA256: hex.EncodeToString(sum[:]),
	}
}

func parsePortableRows[T any](data []byte) ([]T, error) {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 {
		return []T{}, nil
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	rows := make([]T, 0, 16)
	for {
		var row T
		if err := decoder.Decode(&row); err != nil {
			if err == io.EOF {
				break
			}
			return nil, err
		}
		rows = append(rows, row)
	}
	return rows, nil
}
