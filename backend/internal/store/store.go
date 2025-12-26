package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"

	"object-storage/internal/db"
	"object-storage/internal/models"
)

type Store struct {
	db      *sql.DB
	crypto  *profileCrypto
	backend db.Backend
}

type Options struct {
	EncryptionKey string
	Backend       db.Backend
}

func New(sqlDB *sql.DB, opts Options) (*Store, error) {
	pc, err := newProfileCrypto(opts.EncryptionKey)
	if err != nil {
		return nil, err
	}
	backend := opts.Backend
	if backend == "" {
		backend = db.BackendSQLite
	}
	return &Store{db: sqlDB, crypto: pc, backend: backend}, nil
}

func (s *Store) CreateProfile(ctx context.Context, req models.ProfileCreateRequest) (models.Profile, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	id := ulid.Make().String()

	accessKeyID := req.AccessKeyID
	secretAccessKey := req.SecretAccessKey
	var sessionToken *string
	if req.SessionToken != nil {
		v := strings.TrimSpace(*req.SessionToken)
		if v != "" {
			sessionToken = &v
		}
	}

	if s.crypto != nil {
		var err error
		accessKeyID, err = s.crypto.encryptString(accessKeyID)
		if err != nil {
			return models.Profile{}, err
		}
		secretAccessKey, err = s.crypto.encryptString(secretAccessKey)
		if err != nil {
			return models.Profile{}, err
		}
		if sessionToken != nil {
			enc, err := s.crypto.encryptString(*sessionToken)
			if err != nil {
				return models.Profile{}, err
			}
			*sessionToken = enc
		}
	}

	_, err := s.exec(ctx, `
		INSERT INTO profiles (
			id, name, endpoint, region, force_path_style, tls_insecure_skip_verify,
			access_key_id, secret_access_key, session_token, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		id, req.Name, req.Endpoint, req.Region, boolToInt(req.ForcePathStyle), boolToInt(req.TLSInsecureSkipVerify),
		accessKeyID, secretAccessKey, nullableString(sessionToken), now, now,
	)
	if err != nil {
		return models.Profile{}, err
	}

	return models.Profile{
		ID:                    id,
		Name:                  req.Name,
		Endpoint:              req.Endpoint,
		Region:                req.Region,
		ForcePathStyle:        req.ForcePathStyle,
		TLSInsecureSkipVerify: req.TLSInsecureSkipVerify,
		CreatedAt:             now,
		UpdatedAt:             now,
	}, nil
}

func (s *Store) EnsureProfilesEncrypted(ctx context.Context) (updated int, err error) {
	if s.crypto == nil {
		return 0, nil
	}

	rows, err := s.query(ctx, `SELECT id, access_key_id, secret_access_key, session_token FROM profiles`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	type row struct {
		id      string
		ak      string
		sk      string
		session sql.NullString
	}
	profiles := make([]row, 0)

	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.ak, &r.sk, &r.session); err != nil {
			return updated, err
		}
		profiles = append(profiles, r)
	}
	if err := rows.Err(); err != nil {
		return updated, err
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	for _, p := range profiles {
		ak := p.ak
		sk := p.sk
		session := p.session

		needsUpdate := false

		if !strings.HasPrefix(ak, encryptedPrefix) {
			enc, err := s.crypto.encryptString(ak)
			if err != nil {
				return updated, err
			}
			ak = enc
			needsUpdate = true
		}
		if !strings.HasPrefix(sk, encryptedPrefix) {
			enc, err := s.crypto.encryptString(sk)
			if err != nil {
				return updated, err
			}
			sk = enc
			needsUpdate = true
		}
		if session.Valid && session.String != "" && !strings.HasPrefix(session.String, encryptedPrefix) {
			enc, err := s.crypto.encryptString(session.String)
			if err != nil {
				return updated, err
			}
			session.String = enc
			needsUpdate = true
		}

		if !needsUpdate {
			continue
		}
		var sessionPtr *string
		if session.Valid {
			sessionPtr = &session.String
		}
		if _, err := s.exec(ctx, `
			UPDATE profiles
			SET access_key_id=?, secret_access_key=?, session_token=?, updated_at=?
			WHERE id=?
		`, ak, sk, nullableString(sessionPtr), now, p.id); err != nil {
			return updated, err
		}
		updated++
	}

	return updated, nil
}

func (s *Store) ListProfiles(ctx context.Context) ([]models.Profile, error) {
	rows, err := s.query(ctx, `
		SELECT id, name, endpoint, region, force_path_style, tls_insecure_skip_verify, created_at, updated_at
		FROM profiles
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]models.Profile, 0)
	for rows.Next() {
		var (
			profile models.Profile
			force   int
			tls     int
		)
		if err := rows.Scan(
			&profile.ID,
			&profile.Name,
			&profile.Endpoint,
			&profile.Region,
			&force,
			&tls,
			&profile.CreatedAt,
			&profile.UpdatedAt,
		); err != nil {
			return nil, err
		}
		profile.ForcePathStyle = force != 0
		profile.TLSInsecureSkipVerify = tls != 0
		out = append(out, profile)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *Store) GetProfile(ctx context.Context, profileID string) (models.Profile, bool, error) {
	var (
		profile models.Profile
		force   int
		tls     int
	)
	err := s.queryRow(ctx, `
		SELECT id, name, endpoint, region, force_path_style, tls_insecure_skip_verify, created_at, updated_at
		FROM profiles
		WHERE id = ?
	`, profileID).Scan(
		&profile.ID,
		&profile.Name,
		&profile.Endpoint,
		&profile.Region,
		&force,
		&tls,
		&profile.CreatedAt,
		&profile.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.Profile{}, false, nil
		}
		return models.Profile{}, false, err
	}
	profile.ForcePathStyle = force != 0
	profile.TLSInsecureSkipVerify = tls != 0
	return profile, true, nil
}

func (s *Store) GetProfileSecrets(ctx context.Context, profileID string) (models.ProfileSecrets, bool, error) {
	var (
		profile models.ProfileSecrets
		session sql.NullString
		force   int
		tls     int
	)
	err := s.queryRow(ctx, `
		SELECT id, name, endpoint, region, force_path_style, tls_insecure_skip_verify,
		       access_key_id, secret_access_key, session_token
		FROM profiles
		WHERE id = ?
	`, profileID).Scan(
		&profile.ID,
		&profile.Name,
		&profile.Endpoint,
		&profile.Region,
		&force,
		&tls,
		&profile.AccessKeyID,
		&profile.SecretAccessKey,
		&session,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.ProfileSecrets{}, false, nil
		}
		return models.ProfileSecrets{}, false, err
	}
	profile.ForcePathStyle = force != 0
	profile.TLSInsecureSkipVerify = tls != 0

	if strings.HasPrefix(profile.AccessKeyID, encryptedPrefix) || strings.HasPrefix(profile.SecretAccessKey, encryptedPrefix) || (session.Valid && strings.HasPrefix(session.String, encryptedPrefix)) {
		if s.crypto == nil {
			return models.ProfileSecrets{}, false, ErrEncryptedCredentials
		}
		var err error
		profile.AccessKeyID, err = s.crypto.decryptString(profile.AccessKeyID)
		if err != nil {
			return models.ProfileSecrets{}, false, err
		}
		profile.SecretAccessKey, err = s.crypto.decryptString(profile.SecretAccessKey)
		if err != nil {
			return models.ProfileSecrets{}, false, err
		}
		if session.Valid {
			session.String, err = s.crypto.decryptString(session.String)
			if err != nil {
				return models.ProfileSecrets{}, false, err
			}
		}
	}

	if session.Valid {
		profile.SessionToken = &session.String
	}

	tlsCfg, updatedAt, found, err := s.GetProfileTLSConfig(ctx, profileID)
	if err != nil {
		return models.ProfileSecrets{}, false, err
	}
	if found {
		profile.TLSConfig = &tlsCfg
		profile.TLSConfigUpdatedAt = updatedAt
	}
	return profile, true, nil
}

func (s *Store) UpdateProfile(ctx context.Context, profileID string, req models.ProfileUpdateRequest) (models.Profile, bool, error) {
	currentSecrets, ok, err := s.GetProfileSecrets(ctx, profileID)
	if err != nil || !ok {
		return models.Profile{}, ok, err
	}

	name := currentSecrets.Name
	endpoint := currentSecrets.Endpoint
	region := currentSecrets.Region
	accessKeyID := currentSecrets.AccessKeyID
	secretAccessKey := currentSecrets.SecretAccessKey
	sessionToken := currentSecrets.SessionToken
	forcePathStyle := currentSecrets.ForcePathStyle
	tlsInsecureSkipVerify := currentSecrets.TLSInsecureSkipVerify

	if req.Name != nil {
		name = *req.Name
	}
	if req.Endpoint != nil {
		endpoint = *req.Endpoint
	}
	if req.Region != nil {
		region = *req.Region
	}
	if req.AccessKeyID != nil {
		accessKeyID = *req.AccessKeyID
	}
	if req.SecretAccessKey != nil {
		secretAccessKey = *req.SecretAccessKey
	}
	if req.SessionToken != nil {
		v := strings.TrimSpace(*req.SessionToken)
		if v == "" {
			sessionToken = nil
		} else {
			sessionToken = &v
		}
	}
	if req.ForcePathStyle != nil {
		forcePathStyle = *req.ForcePathStyle
	}
	if req.TLSInsecureSkipVerify != nil {
		tlsInsecureSkipVerify = *req.TLSInsecureSkipVerify
	}

	if s.crypto != nil {
		var err error
		accessKeyID, err = s.crypto.encryptString(accessKeyID)
		if err != nil {
			return models.Profile{}, true, err
		}
		secretAccessKey, err = s.crypto.encryptString(secretAccessKey)
		if err != nil {
			return models.Profile{}, true, err
		}
		if sessionToken != nil {
			enc, err := s.crypto.encryptString(*sessionToken)
			if err != nil {
				return models.Profile{}, true, err
			}
			*sessionToken = enc
		}
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err = s.exec(ctx, `
		UPDATE profiles
		SET name=?, endpoint=?, region=?, force_path_style=?, tls_insecure_skip_verify=?,
		    access_key_id=?, secret_access_key=?, session_token=?, updated_at=?
		WHERE id=?
	`,
		name, endpoint, region, boolToInt(forcePathStyle), boolToInt(tlsInsecureSkipVerify),
		accessKeyID, secretAccessKey, nullableString(sessionToken), now,
		profileID,
	)
	if err != nil {
		return models.Profile{}, true, err
	}

	profile, ok, err := s.GetProfile(ctx, profileID)
	if err != nil || !ok {
		return models.Profile{}, ok, err
	}
	return profile, true, nil
}

func (s *Store) DeleteProfile(ctx context.Context, profileID string) (bool, error) {
	res, err := s.exec(ctx, `DELETE FROM profiles WHERE id = ?`, profileID)
	if err != nil {
		return false, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return affected > 0, nil
}

type CreateJobInput struct {
	Type    string
	Payload map[string]any
}

func (s *Store) CreateJob(ctx context.Context, profileID string, in CreateJobInput) (models.Job, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	id := ulid.Make().String()

	payloadJSON, err := json.Marshal(in.Payload)
	if err != nil {
		return models.Job{}, err
	}

	_, err = s.exec(ctx, `
		INSERT INTO jobs (id, profile_id, type, status, payload_json, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, id, profileID, in.Type, string(models.JobStatusQueued), string(payloadJSON), now)
	if err != nil {
		return models.Job{}, err
	}

	return models.Job{
		ID:        id,
		Type:      in.Type,
		Status:    models.JobStatusQueued,
		Payload:   in.Payload,
		CreatedAt: now,
	}, nil
}

type JobFilter struct {
	Status *models.JobStatus
	Type   *string
	Limit  int
	Cursor *string
}

func (s *Store) ListJobs(ctx context.Context, profileID string, f JobFilter) (models.JobsListResponse, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	args := []any{profileID}
	where := "WHERE profile_id = ?"
	if f.Status != nil {
		where += " AND status = ?"
		args = append(args, string(*f.Status))
	}
	if f.Type != nil && *f.Type != "" {
		where += " AND type = ?"
		args = append(args, *f.Type)
	}
	if f.Cursor != nil && *f.Cursor != "" {
		where += " AND id < ?"
		args = append(args, *f.Cursor)
	}

	query := fmt.Sprintf(`
		SELECT id, type, status, payload_json, progress_json, error, created_at, started_at, finished_at
		FROM jobs
		%s
		ORDER BY id DESC
		LIMIT ?
	`, where)
	args = append(args, limit+1)

	rows, err := s.query(ctx, query, args...)
	if err != nil {
		return models.JobsListResponse{}, err
	}
	defer rows.Close()

	resp := models.JobsListResponse{
		Items: make([]models.Job, 0),
	}
	var (
		jobIDs   []string
		jobCount int
	)

	for rows.Next() {
		var (
			job       models.Job
			statusStr string
			payload   string
			progress  sql.NullString
			errMsg    sql.NullString
			startedAt sql.NullString
			finished  sql.NullString
		)
		if err := rows.Scan(
			&job.ID,
			&job.Type,
			&statusStr,
			&payload,
			&progress,
			&errMsg,
			&job.CreatedAt,
			&startedAt,
			&finished,
		); err != nil {
			return models.JobsListResponse{}, err
		}

		job.Status = models.JobStatus(statusStr)
		job.Payload = make(map[string]any)
		if err := json.Unmarshal([]byte(payload), &job.Payload); err != nil {
			return models.JobsListResponse{}, err
		}
		if progress.Valid && progress.String != "" {
			var jp models.JobProgress
			if err := json.Unmarshal([]byte(progress.String), &jp); err != nil {
				return models.JobsListResponse{}, err
			}
			job.Progress = &jp
		}
		if errMsg.Valid {
			job.Error = &errMsg.String
		}
		if startedAt.Valid {
			job.StartedAt = &startedAt.String
		}
		if finished.Valid {
			job.FinishedAt = &finished.String
		}

		jobCount++
		if jobCount <= limit {
			resp.Items = append(resp.Items, job)
			jobIDs = append(jobIDs, job.ID)
		}
	}
	if err := rows.Err(); err != nil {
		return models.JobsListResponse{}, err
	}

	if len(jobIDs) == limit && jobCount > limit {
		last := jobIDs[len(jobIDs)-1]
		resp.NextCursor = &last
	}
	return resp, nil
}

func (s *Store) GetJob(ctx context.Context, profileID, jobID string) (models.Job, bool, error) {
	var (
		job       models.Job
		statusStr string
		payload   string
		progress  sql.NullString
		errMsg    sql.NullString
		startedAt sql.NullString
		finished  sql.NullString
	)
	err := s.queryRow(ctx, `
		SELECT id, type, status, payload_json, progress_json, error, created_at, started_at, finished_at
		FROM jobs
		WHERE profile_id = ? AND id = ?
	`, profileID, jobID).Scan(
		&job.ID,
		&job.Type,
		&statusStr,
		&payload,
		&progress,
		&errMsg,
		&job.CreatedAt,
		&startedAt,
		&finished,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.Job{}, false, nil
		}
		return models.Job{}, false, err
	}

	job.Status = models.JobStatus(statusStr)
	job.Payload = make(map[string]any)
	if err := json.Unmarshal([]byte(payload), &job.Payload); err != nil {
		return models.Job{}, false, err
	}
	if progress.Valid && progress.String != "" {
		var jp models.JobProgress
		if err := json.Unmarshal([]byte(progress.String), &jp); err != nil {
			return models.Job{}, false, err
		}
		job.Progress = &jp
	}
	if errMsg.Valid {
		job.Error = &errMsg.String
	}
	if startedAt.Valid {
		job.StartedAt = &startedAt.String
	}
	if finished.Valid {
		job.FinishedAt = &finished.String
	}

	return job, true, nil
}

func (s *Store) DeleteJob(ctx context.Context, profileID, jobID string) (bool, error) {
	res, err := s.exec(ctx, `DELETE FROM jobs WHERE profile_id = ? AND id = ?`, profileID, jobID)
	if err != nil {
		return false, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return affected > 0, nil
}

func (s *Store) DeleteFinishedJobsBefore(ctx context.Context, beforeRFC3339Nano string, limit int) ([]string, error) {
	if limit <= 0 {
		limit = 200
	}
	if limit > 1000 {
		limit = 1000
	}

	rows, err := s.query(ctx, `
		SELECT id
		FROM jobs
		WHERE finished_at IS NOT NULL
		  AND finished_at < ?
		  AND status IN (?, ?, ?)
		ORDER BY finished_at ASC
		LIMIT ?
	`,
		beforeRFC3339Nano,
		string(models.JobStatusSucceeded),
		string(models.JobStatusFailed),
		string(models.JobStatusCanceled),
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := make([]string, 0, limit)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		if id == "" {
			continue
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return nil, nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	for _, id := range ids {
		if _, err := tx.ExecContext(ctx, s.rebind(`DELETE FROM jobs WHERE id = ?`), id); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return ids, nil
}

func (s *Store) ListJobIDsByProfile(ctx context.Context, profileID string) ([]string, error) {
	rows, err := s.query(ctx, `SELECT id FROM jobs WHERE profile_id = ? ORDER BY id ASC`, profileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return ids, nil
}

func (s *Store) ListJobIDsByProfileAndStatus(ctx context.Context, profileID string, status models.JobStatus) ([]string, error) {
	rows, err := s.query(ctx, `SELECT id FROM jobs WHERE profile_id = ? AND status = ? ORDER BY id ASC`, profileID, string(status))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return ids, nil
}

func (s *Store) JobExists(ctx context.Context, jobID string) (bool, error) {
	var one int
	err := s.queryRow(ctx, `SELECT 1 FROM jobs WHERE id = ? LIMIT 1`, jobID).Scan(&one)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (s *Store) GetJobByID(ctx context.Context, jobID string) (profileID string, job models.Job, ok bool, err error) {
	var (
		statusStr string
		payload   string
		progress  sql.NullString
		errMsg    sql.NullString
		startedAt sql.NullString
		finished  sql.NullString
	)
	err = s.queryRow(ctx, `
		SELECT profile_id, id, type, status, payload_json, progress_json, error, created_at, started_at, finished_at
		FROM jobs
		WHERE id = ?
	`, jobID).Scan(
		&profileID,
		&job.ID,
		&job.Type,
		&statusStr,
		&payload,
		&progress,
		&errMsg,
		&job.CreatedAt,
		&startedAt,
		&finished,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", models.Job{}, false, nil
		}
		return "", models.Job{}, false, err
	}

	job.Status = models.JobStatus(statusStr)
	job.Payload = make(map[string]any)
	if err := json.Unmarshal([]byte(payload), &job.Payload); err != nil {
		return "", models.Job{}, false, err
	}
	if progress.Valid && progress.String != "" {
		var jp models.JobProgress
		if err := json.Unmarshal([]byte(progress.String), &jp); err != nil {
			return "", models.Job{}, false, err
		}
		job.Progress = &jp
	}
	if errMsg.Valid {
		job.Error = &errMsg.String
	}
	if startedAt.Valid {
		job.StartedAt = &startedAt.String
	}
	if finished.Valid {
		job.FinishedAt = &finished.String
	}

	return profileID, job, true, nil
}

func (s *Store) UpdateJobStatus(ctx context.Context, jobID string, status models.JobStatus, startedAt, finishedAt *string, progress *models.JobProgress, errMsg *string) error {
	var (
		progressJSON any
	)
	if progress != nil {
		bytes, err := json.Marshal(progress)
		if err != nil {
			return err
		}
		progressJSON = string(bytes)
	} else {
		progressJSON = nil
	}

	_, err := s.exec(ctx, `
		UPDATE jobs
		SET status=?,
		    started_at=COALESCE(?, started_at),
		    finished_at=COALESCE(?, finished_at),
		    progress_json=COALESCE(?, progress_json),
		    error=?
		WHERE id=?
	`,
		string(status),
		nullableString(startedAt),
		nullableString(finishedAt),
		progressJSON,
		nullableString(errMsg),
		jobID,
	)
	return err
}

func (s *Store) ListJobIDsByStatus(ctx context.Context, status models.JobStatus) ([]string, error) {
	rows, err := s.query(ctx, `SELECT id FROM jobs WHERE status = ? ORDER BY id ASC`, string(status))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return ids, nil
}

func (s *Store) MarkRunningJobsFailed(ctx context.Context, errorMessage string) error {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err := s.exec(ctx, `
		UPDATE jobs
		SET status=?, error=?, finished_at=?
		WHERE status=?
	`, string(models.JobStatusFailed), errorMessage, now, string(models.JobStatusRunning))
	return err
}

type UploadSession struct {
	ID         string
	ProfileID  string
	Bucket     string
	Prefix     string
	StagingDir string
	ExpiresAt  string
	CreatedAt  string
}

func (s *Store) CreateUploadSession(ctx context.Context, profileID, bucket, prefix, stagingDir, expiresAt string) (UploadSession, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	id := ulid.Make().String()

	_, err := s.exec(ctx, `
		INSERT INTO upload_sessions (id, profile_id, bucket, prefix, staging_dir, expires_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, id, profileID, bucket, prefix, stagingDir, expiresAt, now)
	if err != nil {
		return UploadSession{}, err
	}
	return UploadSession{
		ID:         id,
		ProfileID:  profileID,
		Bucket:     bucket,
		Prefix:     prefix,
		StagingDir: stagingDir,
		ExpiresAt:  expiresAt,
		CreatedAt:  now,
	}, nil
}

func (s *Store) SetUploadSessionStagingDir(ctx context.Context, profileID, uploadID, stagingDir string) error {
	_, err := s.exec(ctx, `
		UPDATE upload_sessions
		SET staging_dir = ?
		WHERE profile_id = ? AND id = ?
	`, stagingDir, profileID, uploadID)
	return err
}

func (s *Store) GetUploadSession(ctx context.Context, profileID, uploadID string) (UploadSession, bool, error) {
	var us UploadSession
	err := s.queryRow(ctx, `
		SELECT id, profile_id, bucket, prefix, staging_dir, expires_at, created_at
		FROM upload_sessions
		WHERE profile_id = ? AND id = ?
	`, profileID, uploadID).Scan(
		&us.ID,
		&us.ProfileID,
		&us.Bucket,
		&us.Prefix,
		&us.StagingDir,
		&us.ExpiresAt,
		&us.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return UploadSession{}, false, nil
		}
		return UploadSession{}, false, err
	}
	return us, true, nil
}

func (s *Store) UploadSessionExists(ctx context.Context, uploadID string) (bool, error) {
	var one int
	err := s.queryRow(ctx, `SELECT 1 FROM upload_sessions WHERE id = ? LIMIT 1`, uploadID).Scan(&one)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (s *Store) ListUploadSessionsByProfile(ctx context.Context, profileID string, limit int) ([]UploadSession, error) {
	if limit <= 0 {
		limit = 1000
	}
	if limit > 10_000 {
		limit = 10_000
	}

	rows, err := s.query(ctx, `
		SELECT id, profile_id, bucket, prefix, staging_dir, expires_at, created_at
		FROM upload_sessions
		WHERE profile_id = ?
		ORDER BY created_at ASC
		LIMIT ?
	`, profileID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sessions := make([]UploadSession, 0)
	for rows.Next() {
		var us UploadSession
		if err := rows.Scan(&us.ID, &us.ProfileID, &us.Bucket, &us.Prefix, &us.StagingDir, &us.ExpiresAt, &us.CreatedAt); err != nil {
			return nil, err
		}
		sessions = append(sessions, us)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return sessions, nil
}

func (s *Store) DeleteUploadSession(ctx context.Context, profileID, uploadID string) (bool, error) {
	res, err := s.exec(ctx, `DELETE FROM upload_sessions WHERE profile_id = ? AND id = ?`, profileID, uploadID)
	if err != nil {
		return false, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return affected > 0, nil
}

func (s *Store) ListExpiredUploadSessions(ctx context.Context, nowRFC3339Nano string, limit int) ([]UploadSession, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}

	rows, err := s.query(ctx, `
		SELECT id, profile_id, bucket, prefix, staging_dir, expires_at, created_at
		FROM upload_sessions
		WHERE expires_at < ?
		ORDER BY expires_at ASC
		LIMIT ?
	`, nowRFC3339Nano, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sessions := make([]UploadSession, 0)
	for rows.Next() {
		var us UploadSession
		if err := rows.Scan(&us.ID, &us.ProfileID, &us.Bucket, &us.Prefix, &us.StagingDir, &us.ExpiresAt, &us.CreatedAt); err != nil {
			return nil, err
		}
		sessions = append(sessions, us)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return sessions, nil
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}

func nullableString(s *string) any {
	if s == nil {
		return nil
	}
	return *s
}
