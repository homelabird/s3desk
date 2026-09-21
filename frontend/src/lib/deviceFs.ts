import {
	directoryPickerEnvironmentUnavailableReason,
	directoryPickerInsecureOriginReason,
	directoryPickerUnavailableHint,
	directoryPickerUnsupportedBrowserReason,
	localFolderWritePermissionDeniedHint,
} from './secureContext'

export type DevicePickerSupport = {
	ok: boolean
	reason?: string
}

export type DirectorySelectionSupport = DevicePickerSupport & {
	mode?: 'picker' | 'input'
}

type CollectFilesOptions = {
	maxFiles?: number
	signal?: AbortSignal
}

type ShowDirectoryPicker = (options?: { mode?: 'read' | 'readwrite'; startIn?: FileSystemHandle | string }) => Promise<FileSystemDirectoryHandle>

export function getDevicePickerSupport(): DevicePickerSupport {
	if (typeof window === 'undefined') {
		return { ok: false, reason: directoryPickerEnvironmentUnavailableReason() }
	}
	const picker = (window as typeof window & { showDirectoryPicker?: ShowDirectoryPicker }).showDirectoryPicker
	if (!picker) {
		return { ok: false, reason: directoryPickerUnsupportedBrowserReason() }
	}
	if (!window.isSecureContext) {
		return { ok: false, reason: directoryPickerInsecureOriginReason() }
	}
	return { ok: true }
}

export function getDirectorySelectionSupport(): DirectorySelectionSupport {
	const pickerSupport = getDevicePickerSupport()
	if (pickerSupport.ok) return { ok: true, mode: 'picker' }
	if (typeof document !== 'undefined') {
		const input = document.createElement('input') as HTMLInputElement & { webkitdirectory?: boolean }
		if ('webkitdirectory' in input) {
			return { ok: true, mode: 'input' }
		}
	}
	return pickerSupport
}

export async function pickDirectory(mode: 'read' | 'readwrite' = 'read'): Promise<FileSystemDirectoryHandle> {
	const support = getDevicePickerSupport()
	if (!support.ok) {
		throw new Error(support.reason ?? directoryPickerUnavailableHint())
	}
	const picker = (window as typeof window & { showDirectoryPicker?: ShowDirectoryPicker }).showDirectoryPicker
	if (!picker) {
		throw new Error(directoryPickerUnavailableHint())
	}
	return picker({ mode })
}

export async function ensureReadWritePermission(handle: FileSystemDirectoryHandle): Promise<void> {
	const query = await handle.queryPermission({ mode: 'readwrite' })
	if (query === 'granted') return
	const granted = await handle.requestPermission({ mode: 'readwrite' })
	if (granted !== 'granted') {
		throw new Error(localFolderWritePermissionDeniedHint())
	}
}

export async function collectFilesFromDirectoryHandle(
	handle: FileSystemDirectoryHandle,
	prefix = '',
	options: CollectFilesOptions = {},
): Promise<File[]> {
	const items: File[] = []
	options.signal?.throwIfAborted()
	await collectFilesFromDirectoryHandleInto(
		handle,
		prefix,
		items,
		options.maxFiles ?? Number.POSITIVE_INFINITY,
		options.signal,
	)
	options.signal?.throwIfAborted()
	return items
}

async function collectFilesFromDirectoryHandleInto(
	handle: FileSystemDirectoryHandle,
	prefix: string,
	items: File[],
	maxFiles: number,
	signal?: AbortSignal,
): Promise<void> {
	signal?.throwIfAborted()
	for await (const [name, entry] of handle.entries()) {
		signal?.throwIfAborted()
		if (entry.kind === 'file') {
			if (items.length >= maxFiles) {
				throw new Error(`Selected folder exceeds the ${maxFiles} file safety limit.`)
			}
			const fileHandle = entry as FileSystemFileHandle
			const file = await fileHandle.getFile()
			signal?.throwIfAborted()
			const fileWithPath = file as File & { relativePath?: string }
			fileWithPath.relativePath = `${prefix}${name}`
			items.push(fileWithPath)
			continue
		}
		const dir = entry as FileSystemDirectoryHandle
		const nextPrefix = `${prefix}${name}/`
		await collectFilesFromDirectoryHandleInto(dir, nextPrefix, items, maxFiles, signal)
	}
}

export function normalizeRelativePath(value: string): string {
	return value.replace(/\\/g, '/').replace(/^\/+/, '')
}

export async function getFileHandleForPath(
	root: FileSystemDirectoryHandle,
	relativePath: string,
): Promise<FileSystemFileHandle> {
	const normalized = normalizeRelativePath(relativePath)
	const parts = normalized.split('/').filter(Boolean)
	if (parts.length === 0) {
		throw new Error('Invalid file path.')
	}
	const filename = parts.pop() as string
	let dir = root
	for (const part of parts) {
		dir = await dir.getDirectoryHandle(part, { create: true })
	}
	return dir.getFileHandle(filename, { create: true })
}

export async function writeResponseToFile(args: {
	response: Response
	fileHandle: FileSystemFileHandle
	signal?: AbortSignal
	onProgress?: (stats: { loadedBytes: number; totalBytes?: number }) => void
}): Promise<void> {
	const { response, fileHandle, signal, onProgress } = args
	// File writes commit only after a complete, non-aborted response. Canceling a
	// stalled reader also releases the network stream after mobile suspension.
	signal?.throwIfAborted()
	const totalBytes = parseContentLength(response.headers.get('content-length'))
	const writable = await fileHandle.createWritable()
	let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
	let loadedBytes = 0
	const onAbort = () => { void reader?.cancel().catch(() => {}) }
	signal?.addEventListener('abort', onAbort, { once: true })
	try {
		signal?.throwIfAborted()
		if (!response.body) {
			// A null body represents an empty response, not a reason to allocate
			// an unbounded fallback Blob in a supposedly streaming path.
			if (totalBytes && totalBytes > 0) throw new Error('Download body is missing. Retry using the browser download.')
		} else {
			reader = response.body.getReader()
			while (true) {
				signal?.throwIfAborted()
				const { done, value } = await reader.read()
				signal?.throwIfAborted()
				if (done) break
				if (value) {
					loadedBytes += value.byteLength
					await writable.write(value)
					onProgress?.({ loadedBytes, totalBytes })
				}
			}
		}
		signal?.throwIfAborted()
		// Fetch may transparently decode compressed responses. Compare byte
		// counts only when Content-Length describes the bytes being written.
		if (!response.headers.get('content-encoding') && totalBytes !== undefined && loadedBytes !== totalBytes) {
			throw new Error('Download ended before the expected file size was received.')
		}
		await writable.close()
	} catch (error) {
		try { await reader?.cancel() } catch { /* preserve the original error */ }
		try { await writable.abort() } catch { /* preserve the original error */ }
		throw error
	} finally {
		signal?.removeEventListener('abort', onAbort)
		reader?.releaseLock()
	}
}

function parseContentLength(value: string | null): number | undefined {
	if (!value) return undefined
	const parsed = Number.parseInt(value, 10)
	if (!Number.isFinite(parsed) || parsed < 0) return undefined
	return parsed
}
