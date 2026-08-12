package jobs

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"s3desk/internal/db"
	"s3desk/internal/models"
	storepkg "s3desk/internal/store"
)

func TestEnsureLocalPathAllowedRejectsSymlinkComponentUnderAllowedRoot(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	realDir := filepath.Join(root, "real")
	if err := os.MkdirAll(realDir, 0o755); err != nil {
		t.Fatalf("mkdir real dir: %v", err)
	}
	link := filepath.Join(root, "link")
	if err := os.Symlink(realDir, link); err != nil {
		t.Skipf("symlink unsupported: %v", err)
	}

	m := &Manager{allowedLocalDirs: []string{root}}
	err := m.ensureLocalPathAllowed(link)
	if err == nil {
		t.Fatal("ensureLocalPathAllowed() error=nil, want symlink rejection")
	}
	if !strings.Contains(err.Error(), "symlinked local paths are not allowed") {
		t.Fatalf("error=%q, want symlink rejection", err.Error())
	}
}

func TestPrepareLocalDestinationRejectsSymlinkAncestorUnderAllowedRoot(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	realDir := filepath.Join(root, "real")
	if err := os.MkdirAll(realDir, 0o755); err != nil {
		t.Fatalf("mkdir real dir: %v", err)
	}
	link := filepath.Join(root, "link")
	if err := os.Symlink(realDir, link); err != nil {
		t.Skipf("symlink unsupported: %v", err)
	}

	m := &Manager{allowedLocalDirs: []string{root}}
	_, err := m.prepareLocalDestination(filepath.Join(link, "new-destination"))
	if err == nil {
		t.Fatal("prepareLocalDestination() error=nil, want symlink rejection")
	}
	if !strings.Contains(err.Error(), "symlinked local paths are not allowed") {
		t.Fatalf("error=%q, want symlink rejection", err.Error())
	}
}

func TestPrepareLocalDestinationCreatesNormalDirectory(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	dst := filepath.Join(root, "new-destination")
	m := &Manager{allowedLocalDirs: []string{root}}

	got, err := m.prepareLocalDestination(dst)
	if err != nil {
		t.Fatalf("prepareLocalDestination() error=%v, want nil", err)
	}
	if got != dst+string(os.PathSeparator) {
		t.Fatalf("prepareLocalDestination()=%q, want %q", got, dst+string(os.PathSeparator))
	}
	info, err := os.Stat(dst)
	if err != nil {
		t.Fatalf("stat destination: %v", err)
	}
	if !info.IsDir() {
		t.Fatalf("destination mode=%v, want directory", info.Mode())
	}
}

func TestRunTransferSyncS3ToLocalPinsDestinationForRclone(t *testing.T) {
	root := t.TempDir()
	dataDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dataDir, "logs", "jobs"), 0o700); err != nil {
		t.Fatalf("mkdir job logs: %v", err)
	}

	st, profile := newJobsPathTestStore(t)
	job, err := st.CreateJob(context.Background(), profile.ID, storepkg.CreateJobInput{
		Type:    JobTypeTransferSyncS3ToLocal,
		Payload: map[string]any{},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	var (
		rcloneArgs     []string
		extraFileCount int
	)
	restore := setProcessTestHooks(processTestHooks{
		ensureRcloneCompatible: func(context.Context) (string, string, error) {
			return "rclone", "rclone v1.66.0", nil
		},
		startRcloneCommand: func(context.Context, models.ProfileSecrets, string, []string) (*rcloneProcess, error) {
			return newTestRcloneProcess("[]", "", nil), nil
		},
		runRcloneAttempt: func(_ context.Context, _ string, args []string, _ string, opts TestRunRcloneAttemptOptions, _ func(string, string)) (string, error) {
			rcloneArgs = append([]string(nil), args...)
			extraFileCount = opts.ExtraFileCount
			return "", nil
		},
	})
	defer restore()

	manager := NewManager(Config{Store: st, DataDir: dataDir, AllowedLocalDirs: []string{root}})
	dst := filepath.Join(root, "dst")
	err = manager.runTransferSyncS3ToLocal(context.Background(), profile.ID, job.ID, map[string]any{
		"bucket":    "bucket",
		"prefix":    "prefix",
		"localPath": dst,
	}, false)
	if err != nil {
		t.Fatalf("runTransferSyncS3ToLocal() error=%v", err)
	}

	if extraFileCount != 1 {
		t.Fatalf("extraFileCount=%d, want 1", extraFileCount)
	}
	if len(rcloneArgs) == 0 {
		t.Fatal("rclone args were not captured")
	}
	gotDst := rcloneArgs[len(rcloneArgs)-1]
	if gotDst == dst+string(os.PathSeparator) {
		t.Fatalf("rclone destination=%q, want inherited fd path", gotDst)
	}
	if !strings.Contains(gotDst, "/fd/3") {
		t.Fatalf("rclone destination=%q, want fd 3 path", gotDst)
	}
}

func TestRunTransferSyncStagingToS3PinsSourceForRclone(t *testing.T) {
	dataDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dataDir, "logs", "jobs"), 0o700); err != nil {
		t.Fatalf("mkdir job logs: %v", err)
	}

	st, profile := newJobsPathTestStore(t)
	session, err := st.CreateUploadSession(
		context.Background(),
		profile.ID,
		"bucket",
		"prefix/",
		"staging",
		"pending",
		time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	stagingDir, err := storepkg.ResolveUploadStagingDir(dataDir, session.ID)
	if err != nil {
		t.Fatalf("resolve staging dir: %v", err)
	}
	if err := os.MkdirAll(stagingDir, 0o700); err != nil {
		t.Fatalf("mkdir staging dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(stagingDir, "alpha.txt"), []byte("alpha"), 0o600); err != nil {
		t.Fatalf("write staging file: %v", err)
	}
	if err := st.SetUploadSessionStagingDir(context.Background(), profile.ID, session.ID, stagingDir); err != nil {
		t.Fatalf("set staging dir: %v", err)
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	expectedSize := int64(5)
	if err := st.UpsertUploadObject(context.Background(), storepkg.UploadObject{
		UploadID:     session.ID,
		ProfileID:    profile.ID,
		Path:         "alpha.txt",
		Bucket:       "bucket",
		ObjectKey:    "prefix/alpha.txt",
		ExpectedSize: &expectedSize,
		CreatedAt:    now,
		UpdatedAt:    now,
	}); err != nil {
		t.Fatalf("upsert upload object: %v", err)
	}
	if err := st.UpsertMultipartUpload(context.Background(), storepkg.MultipartUpload{
		UploadID:   session.ID,
		ProfileID:  profile.ID,
		Path:       "alpha.txt",
		Bucket:     "bucket",
		ObjectKey:  "prefix/alpha.txt",
		S3UploadID: "stale-metadata",
		ChunkSize:  5,
		FileSize:   expectedSize,
		CreatedAt:  now,
		UpdatedAt:  now,
	}); err != nil {
		t.Fatalf("upsert multipart upload: %v", err)
	}
	job, err := st.CreateJob(context.Background(), profile.ID, storepkg.CreateJobInput{
		Type:    JobTypeTransferSyncStagingToS3,
		Payload: map[string]any{},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	var (
		rcloneArgs     []string
		extraFileCount int
	)
	restore := setProcessTestHooks(processTestHooks{
		ensureRcloneCompatible: func(context.Context) (string, string, error) {
			return "rclone", "rclone v1.66.0", nil
		},
		startRcloneCommand: func(context.Context, models.ProfileSecrets, string, []string) (*rcloneProcess, error) {
			return newTestRcloneProcess("[]", "", nil), nil
		},
		runRcloneAttempt: func(_ context.Context, _ string, args []string, _ string, opts TestRunRcloneAttemptOptions, _ func(string, string)) (string, error) {
			rcloneArgs = append([]string(nil), args...)
			extraFileCount = opts.ExtraFileCount
			return "", nil
		},
	})
	defer restore()

	manager := NewManager(Config{Store: st, DataDir: dataDir})
	err = manager.runTransferSyncStagingToS3(context.Background(), profile.ID, job.ID, map[string]any{
		"uploadId": session.ID,
	}, false)
	if err != nil {
		t.Fatalf("runTransferSyncStagingToS3() error=%v", err)
	}

	if extraFileCount != 1 {
		t.Fatalf("extraFileCount=%d, want 1", extraFileCount)
	}
	if len(rcloneArgs) < 2 {
		t.Fatalf("rclone args=%v, want source and destination", rcloneArgs)
	}
	gotSrc := rcloneArgs[len(rcloneArgs)-2]
	if gotSrc == stagingDir {
		t.Fatalf("rclone source=%q, want inherited fd path", gotSrc)
	}
	if !strings.Contains(gotSrc, "/fd/3") {
		t.Fatalf("rclone source=%q, want fd 3 path", gotSrc)
	}
	if _, ok, err := st.GetUploadSession(context.Background(), profile.ID, session.ID); err != nil || ok {
		t.Fatalf("upload session deleted=%v err=%v, want deleted", ok, err)
	}
	objects, err := st.ListUploadObjects(context.Background(), profile.ID, session.ID)
	if err != nil {
		t.Fatalf("list upload objects: %v", err)
	}
	if len(objects) != 0 {
		t.Fatalf("upload objects=%d, want 0", len(objects))
	}
	multipartUploads, err := st.ListMultipartUploads(context.Background(), profile.ID, session.ID)
	if err != nil {
		t.Fatalf("list multipart uploads: %v", err)
	}
	if len(multipartUploads) != 0 {
		t.Fatalf("multipart uploads=%d, want 0", len(multipartUploads))
	}
	if _, err := os.Stat(stagingDir); !os.IsNotExist(err) {
		t.Fatalf("staging dir still exists, err=%v", err)
	}
}

func TestRunTransferSyncStagingToS3RejectsSymlinkedStagingDir(t *testing.T) {
	dataDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dataDir, "logs", "jobs"), 0o700); err != nil {
		t.Fatalf("mkdir job logs: %v", err)
	}

	st, profile := newJobsPathTestStore(t)
	session, err := st.CreateUploadSession(
		context.Background(),
		profile.ID,
		"bucket",
		"prefix/",
		"staging",
		"pending",
		time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		t.Fatalf("create upload session: %v", err)
	}
	stagingRoot := storepkg.UploadStagingRoot(dataDir)
	if err := os.MkdirAll(stagingRoot, 0o700); err != nil {
		t.Fatalf("mkdir staging root: %v", err)
	}
	outside := t.TempDir()
	stagingDir, err := storepkg.ResolveUploadStagingDir(dataDir, session.ID)
	if err != nil {
		t.Fatalf("resolve staging dir: %v", err)
	}
	if err := os.Symlink(outside, stagingDir); err != nil {
		t.Skipf("symlink unsupported: %v", err)
	}
	if err := st.SetUploadSessionStagingDir(context.Background(), profile.ID, session.ID, stagingDir); err != nil {
		t.Fatalf("set staging dir: %v", err)
	}
	job, err := st.CreateJob(context.Background(), profile.ID, storepkg.CreateJobInput{
		Type:    JobTypeTransferSyncStagingToS3,
		Payload: map[string]any{},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	rcloneInvoked := false
	restore := setProcessTestHooks(processTestHooks{
		ensureRcloneCompatible: func(context.Context) (string, string, error) {
			return "rclone", "rclone v1.66.0", nil
		},
		startRcloneCommand: func(context.Context, models.ProfileSecrets, string, []string) (*rcloneProcess, error) {
			return newTestRcloneProcess("[]", "", nil), nil
		},
		runRcloneAttempt: func(context.Context, string, []string, string, TestRunRcloneAttemptOptions, func(string, string)) (string, error) {
			rcloneInvoked = true
			return "", nil
		},
	})
	defer restore()

	manager := NewManager(Config{Store: st, DataDir: dataDir})
	err = manager.runTransferSyncStagingToS3(context.Background(), profile.ID, job.ID, map[string]any{
		"uploadId": session.ID,
	}, false)
	if err == nil {
		t.Fatal("runTransferSyncStagingToS3() error=nil, want symlink rejection")
	}
	if rcloneInvoked {
		t.Fatal("rclone invoked for symlinked staging dir")
	}
	if !strings.Contains(err.Error(), "symlinked local paths are not allowed") {
		t.Fatalf("error=%q, want symlink rejection", err.Error())
	}
}

func TestRunTransferSyncLocalToS3PinsSourceForRclone(t *testing.T) {
	root := t.TempDir()
	src := filepath.Join(root, "src")
	if err := os.MkdirAll(src, 0o755); err != nil {
		t.Fatalf("mkdir source: %v", err)
	}
	if err := os.WriteFile(filepath.Join(src, "alpha.txt"), []byte("alpha"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	dataDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dataDir, "logs", "jobs"), 0o700); err != nil {
		t.Fatalf("mkdir job logs: %v", err)
	}

	st, profile := newJobsPathTestStore(t)
	job, err := st.CreateJob(context.Background(), profile.ID, storepkg.CreateJobInput{
		Type:    JobTypeTransferSyncLocalToS3,
		Payload: map[string]any{},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	var (
		rcloneArgs     []string
		extraFileCount int
	)
	restore := setProcessTestHooks(processTestHooks{
		ensureRcloneCompatible: func(context.Context) (string, string, error) {
			return "rclone", "rclone v1.66.0", nil
		},
		startRcloneCommand: func(context.Context, models.ProfileSecrets, string, []string) (*rcloneProcess, error) {
			return newTestRcloneProcess("[]", "", nil), nil
		},
		runRcloneAttempt: func(_ context.Context, _ string, args []string, _ string, opts TestRunRcloneAttemptOptions, _ func(string, string)) (string, error) {
			rcloneArgs = append([]string(nil), args...)
			extraFileCount = opts.ExtraFileCount
			return "", nil
		},
	})
	defer restore()

	manager := NewManager(Config{Store: st, DataDir: dataDir, AllowedLocalDirs: []string{root}})
	err = manager.runTransferSyncLocalToS3(context.Background(), profile.ID, job.ID, map[string]any{
		"bucket":    "bucket",
		"prefix":    "prefix",
		"localPath": src,
	}, false)
	if err != nil {
		t.Fatalf("runTransferSyncLocalToS3() error=%v", err)
	}

	if extraFileCount != 1 {
		t.Fatalf("extraFileCount=%d, want 1", extraFileCount)
	}
	if len(rcloneArgs) < 2 {
		t.Fatalf("rclone args=%v, want source and destination", rcloneArgs)
	}
	gotSrc := rcloneArgs[len(rcloneArgs)-2]
	if gotSrc == src {
		t.Fatalf("rclone source=%q, want inherited fd path", gotSrc)
	}
	if !strings.Contains(gotSrc, "/fd/3") {
		t.Fatalf("rclone source=%q, want fd 3 path", gotSrc)
	}
}

func newJobsPathTestStore(t *testing.T) (*storepkg.Store, models.Profile) {
	t.Helper()

	dataDir := t.TempDir()
	gormDB, err := db.Open(db.Config{
		Backend:    db.BackendSQLite,
		SQLitePath: filepath.Join(dataDir, "s3desk.db"),
	})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	sqlDB, err := gormDB.DB()
	if err != nil {
		t.Fatalf("open sql db: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	st, err := storepkg.New(gormDB, storepkg.Options{})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	endpoint := "http://localhost:9000"
	region := "us-east-1"
	accessKey := "access"
	secretKey := "secret"
	profile, err := st.CreateProfile(context.Background(), models.ProfileCreateRequest{
		Provider:              models.ProfileProviderS3Compatible,
		Name:                  "path-pin-test",
		Endpoint:              &endpoint,
		Region:                &region,
		AccessKeyID:           &accessKey,
		SecretAccessKey:       &secretKey,
		PreserveLeadingSlash:  false,
		TLSInsecureSkipVerify: false,
	})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}
	return st, profile
}
