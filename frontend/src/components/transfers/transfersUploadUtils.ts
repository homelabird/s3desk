import type { UploadCommitRequest, UploadFileItem } from '../../api/client'
import { collectFilesFromDirectoryHandle, getDirectorySelectionSupport, pickDirectory } from '../../lib/deviceFs'
import type { UploadTask } from './transferTypes'
import { normalizeUploadPath } from './uploadPaths'

type UploadPathFile = File & {
	webkitRelativePath?: string
	relativePath?: string
}

export const promptForFiles = (args: { multiple: boolean; directory: boolean }): Promise<File[] | null> =>
	new Promise((resolve) => {
		const input = document.createElement('input')
		input.type = 'file'
		input.multiple = args.multiple
		if (args.directory) {
			;(input as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory = true
		}
		input.style.display = 'none'
		const cleanup = () => {
			input.remove()
		}
		input.addEventListener('change', () => {
			const files = input.files ? Array.from(input.files) : []
			cleanup()
			resolve(files.length ? files : null)
		})
		document.body.appendChild(input)
		input.click()
	})

export type FolderSelectionResult = {
	files: File[]
	label?: string
	mode: 'picker' | 'input'
}

function stripSharedBrowserDirectoryRoot(paths: string[]): string[] {
	if (paths.length === 0) return paths
	const normalized = paths.map((path) => normalizeUploadPath(path))
	if (normalized.some((path) => !path.includes('/'))) return normalized
	const roots = Array.from(new Set(normalized.map((path) => path.split('/').filter(Boolean)[0]).filter(Boolean)))
	if (roots.length !== 1) return normalized
	return normalized.map((path) => {
		const parts = path.split('/').filter(Boolean)
		if (parts.length <= 1) return path
		return parts.slice(1).join('/')
	})
}

function deriveFolderSelectionLabel(files: File[]): string | undefined {
	const first = files[0] as (File & { webkitRelativePath?: string; relativePath?: string }) | undefined
	const raw = (first?.relativePath ?? first?.webkitRelativePath ?? '').trim()
	const root = raw.split('/').filter(Boolean)[0]
	return root || undefined
}

export async function promptForFolderFiles(): Promise<FolderSelectionResult | null> {
	const support = getDirectorySelectionSupport()
	if (!support.ok || !support.mode) {
		throw new Error(support.reason ?? 'Folder selection is not supported in this browser.')
	}
	if (support.mode === 'picker') {
		const handle = await pickDirectory('read')
		const files = await collectFilesFromDirectoryHandle(handle)
		return files.length > 0 ? { files, label: handle.name, mode: 'picker' } : null
	}
	const files = await promptForFiles({ multiple: true, directory: true })
	return files && files.length > 0 ? { files, label: deriveFolderSelectionLabel(files), mode: 'input' } : null
}

export const buildUploadItems = (files: File[], args: { directorySelectionMode?: 'picker' | 'input' } = {}): UploadFileItem[] => {
	const rawPaths = files.map((file) => {
		const fileWithPath = file as UploadPathFile
		return (fileWithPath.relativePath ?? fileWithPath.webkitRelativePath ?? '').trim()
	})
	const strippedBrowserPaths = args.directorySelectionMode === 'input' ? stripSharedBrowserDirectoryRoot(rawPaths) : rawPaths
	return files.map((file, index) => {
		const fileWithPath = file as UploadPathFile
		const relPathRaw =
			args.directorySelectionMode === 'input'
				? (strippedBrowserPaths[index] ?? '').trim()
				: (fileWithPath.relativePath ?? fileWithPath.webkitRelativePath ?? '').trim()
		return { file, relPath: relPathRaw || file.name }
	})
}

const maxUploadCommitItems = 200

type UploadCommitNormalizedItem = {
	path: string
	size: number
}

function deriveUploadRoot(paths: string[]): { rootKind?: 'file' | 'folder' | 'collection'; rootName?: string } {
	if (paths.length === 0) return {}
	if (paths.length === 1) {
		const parts = paths[0].split('/').filter(Boolean)
		if (parts.length === 1) return { rootKind: 'file', rootName: parts[0] }
		return { rootKind: 'folder', rootName: parts[0] }
	}
	const roots = Array.from(new Set(paths.map((path) => path.split('/')[0]).filter(Boolean)))
	if (roots.length === 1) {
		return { rootKind: 'folder', rootName: roots[0] }
	}
	return { rootKind: 'collection' }
}

export function buildUploadCommitRequest(task: UploadTask, items: UploadFileItem[]): UploadCommitRequest | undefined {
	const normalizedItems: UploadCommitNormalizedItem[] = []
	for (const item of items) {
		const fileWithPath = item.file as File & { webkitRelativePath?: string; relativePath?: string }
		const rawPath = (item.relPath ?? fileWithPath.webkitRelativePath ?? fileWithPath.relativePath ?? item.file.name).trim()
		const path = normalizeUploadPath(rawPath)
		if (!path) continue
		const size = Number.isFinite(item.file.size) ? item.file.size : 0
		normalizedItems.push({ path, size })
	}
	if (normalizedItems.length === 0) return undefined

	const totalFiles = normalizedItems.length
	const totalBytes = normalizedItems.reduce((sum, item) => sum + item.size, 0)
	const root = deriveUploadRoot(normalizedItems.map((item) => item.path))
	const sample = normalizedItems.slice(0, maxUploadCommitItems).map((item) => ({ path: item.path, size: item.size }))
	const itemsTruncated = normalizedItems.length > maxUploadCommitItems

	const label = task.label?.trim()
	return {
		label: label || undefined,
		rootName: root.rootName,
		rootKind: root.rootKind,
		totalFiles,
		totalBytes,
		items: sample,
		itemsTruncated: itemsTruncated || undefined,
	}
}
