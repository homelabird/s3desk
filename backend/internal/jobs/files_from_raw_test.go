package jobs

import "testing"

func TestWriteFilesFromRawTempFileRejectsUnsupportedControlCharacters(t *testing.T) {
	t.Parallel()

	if _, err := writeFilesFromRawTempFile("test-*.txt", []string{"good", "bad\nkey"}); err == nil {
		t.Fatal("expected error for newline-delimited injection")
	}

	if _, err := writeFilesFromRawTempFile("test-*.txt", []string{"good", "bad\rkey"}); err == nil {
		t.Fatal("expected error for carriage return injection")
	}
}
