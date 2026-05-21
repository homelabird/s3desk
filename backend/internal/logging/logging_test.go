package logging

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"os"
	"strings"
	"testing"
)

func TestJSONLoggerRedactsStructuredFields(t *testing.T) {
	var buf bytes.Buffer
	logger := New(FormatJSON)
	logger.out = &buf
	logger.base = map[string]any{}

	logger.InfoFields("provider response Authorization: Bearer msg-token", map[string]any{
		"secretAccessKey": "secret-key",
		"error":           "Authorization: Bearer field-token",
		"nested": map[string]any{
			"apiToken": "nested-token",
		},
	})

	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("json.Unmarshal: %v; body=%q", err, buf.String())
	}
	if got := entry["secretAccessKey"]; got != "[REDACTED]" {
		t.Fatalf("secretAccessKey=%v, want redacted", got)
	}
	if got := entry["error"].(string); strings.Contains(got, "field-token") || !strings.Contains(got, "[REDACTED]") {
		t.Fatalf("error=%q, want token redacted", got)
	}
	if got := entry["msg"].(string); strings.Contains(got, "msg-token") || !strings.Contains(got, "[REDACTED]") {
		t.Fatalf("msg=%q, want token redacted", got)
	}
	nested, ok := entry["nested"].(map[string]any)
	if !ok {
		t.Fatalf("nested=%T, want object", entry["nested"])
	}
	if got := nested["apiToken"]; got != "[REDACTED]" {
		t.Fatalf("nested.apiToken=%v, want redacted", got)
	}
}

func TestTextLoggerRedactsStructuredFields(t *testing.T) {
	var buf bytes.Buffer
	logger := New(FormatText)
	logger.out = &buf
	logger.text = log.New(&buf, "", 0)

	logger.WarnFields("provider response Authorization: Bearer msg-token", map[string]any{
		"accessToken": "field-token",
	})

	output := buf.String()
	if strings.Contains(output, "msg-token") || strings.Contains(output, "field-token") {
		t.Fatalf("output=%q, want secrets redacted", output)
	}
	if !strings.Contains(output, "[REDACTED]") {
		t.Fatalf("output=%q, want redaction marker", output)
	}
}

func TestWriteJSONLineStdoutRedactsStructuredFields(t *testing.T) {
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe: %v", err)
	}
	oldStdout := os.Stdout
	os.Stdout = writer
	oldDefault := defaultLogger
	SetDefault(New(FormatJSON))
	t.Cleanup(func() {
		os.Stdout = oldStdout
		SetDefault(oldDefault)
	})

	WriteJSONLineStdout(map[string]any{
		"credentials": "secret-credentials",
		"details":     "Cookie: session=secret-cookie",
	})
	_ = writer.Close()

	body, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("ReadAll: %v", err)
	}
	_ = reader.Close()

	var entry map[string]any
	if err := json.Unmarshal(body, &entry); err != nil {
		t.Fatalf("json.Unmarshal: %v; body=%q", err, string(body))
	}
	if got := entry["credentials"]; got != "[REDACTED]" {
		t.Fatalf("credentials=%v, want redacted", got)
	}
	if got := entry["details"].(string); strings.Contains(got, "secret-cookie") || !strings.Contains(got, "[REDACTED]") {
		t.Fatalf("details=%q, want token redacted", got)
	}
}
