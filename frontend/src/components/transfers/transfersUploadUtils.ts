import type { UploadCommitRequest, UploadFileItem } from '../../api/client'
import type { UploadTask } from './transferTypes'
import { normalizeUploadPath } from './uploadPaths'

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

export const buildUploadItems = (files: File[]): UploadFileItem[] =>
	files.map((file) => {
		const fileWithPath = file as File & { webkitRelativePath?: string; relativePath?: string }
		const relPathRaw = (fileWithPath.webkitRelativePath ?? fileWithPath.relativePath ?? '').trim()
		return { file, relPath: relPathRaw || file.name }
	})

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
