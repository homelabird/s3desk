package api

import (
	"io"
	"sync"
)

const transferCopyBufferBytes = 4 * 1024 * 1024

var transferCopyBufferPool = sync.Pool{
	New: func() any {
		buf := make([]byte, transferCopyBufferBytes)
		return &buf
	},
}

type writerOnly struct {
	io.Writer
}

type readerOnly struct {
	io.Reader
}

func copyWithTransferBuffer(dst io.Writer, src io.Reader) (int64, error) {
	bufPtr := transferCopyBufferPool.Get().(*[]byte)
	buf := *bufPtr
	if cap(buf) < transferCopyBufferBytes {
		buf = make([]byte, transferCopyBufferBytes)
	} else {
		buf = buf[:transferCopyBufferBytes]
	}
	*bufPtr = buf
	defer transferCopyBufferPool.Put(bufPtr)

	return io.CopyBuffer(writerOnly{Writer: dst}, readerOnly{Reader: src}, buf)
}
