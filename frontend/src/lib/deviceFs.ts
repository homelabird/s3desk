export type DevicePickerSupport = {
	ok: boolean
	reason?: string
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

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
	const support = getDevicePickerSupport()
	if (!support.ok) {
		throw new Error(support.reason ?? 'Directory picker is not available.')
	}
	const picker = (window as typeof window & { showDirectoryPicker?: ShowDirectoryPicker }).showDirectoryPicker
	if (!picker) {
		throw new Error('Directory picker is not available.')
	}
	return picker({ mode: 'readwrite' })
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

export type RemoveEntriesResult = {
	removed: string[]
	skipped: string[]
	failed: string[]
	removedDirs: string[]
}

export async function removeEntriesFromDirectoryHandle(args: {
	root: FileSystemDirectoryHandle
	relPaths: string[]
	cleanupEmptyDirs?: boolean
}): Promise<RemoveEntriesResult> {
	const { root, relPaths, cleanupEmptyDirs } = args
	await ensureReadWritePermission(root)

	const unique = new Set(relPaths.map((p) => normalizeRelativePath(p)).filter(Boolean))
	const removed: string[] = []
	const skipped: string[] = []
	const failed: string[] = []
	const removedDirs: string[] = []

	for (const relPath of unique) {
		const parts = relPath.split('/').filter(Boolean)
		if (parts.length === 0 || parts.some((p) => p === '..')) {
			skipped.push(relPath)
			continue
		}
		const name = parts.pop() as string
		let dir = root
		try {
			for (const part of parts) {
				dir = await dir.getDirectoryHandle(part)
			}
			await dir.removeEntry(name)
			removed.push(relPath)
		} catch (err) {
			const error = err as DOMException
			if (error?.name === 'NotFoundError') {
				skipped.push(relPath)
				continue
			}
			failed.push(relPath)
		}
	}

	if (cleanupEmptyDirs && removed.length > 0) {
		removedDirs.push(...(await pruneEmptyDirectories(root, removed)))
	}

	return { removed, skipped, failed, removedDirs }
}

async function pruneEmptyDirectories(root: FileSystemDirectoryHandle, removedPaths: string[]): Promise<string[]> {
	const candidates = new Set<string>()
	for (const relPath of removedPaths) {
		const parts = normalizeRelativePath(relPath).split('/').filter(Boolean)
		if (parts.length < 2) continue
		parts.pop()
		for (let i = parts.length; i > 0; i--) {
			candidates.add(parts.slice(0, i).join('/'))
		}
	}

	const sorted = Array.from(candidates).sort((a, b) => b.split('/').length - a.split('/').length)
	const removedDirs: string[] = []
	for (const dirPath of sorted) {
		if (!dirPath) continue
		try {
			const parts = dirPath.split('/').filter(Boolean)
			const name = parts.pop() as string
			let parent = root
			for (const part of parts) {
				parent = await parent.getDirectoryHandle(part)
			}
			const dir = await parent.getDirectoryHandle(name)
			if (!(await isDirectoryEmpty(dir))) continue
			await parent.removeEntry(name)
			removedDirs.push(dirPath)
		} catch {
			// ignore
		}
	}
	return removedDirs
}

async function isDirectoryEmpty(dir: FileSystemDirectoryHandle): Promise<boolean> {
	for await (const _ of dir.entries()) {
		return false
	}
	return true
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
