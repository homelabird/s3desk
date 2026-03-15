package api

import (
	"bytes"
	"io"
	"testing"
)

type recordingTransferReader struct {
	data          []byte
	readSizes     []int
	writeToCalled bool
}

func (r *recordingTransferReader) Read(p []byte) (int, error) {
	r.readSizes = append(r.readSizes, len(p))
	if len(r.data) == 0 {
		return 0, io.EOF
	}
	n := copy(p, r.data)
	r.data = r.data[n:]
	if len(r.data) == 0 {
		return n, io.EOF
	}
	return n, nil
}

func (r *recordingTransferReader) WriteTo(w io.Writer) (int64, error) {
	r.writeToCalled = true
	n, err := w.Write(r.data)
	r.data = r.data[n:]
	return int64(n), err
}

type recordingTransferWriter struct {
	bytes.Buffer
	readFromCalled bool
}

func (w *recordingTransferWriter) ReadFrom(r io.Reader) (int64, error) {
	w.readFromCalled = true
	return io.Copy(&w.Buffer, r)
}

func TestCopyWithTransferBuffer_UsesConfiguredBuffer(t *testing.T) {
	t.Parallel()

	payload := bytes.Repeat([]byte("a"), transferCopyBufferBytes+1)
	reader := &recordingTransferReader{data: append([]byte(nil), payload...)}
	writer := &recordingTransferWriter{}

	n, err := copyWithTransferBuffer(writer, reader)
	if err != nil {
		t.Fatalf("copyWithTransferBuffer error: %v", err)
	}
	if n != int64(len(payload)) {
		t.Fatalf("copied=%d, want %d", n, len(payload))
	}
	if reader.writeToCalled {
		t.Fatalf("expected reader WriteTo optimization to be bypassed")
	}
	if writer.readFromCalled {
		t.Fatalf("expected writer ReadFrom optimization to be bypassed")
	}
	if len(reader.readSizes) == 0 || reader.readSizes[0] != transferCopyBufferBytes {
		t.Fatalf("read sizes=%v, want first read size %d", reader.readSizes, transferCopyBufferBytes)
	}
	if got := writer.Bytes(); !bytes.Equal(got, payload) {
		t.Fatalf("copied payload mismatch: got %d bytes, want %d", len(got), len(payload))
	}
}
