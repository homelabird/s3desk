package processio

import (
	"bytes"
	"fmt"
	"io"
	"strings"
)

const (
	DefaultStdoutMaxBytes int64 = 8 << 20
	DefaultStderrMaxBytes int64 = 256 << 10
)

type OutputLimitError struct {
	Stream string
	Limit  int64
}

func (e *OutputLimitError) Error() string {
	stream := strings.TrimSpace(e.Stream)
	if stream == "" {
		stream = "process output"
	}
	return fmt.Sprintf("%s exceeds capture limit (%d bytes)", stream, e.Limit)
}

func ReadAll(r io.Reader, maxBytes int64, stream string) ([]byte, error) {
	if maxBytes < 0 {
		return nil, fmt.Errorf("invalid capture limit %d", maxBytes)
	}
	limited := io.LimitReader(r, maxBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return data, err
	}
	if int64(len(data)) > maxBytes {
		return data[:maxBytes], &OutputLimitError{Stream: stream, Limit: maxBytes}
	}
	return data, nil
}

type LimitBuffer struct {
	maxBytes  int64
	buf       bytes.Buffer
	truncated bool
}

func NewLimitBuffer(maxBytes int64) *LimitBuffer {
	if maxBytes < 0 {
		maxBytes = 0
	}
	return &LimitBuffer{maxBytes: maxBytes}
}

func (b *LimitBuffer) Write(p []byte) (int, error) {
	if int64(b.buf.Len()) >= b.maxBytes {
		if len(p) > 0 {
			b.truncated = true
		}
		return len(p), nil
	}

	remaining := b.maxBytes - int64(b.buf.Len())
	keep := len(p)
	if int64(keep) > remaining {
		keep = int(remaining)
		b.truncated = true
	}
	if keep > 0 {
		_, _ = b.buf.Write(p[:keep])
	}
	return len(p), nil
}

func (b *LimitBuffer) Bytes() []byte {
	return b.buf.Bytes()
}

func (b *LimitBuffer) String() string {
	value := b.buf.String()
	if !b.truncated {
		return value
	}
	marker := fmt.Sprintf("[output truncated after %d bytes]", b.maxBytes)
	if value == "" {
		return marker
	}
	return value + "\n" + marker
}

func (b *LimitBuffer) Truncated() bool {
	return b.truncated
}

func (b *LimitBuffer) Limit() int64 {
	return b.maxBytes
}
