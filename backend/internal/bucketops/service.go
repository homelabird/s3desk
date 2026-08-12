package bucketops

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"s3desk/internal/models"
	"s3desk/internal/rcloneconfig"
)

type Process struct {
	Stdout io.ReadCloser
	Stderr func() string
	Wait   func() error
}

type StartFunc func(context.Context, models.ProfileSecrets, []string, string) (*Process, error)
type CaptureFunc func(context.Context, models.ProfileSecrets, []string, string) (string, string, error)

type Service struct {
	start   StartFunc
	capture CaptureFunc
}

func NewService(start StartFunc, capture CaptureFunc) *Service {
	return &Service{start: start, capture: capture}
}

type RemoteError struct {
	Err    error
	Stderr string
}

func (e *RemoteError) Error() string {
	if e == nil || e.Err == nil {
		return "bucket provider operation failed"
	}
	return e.Err.Error()
}

func (e *RemoteError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func (s *Service) List(ctx context.Context, profile models.ProfileSecrets) ([]models.Bucket, error) {
	proc, err := s.start(ctx, profile, []string{"lsjson", "--dirs-only", "remote:"}, "list-buckets")
	if err != nil {
		return nil, &RemoteError{Err: err}
	}
	if proc == nil || proc.Stdout == nil || proc.Wait == nil {
		return nil, fmt.Errorf("bucket list process is incomplete")
	}
	defer proc.Stdout.Close()

	entries, decodeErr := decodeList(proc.Stdout)
	waitErr := proc.Wait()
	if decodeErr != nil {
		if waitErr != nil {
			return nil, &RemoteError{Err: waitErr, Stderr: processStderr(proc)}
		}
		return nil, decodeErr
	}
	if waitErr != nil {
		return nil, &RemoteError{Err: waitErr, Stderr: processStderr(proc)}
	}

	buckets := make([]models.Bucket, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir && !entry.IsBucket {
			continue
		}
		name := strings.TrimSpace(entry.Name)
		if name == "" {
			name = strings.TrimSpace(entry.Path)
		}
		if name != "" {
			buckets = append(buckets, models.Bucket{Name: name})
		}
	}
	return buckets, nil
}

func (s *Service) Create(ctx context.Context, profile models.ProfileSecrets, bucket, region string) error {
	args := []string{"mkdir"}
	if profile.Provider == models.ProfileProviderGcpGcs {
		if region != "" {
			args = append(args, "--gcs-location", region)
		}
	} else if region != "" {
		profile.Region = region
	}
	args = append(args, rcloneconfig.RemoteBucket(bucket))
	return s.captureRemote(ctx, profile, args, "create-bucket")
}

func (s *Service) Delete(ctx context.Context, profile models.ProfileSecrets, bucket string) error {
	return s.captureRemote(ctx, profile, []string{"rmdir", rcloneconfig.RemoteBucket(bucket)}, "delete-bucket")
}

func (s *Service) captureRemote(ctx context.Context, profile models.ProfileSecrets, args []string, hint string) error {
	_, stderr, err := s.capture(ctx, profile, args, hint)
	if err != nil {
		return &RemoteError{Err: err, Stderr: stderr}
	}
	return nil
}

type listEntry struct {
	Path     string `json:"Path"`
	Name     string `json:"Name"`
	IsDir    bool   `json:"IsDir"`
	IsBucket bool   `json:"IsBucket"`
}

func decodeList(r io.Reader) ([]listEntry, error) {
	dec := json.NewDecoder(r)
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	delim, ok := tok.(json.Delim)
	if !ok || delim != '[' {
		return nil, fmt.Errorf("unexpected rclone bucket list output")
	}

	entries := make([]listEntry, 0)
	for dec.More() {
		var entry listEntry
		if err := dec.Decode(&entry); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	if _, err := dec.Token(); err != nil {
		return nil, err
	}
	return entries, nil
}

func processStderr(proc *Process) string {
	if proc == nil || proc.Stderr == nil {
		return ""
	}
	return proc.Stderr()
}
