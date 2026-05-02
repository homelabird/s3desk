import type { MutableRefObject } from 'react'

import type { UploadFileItem } from '../../api/client'
import type { UploadTask } from './transferTypes'
import { resolveUploadItemPath } from './uploadPaths'
import { createLocalVideoUploadPreview, isVideoUploadFile, revokeObjectURLSafe } from './uploadPreview'

type QueueLocalUploadPreviewArgs = {
	items: UploadFileItem[]
	taskId: string
	updateUploadTask: (taskId: string, updater: (task: UploadTask) => UploadTask) => void
	uploadPreviewUrlByTaskIdRef: MutableRefObject<Record<string, string>>
	uploadTasksRef: MutableRefObject<UploadTask[]>
}

export function queueLocalUploadPreview({
	items,
	taskId,
	updateUploadTask,
	uploadPreviewUrlByTaskIdRef,
	uploadTasksRef,
}: QueueLocalUploadPreviewArgs): Promise<void> | undefined {
	const previewItem = items.find((item) => isVideoUploadFile(item.file))
	if (!previewItem) return undefined

	return createLocalVideoUploadPreview(previewItem.file, { label: resolveUploadItemPath(previewItem) })
		.then((preview) => {
			if (!preview) return
			if (!uploadTasksRef.current.some((entry) => entry.id === taskId)) {
				revokeObjectURLSafe(preview.url)
				return
			}
			uploadPreviewUrlByTaskIdRef.current[taskId] = preview.url
			updateUploadTask(taskId, (current) => ({ ...current, preview }))
		})
		.catch(() => undefined)
}
