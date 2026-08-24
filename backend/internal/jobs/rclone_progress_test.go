package jobs

import (
	"bufio"
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestTrackRcloneProgressUsesProvidedTotalsWithoutJobQueries(t *testing.T) {
	manager, st, _, gormDB, profile, _ := newManagerConsistencyFixture(t)

	startedAt := time.Now().UTC().Format(time.RFC3339Nano)
	initialDone := int64(0)
	initialTotal := int64(3)
	job, err := st.CreateJob(context.Background(), profile.ID, store.CreateJobInput{
		Type:      JobTypeS3DeleteObjects,
		Status:    models.JobStatusRunning,
		StartedAt: &startedAt,
		Payload:   map[string]any{"bucket": "test-bucket", "keys": []string{"a", "b", "c"}},
		Progress: &models.JobProgress{
			ObjectsDone:  &initialDone,
			ObjectsTotal: &initialTotal,
		},
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}

	jobQueries := 0
	const callbackName = "test_rclone_progress_job_query_count"
	if err := gormDB.Callback().Query().Before("gorm:query").Register(callbackName, func(tx *gorm.DB) {
		if tx.Statement != nil && tx.Statement.Table == "jobs" {
			jobQueries++
		}
	}); err != nil {
		t.Fatalf("register job query callback: %v", err)
	}
	t.Cleanup(func() { _ = gormDB.Callback().Query().Remove(callbackName) })

	progress := make(chan rcloneStatsUpdate, 3)
	progress <- rcloneStatsUpdate{ObjectsDone: 1}
	progress <- rcloneStatsUpdate{ObjectsDone: 2}
	progress <- rcloneStatsUpdate{ObjectsDone: 3}
	close(progress)

	manager.trackRcloneProgress(context.Background(), job.ID, &models.JobProgress{ObjectsTotal: &initialTotal}, progress)

	if jobQueries != 0 {
		t.Fatalf("job queries=%d, want no progress totals lookup", jobQueries)
	}

	updated, ok, err := st.GetJob(context.Background(), profile.ID, job.ID)
	if err != nil {
		t.Fatalf("get job: %v", err)
	}
	if !ok || updated.Progress == nil {
		t.Fatalf("expected persisted job progress")
	}
	if updated.Progress.ObjectsDone == nil || *updated.Progress.ObjectsDone != 3 {
		t.Fatalf("objects done=%v, want 3", updated.Progress.ObjectsDone)
	}
	if updated.Progress.ObjectsTotal == nil || *updated.Progress.ObjectsTotal != initialTotal {
		t.Fatalf("objects total=%v, want %d", updated.Progress.ObjectsTotal, initialTotal)
	}
}

func TestReadLogLineTruncatesOverlongLine(t *testing.T) {
	reader := bufio.NewReader(strings.NewReader("hello world\n"))

	line, truncated, err := readLogLine(reader, 5)
	if !errors.Is(err, bufio.ErrTooLong) {
		t.Fatalf("expected ErrTooLong, got %v", err)
	}
	if !truncated {
		t.Fatalf("expected truncated=true")
	}
	if line != "hello" {
		t.Fatalf("expected truncated line %q, got %q", "hello", line)
	}
}

func TestReadLogLineReturnsEOFLineWithoutTrailingNewline(t *testing.T) {
	reader := bufio.NewReader(strings.NewReader("last line"))

	line, truncated, err := readLogLine(reader, 64)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if truncated {
		t.Fatalf("expected truncated=false")
	}
	if line != "last line" {
		t.Fatalf("expected line %q, got %q", "last line", line)
	}
}

func TestFormatRcloneJSONLineIncludesObjectWhenMissingFromMessage(t *testing.T) {
	line := `{"msg":"Copied (new)","object":"bucket/key.txt","stats":{"bytes":12,"totalBytes":24,"transfers":1,"totalTransfers":2,"speed":42.5,"eta":3.6}}`

	rendered, stats := formatRcloneJSONLine(line)
	if rendered != "Copied (new) bucket/key.txt" {
		t.Fatalf("expected rendered message with object, got %q", rendered)
	}
	if stats == nil {
		t.Fatalf("expected stats")
	}
	if stats.TotalTransfers != 2 {
		t.Fatalf("expected TotalTransfers 2, got %d", stats.TotalTransfers)
	}
}

func TestFormatRcloneJSONLineRejectsInvalidJSON(t *testing.T) {
	rendered, stats := formatRcloneJSONLine("not-json")
	if rendered != "" {
		t.Fatalf("expected empty rendered message, got %q", rendered)
	}
	if stats != nil {
		t.Fatalf("expected nil stats")
	}
}

func TestProgressFromStatsUsesTransferTotals(t *testing.T) {
	eta := 3.6
	update, ok := progressFromStats(&rcloneStats{
		Bytes:          12,
		TotalBytes:     24,
		Transfers:      2,
		TotalTransfers: 5,
		Speed:          42.9,
		Eta:            &eta,
	}, rcloneProgressTransfers)
	if !ok {
		t.Fatalf("expected ok=true")
	}
	if update.BytesDone != 12 || update.ObjectsDone != 2 {
		t.Fatalf("unexpected progress update: %+v", update)
	}
	if update.BytesTotal == nil || *update.BytesTotal != 24 {
		t.Fatalf("expected BytesTotal 24, got %+v", update.BytesTotal)
	}
	if update.ObjectsTotal == nil || *update.ObjectsTotal != 5 {
		t.Fatalf("expected ObjectsTotal 5, got %+v", update.ObjectsTotal)
	}
	if update.SpeedBps == nil || *update.SpeedBps != 42 {
		t.Fatalf("expected SpeedBps 42, got %+v", update.SpeedBps)
	}
	if update.EtaSeconds == nil || *update.EtaSeconds != 4 {
		t.Fatalf("expected EtaSeconds 4, got %+v", update.EtaSeconds)
	}
}

func TestProgressFromStatsUsesDeleteCountForDeleteMode(t *testing.T) {
	update, ok := progressFromStats(&rcloneStats{
		Bytes:   7,
		Deletes: 3,
	}, rcloneProgressDeletes)
	if !ok {
		t.Fatalf("expected ok=true")
	}
	if update.BytesDone != 7 || update.ObjectsDone != 3 {
		t.Fatalf("unexpected progress update: %+v", update)
	}
	if update.ObjectsTotal != nil {
		t.Fatalf("expected ObjectsTotal nil, got %+v", update.ObjectsTotal)
	}
}
