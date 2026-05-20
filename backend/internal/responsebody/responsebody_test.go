package responsebody

import (
	"errors"
	"strings"
	"testing"
)

func TestReadAllAllowsExactLimit(t *testing.T) {
	t.Parallel()

	body, err := ReadAll(strings.NewReader("abcd"), 4)
	if err != nil {
		t.Fatalf("ReadAll: %v", err)
	}
	if string(body) != "abcd" {
		t.Fatalf("body=%q, want abcd", string(body))
	}
}

func TestReadAllRejectsOverLimit(t *testing.T) {
	t.Parallel()

	_, err := ReadAll(strings.NewReader("abcde"), 4)
	if err == nil {
		t.Fatal("expected over-limit error")
	}
	var limitErr TooLargeError
	if !errors.As(err, &limitErr) {
		t.Fatalf("err=%T, want TooLargeError", err)
	}
	if limitErr.MaxBytes != 4 {
		t.Fatalf("MaxBytes=%d, want 4", limitErr.MaxBytes)
	}
}
