import type { UploadFileItem } from '../../api/client'
import type { UploadTask } from './transferTypes'
import type { QueueUploadFilesArgs } from './transfersTypes'
import { buildUploadItems } from './transfersUploadUtils'
import { normalizeRelPath } from './uploadPaths'

export function buildQueuedUpload(args: { taskId: string; queueArgs: QueueUploadFilesArgs }): {
	items: UploadFileItem[]
	task: UploadTask
} | null {
	const files = args.queueArgs.files.filter((file) => !!file)
	if (files.length === 0) return null

	const items = buildUploadItems(files)
	const totalBytes = items.reduce((sum, item) => sum + (item.file.size ?? 0), 0)
	const filePaths = items.map((item) => normalizeRelPath(item.relPath ?? item.file.name)).filter(Boolean)

	return {
		items,
		task: {
			id: args.taskId,
			profileId: args.queueArgs.profileId,
			bucket: args.queueArgs.bucket,
			prefix: args.queueArgs.prefix,
			fileCount: items.length,
			status: 'queued',
			createdAtMs: Date.now(),
			loadedBytes: 0,
			totalBytes,
			speedBps: 0,
			etaSeconds: 0,
			error: undefined,
			jobId: undefined,
			label:
				args.queueArgs.label?.trim() || (items.length === 1 ? `Upload: ${items[0]?.file?.name ?? '1 file'}` : `Upload: ${items.length} file(s)`),
			filePaths,
			resumeFileSize: items.length === 1 ? items[0]?.file?.size ?? 0 : undefined,
		},
	}
}
