package jobs

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"s3desk/internal/models"
)

type s3PrefixTotals struct {
	Objects int64
	Bytes   int64
}

func computeS3PrefixTotals(
	ctx context.Context,
	m *Manager,
	profile models.ProfileSecrets,
	jobID string,
	bucket string,
	prefix string,
	include []string,
	exclude []string,
	maxObjects int64,
	preserveLeadingSlash bool,
) (totals s3PrefixTotals, ok bool, err error) {
	if maxObjects <= 0 {
		maxObjects = 50_000
	}

	args := []string{"lsjson", "-R", "--fast-list", "--no-mimetype", rcloneRemoteDir(bucket, prefix, preserveLeadingSlash)}
	proc, err := m.startRcloneCommand(ctx, profile, jobID, args)
	if err != nil {
		return s3PrefixTotals{}, false, err
	}

	listErr := decodeRcloneList(proc.stdout, func(entry rcloneListEntry) error {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		if entry.IsDir {
			return nil
		}
		key := entry.Path
		if strings.TrimSpace(key) == "" && strings.TrimSpace(entry.Name) != "" {
			key = entry.Name
		}
		key = rcloneObjectKey(prefix, key, preserveLeadingSlash)
		if key == "" {
			return nil
		}

		rel := key
		if prefix != "" && strings.HasPrefix(key, prefix) {
			rel = strings.TrimPrefix(key, prefix)
		}
		if !shouldIncludePath(rel, include, exclude) {
			return nil
		}

		totals.Objects++
		totals.Bytes += entry.Size
		if totals.Objects > maxObjects {
			return errRcloneListStop
		}
		return nil
	})
	waitErr := proc.wait()
	if errors.Is(listErr, errRcloneListStop) {
		return s3PrefixTotals{}, false, nil
	}
	if listErr != nil {
		return s3PrefixTotals{}, false, listErr
	}
	if waitErr != nil {
		return s3PrefixTotals{}, false, fmt.Errorf("rclone lsjson failed: %w: %s", waitErr, strings.TrimSpace(proc.stderr.String()))
	}

	return totals, true, nil
}
