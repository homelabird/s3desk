package api

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"s3desk/internal/models"
)

type portableImportRecoveryRecord struct {
	Phase                 string                               `json:"phase"`
	CreatedAt             string                               `json:"createdAt"`
	RecoveryBundlePath    string                               `json:"recoveryBundlePath"`
	IncomingPayloadSHA256 string                               `json:"incomingPayloadSha256,omitempty"`
	PreparedAssetsDir     string                               `json:"preparedAssetsDir,omitempty"`
	Result                *models.ServerPortableImportResponse `json:"result,omitempty"`
}

type portableImportRecovery struct {
	dir    string
	record portableImportRecoveryRecord
}

func newPortableImportRecovery(dataDir, preparedAssetsDir string) (portableImportRecovery, error) {
	base := filepath.Join(dataDir, "import-recovery")
	if err := os.MkdirAll(base, 0o700); err != nil {
		return portableImportRecovery{}, err
	}
	dir, err := os.MkdirTemp(base, "import-*")
	if err != nil {
		return portableImportRecovery{}, err
	}
	return portableImportRecovery{dir: dir, record: portableImportRecoveryRecord{
		CreatedAt:          time.Now().UTC().Format(time.RFC3339Nano),
		RecoveryBundlePath: filepath.Join(dir, "before.tar.gz"),
		PreparedAssetsDir:  preparedAssetsDir,
	}}, nil
}

// Atomically replace a file-synced record, then sync its parent directories.
// An interrupted commit_unknown operation requires inspection.
func (recovery portableImportRecovery) save() error {
	file, err := os.CreateTemp(recovery.dir, ".operation-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	if err := json.NewEncoder(file).Encode(recovery.record); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Rename(file.Name(), filepath.Join(recovery.dir, "operation.json")); err != nil {
		return err
	}
	for _, path := range []string{recovery.dir, filepath.Dir(recovery.dir), filepath.Dir(filepath.Dir(recovery.dir))} {
		if err := syncPortableRecoveryPath(path); err != nil {
			return err
		}
	}
	return nil
}

func syncPortableRecoveryPath(path string) error {
	// #nosec G304 -- path is a server-created recovery file or its DATA_DIR parents.
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	return file.Sync()
}
