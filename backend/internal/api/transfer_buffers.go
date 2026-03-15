package api

import (
	"io"
	"sync"
)

const transferCopyBufferBytes = 4 * 1024 * 1024

var transferCopyBufferPool = sync.Pool{
	New: func() any {
		return make([]byte, transferCopyBufferBytes)
	},
}

type writerOnly struct {
	io.Writer
}

type readerOnly struct {
	io.Reader
}

func copyWithTransferBuffer(dst io.Writer, src io.Reader) (int64, error) {
	buf := transferCopyBufferPool.Get().([]byte)
	if cap(buf) < transferCopyBufferBytes {
		buf = make([]byte, transferCopyBufferBytes)
	} else {
		buf = buf[:transferCopyBufferBytes]
	}
	defer transferCopyBufferPool.Put(buf)

	return io.CopyBuffer(writerOnly{Writer: dst}, readerOnly{Reader: src}, buf)
}
