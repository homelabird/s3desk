import type { UploadFileItem } from '../../api/client'
import type { UploadTask } from './transferTypes'
import { buildUploadItems, promptForFiles } from './transfersUploadUtils'
import { normalizeRelPath } from './uploadPaths'

type RetryUploadSelection = {
	filePaths: string[]
	items: UploadFileItem[]
	resumeFileSize?: number
	totalBytes: number
}

type RetryUploadSelectionResult =
	| { ok: true; selection: RetryUploadSelection }
	| { ok: false; canceled: true }
	| { ok: false; error: string }

type ResolveRetryUploadItemsArgs = {
	task: UploadTask
}

export async function resolveRetryUploadItems({ task }: ResolveRetryUploadItemsArgs): Promise<RetryUploadSelectionResult> {
	const resumeFiles = task.resumeFiles ?? []
	const expectedPaths = (resumeFiles.length > 0 ? resumeFiles.map((f) => f.path) : task.filePaths ?? [])
		.map(normalizeRelPath)
		.filter(Boolean)
	const expectDirectory = expectedPaths.some((p) => p.includes('/'))
	const selected = await promptForFiles({
		multiple: task.fileCount > 1 || expectDirectory,
		directory: expectDirectory,
	})
	if (!selected) return { ok: false, canceled: true }

	const selectedItems = buildUploadItems(selected, {
		directorySelectionMode: expectDirectory ? 'input' : undefined,
	})
	let items: UploadFileItem[]
	if (expectedPaths.length > 0) {
		const selectedByPath = new Map(
			selectedItems.map((item) => [normalizeRelPath(item.relPath ?? item.file.name), item]),
		)
		const resumeFilesByPath = new Map(resumeFiles.map((file) => [normalizeRelPath(file.path), file]))
		const matched: UploadFileItem[] = []
		const missing: string[] = []
		for (const path of expectedPaths) {
			const found = selectedByPath.get(path)
			if (!found) {
				missing.push(path)
				continue
			}
			const resume = resumeFilesByPath.get(path)
			if (resume && found.file?.size !== resume.size) {
				missing.push(path)
				continue
			}
			matched.push(found)
		}
		if (missing.length > 0) {
			return { ok: false, error: `Missing ${missing.length} file(s). Select the same files or folder to resume.` }
		}
		items = matched
	} else {
		items = selectedItems
	}

	const totalBytes = items.reduce((sum, item) => sum + (item.file?.size ?? 0), 0)
	if (task.resumeFileSize && items.length === 1 && items[0]?.file?.size !== task.resumeFileSize) {
		return { ok: false, error: 'Selected file size does not match the previous upload.' }
	}

	return {
		ok: true,
		selection: {
			items,
			totalBytes,
			filePaths: items.map((item) => normalizeRelPath(item.relPath ?? item.file.name)).filter(Boolean),
			resumeFileSize: items.length === 1 ? items[0]?.file?.size ?? 0 : undefined,
		},
	}
}
