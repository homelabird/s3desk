package jobs

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"s3desk/internal/models"
	"s3desk/internal/ws"
)

func TestWriteJobLogRedactsStoredAndRealtimeMessages(t *testing.T) {
	t.Parallel()

	hub := ws.NewHub()
	client := hub.Subscribe()
	defer hub.Unsubscribe(client)

	var buf bytes.Buffer
	m := &Manager{hub: hub}
	m.writeJobLog(&buf, "job-redact", "error", "rclone failed secret_access_key=stored-secret request id req-1")

	stored := buf.String()
	if _, err := time.Parse(time.RFC3339Nano, strings.Fields(stored)[0]); err != nil {
		t.Fatalf("stored log timestamp: %v", err)
	}
	if !strings.Contains(stored, " ERROR ") {
		t.Fatalf("stored log missing canonical level: %s", stored)
	}
	if strings.Contains(stored, "stored-secret") {
		t.Fatalf("stored log leaked secret: %s", stored)
	}
	if !strings.Contains(stored, "request id req-1") || !strings.Contains(stored, "[REDACTED]") {
		t.Fatalf("stored log lost context or marker: %s", stored)
	}

	msg := <-client.Messages()
	body := string(msg.Data)
	if strings.Contains(body, "stored-secret") {
		t.Fatalf("realtime log leaked secret: %s", body)
	}
	var evt ws.Event
	if err := json.Unmarshal(msg.Data, &evt); err != nil {
		t.Fatalf("decode realtime event: %v", err)
	}
	payload := evt.Payload.(map[string]any)
	message := payload["message"].(string)
	if !strings.Contains(message, "request id req-1") || !strings.Contains(message, "[REDACTED]") {
		t.Fatalf("realtime message lost context or marker: %q", message)
	}
}

func TestMaybeCaptureUnknownRcloneErrorRedactsCaptureFile(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	m := &Manager{dataDir: dataDir, captureUnknownRcloneErrors: true}
	m.maybeCaptureUnknownRcloneError(models.ProfileSecrets{Provider: "aws"}, "job-capture", "rclone copy", "AccessDenied secret_access_key=capture-secret request id req-2")

	files, err := filepath.Glob(filepath.Join(dataDir, "logs", "rcloneerrors", "unknown", "*.txt"))
	if err != nil {
		t.Fatalf("glob capture: %v", err)
	}
	if len(files) != 1 {
		t.Fatalf("capture files=%d, want 1", len(files))
	}
	data, err := os.ReadFile(files[0])
	if err != nil {
		t.Fatalf("read capture: %v", err)
	}
	body := string(data)
	if strings.Contains(body, "capture-secret") {
		t.Fatalf("capture leaked secret: %s", body)
	}
	if !strings.Contains(body, "request id req-2") || !strings.Contains(body, "[REDACTED]") {
		t.Fatalf("capture lost context or marker: %s", body)
	}
}

func TestJobErrorFromRcloneRedactsDiagnosticMessage(t *testing.T) {
	t.Parallel()

	err := jobErrorFromRclone(
		os.ErrPermission,
		"provider failed secret_access_key=job-secret request id req-3",
		"rclone copy",
	)

	msg := err.Error()
	if strings.Contains(msg, "job-secret") {
		t.Fatalf("job error leaked secret: %s", msg)
	}
	if !strings.Contains(msg, "request id req-3") || !strings.Contains(msg, "[REDACTED]") {
		t.Fatalf("job error lost context or marker: %s", msg)
	}
}
