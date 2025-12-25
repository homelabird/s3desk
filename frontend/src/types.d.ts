export {}

declare global {
	interface FileSystemHandle {
		kind: 'file' | 'directory'
		name: string
	}

	interface FileSystemDirectoryHandle extends FileSystemHandle {
		kind: 'directory'
		entries(): AsyncIterableIterator<[string, FileSystemHandle]>
		getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>
		getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
		removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>
		queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
		requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
	}

	interface FileSystemFileHandle extends FileSystemHandle {
		kind: 'file'
		getFile(): Promise<File>
		createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>
	}

	interface FileSystemWritableFileStream extends WritableStream<Uint8Array> {
		write(data: BufferSource | Blob | string): Promise<void>
		seek(position: number): Promise<void>
		truncate(size: number): Promise<void>
		close(): Promise<void>
		abort?(): Promise<void>
	}
}
