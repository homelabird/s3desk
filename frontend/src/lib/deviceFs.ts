export type DevicePickerSupport = {
	ok: boolean
	reason?: string
}

export type DirectorySelectionSupport = DevicePickerSupport & {
	mode?: 'picker' | 'input'
}

type ShowDirectoryPicker = (options?: { mode?: 'read' | 'readwrite'; startIn?: FileSystemHandle | string }) => Promise<FileSystemDirectoryHandle>

export function getDevicePickerSupport(): DevicePickerSupport {
	if (typeof window === 'undefined') {
		return { ok: false, reason: 'Directory picker is not available in this environment.' }
	}
	const picker = (window as typeof window & { showDirectoryPicker?: ShowDirectoryPicker }).showDirectoryPicker
	if (!picker) {
		return { ok: false, reason: 'Directory picker is not supported in this browser.' }
	}
	if (!window.isSecureContext) {
		return { ok: false, reason: 'Directory picker requires HTTPS or localhost.' }
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
		throw new Error(support.reason ?? 'Directory picker is not available.')
	}
	const picker = (window as typeof window & { showDirectoryPicker?: ShowDirectoryPicker }).showDirectoryPicker
	if (!picker) {
		throw new Error('Directory picker is not available.')
	}
	return picker({ mode })
}

export async function ensureReadWritePermission(handle: FileSystemDirectoryHandle): Promise<void> {
	const query = await handle.queryPermission({ mode: 'readwrite' })
	if (query === 'granted') return
	const granted = await handle.requestPermission({ mode: 'readwrite' })
	if (granted !== 'granted') {
		throw new Error('Permission to write to the selected folder was denied.')
	}
}

export async function collectFilesFromDirectoryHandle(
	handle: FileSystemDirectoryHandle,
	prefix = '',
): Promise<File[]> {
	const items: File[] = []
	for await (const [name, entry] of handle.entries()) {
		if (entry.kind === 'file') {
			const fileHandle = entry as FileSystemFileHandle
			const file = await fileHandle.getFile()
			const fileWithPath = file as File & { relativePath?: string }
			fileWithPath.relativePath = `${prefix}${name}`
			items.push(fileWithPath)
			continue
		}
		const dir = entry as FileSystemDirectoryHandle
		const nextPrefix = `${prefix}${name}/`
		const nested = await collectFilesFromDirectoryHandle(dir, nextPrefix)
		items.push(...nested)
	}
	return items
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
	const totalBytes = parseContentLength(response.headers.get('content-length'))
	const writable = await fileHandle.createWritable()
	let loadedBytes = 0

	try {
		if (!response.body) {
			const blob = await response.blob()
			await writable.write(blob)
			loadedBytes = blob.size
			onProgress?.({ loadedBytes, totalBytes: totalBytes ?? blob.size })
			await writable.close()
			return
		}

		const reader = response.body.getReader()
		while (true) {
			if (signal?.aborted) {
				throw new DOMException('Aborted', 'AbortError')
			}
			const { done, value } = await reader.read()
			if (done) break
			if (value) {
				loadedBytes += value.byteLength
				await writable.write(value)
				onProgress?.({ loadedBytes, totalBytes })
			}
		}

		await writable.close()
	} catch (err) {
		if (typeof (writable as { abort?: () => Promise<void> }).abort === 'function') {
			try {
				await (writable as { abort: () => Promise<void> }).abort()
			} catch {
				// ignore
			}
		}
		throw err
	}
}

function parseContentLength(value: string | null): number | undefined {
	if (!value) return undefined
	const parsed = Number.parseInt(value, 10)
	if (!Number.isFinite(parsed) || parsed < 0) return undefined
	return parsed
}
