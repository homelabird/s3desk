package jobs

import (
	"bufio"
	"errors"
	"strings"
	"testing"
)

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
