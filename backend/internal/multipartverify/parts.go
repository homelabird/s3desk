// Package multipartverify validates a provider's live multipart inventory before
// completion. Content identity is checked separately against the reselected file.
package multipartverify

import (
	"errors"
	"strings"
)

type Part struct {
	Number int
	Size   int64
	ETag   string
}

// Complete accepts exactly every expected part, with the expected byte length.
// It returns provider ETags in ascending part order, never a partial inventory.
func Complete(parts []Part, fileSize, chunkSize int64) ([]Part, error) {
	invalid := errors.New("incomplete or invalid multipart inventory")
	if fileSize <= 0 || chunkSize <= 0 {
		return nil, invalid
	}
	count := (fileSize-1)/chunkSize + 1
	if count > 10000 || int64(len(parts)) != count {
		return nil, invalid
	}
	result := make([]Part, int(count))
	seen := make([]bool, int(count))
	for _, part := range parts {
		i := part.Number - 1
		if i < 0 || int64(i) >= count || seen[i] || strings.TrimSpace(part.ETag) == "" {
			return nil, invalid
		}
		expected := chunkSize
		if int64(i) == count-1 {
			expected = fileSize - int64(i)*chunkSize
		}
		if part.Size != expected {
			return nil, invalid
		}
		seen[i], result[i] = true, part
	}
	return result, nil
}
