package processio

import (
	"errors"
	"strings"
	"testing"
)

func TestLimitBufferKeepsWritesWithinLimit(t *testing.T) {
	buf := NewLimitBuffer(5)

	n, err := buf.Write([]byte("hello"))

	if err != nil {
		t.Fatalf("Write err=%v", err)
	}
	if n != 5 {
		t.Fatalf("Write n=%d, want 5", n)
	}
	if got := buf.String(); got != "hello" {
		t.Fatalf("String=%q, want %q", got, "hello")
	}
	if buf.Truncated() {
		t.Fatal("Truncated=true, want false")
	}
}

func TestLimitBufferDiscardsOverflowWithoutShortWrite(t *testing.T) {
	buf := NewLimitBuffer(5)

	n, err := buf.Write([]byte("hello world"))

	if err != nil {
		t.Fatalf("Write err=%v", err)
	}
	if n != len("hello world") {
		t.Fatalf("Write n=%d, want %d", n, len("hello world"))
	}
	if got := buf.Bytes(); string(got) != "hello" {
		t.Fatalf("Bytes=%q, want %q", string(got), "hello")
	}
	if !buf.Truncated() {
		t.Fatal("Truncated=false, want true")
	}
	if got := buf.String(); !strings.Contains(got, "[output truncated after 5 bytes]") {
		t.Fatalf("String=%q, want truncation marker", got)
	}
}

func TestReadAllRejectsOversizedOutput(t *testing.T) {
	data, err := ReadAll(strings.NewReader("abcdef"), 5, "stdout")

	var limitErr *OutputLimitError
	if !errors.As(err, &limitErr) {
		t.Fatalf("ReadAll err=%v, want OutputLimitError", err)
	}
	if string(data) != "abcde" {
		t.Fatalf("data=%q, want %q", string(data), "abcde")
	}
}
