package responsebody

import (
	"fmt"
	"io"
)

const (
	ControlPlaneMaxBytes int64 = 1 << 20
	TokenMaxBytes        int64 = 256 << 10
)

type TooLargeError struct {
	MaxBytes int64
}

func (e TooLargeError) Error() string {
	return fmt.Sprintf("http response body exceeds %d bytes", e.MaxBytes)
}

func ReadAll(r io.Reader, maxBytes int64) ([]byte, error) {
	if maxBytes <= 0 {
		return io.ReadAll(r)
	}
	body, err := io.ReadAll(io.LimitReader(r, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > maxBytes {
		return nil, TooLargeError{MaxBytes: maxBytes}
	}
	return body, nil
}
