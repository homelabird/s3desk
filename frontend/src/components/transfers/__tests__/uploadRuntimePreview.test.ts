import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { UploadTask } from '../transferTypes'
import { queueLocalUploadPreview } from '../uploadRuntimePreview'

const {
	createLocalVideoUploadPreviewMock,
	isVideoUploadFileMock,
	revokeObjectURLSafeMock,
} = vi.hoisted(() => ({
	createLocalVideoUploadPreviewMock: vi.fn(),
	isVideoUploadFileMock: vi.fn(),
	revokeObjectURLSafeMock: vi.fn(),
}))

vi.mock('../uploadPreview', async () => {
	const actual = await vi.importActual<typeof import('../uploadPreview')>('../uploadPreview')
	return {
		...actual,
		createLocalVideoUploadPreview: (...args: unknown[]) => createLocalVideoUploadPreviewMock(...args),
		isVideoUploadFile: (...args: unknown[]) => isVideoUploadFileMock(...args),
		revokeObjectURLSafe: (...args: unknown[]) => revokeObjectURLSafeMock(...args),
	}
})

function createUploadTask(overrides: Partial<UploadTask> = {}): UploadTask {
	return {
		id: 'upload-1',
		profileId: 'profile-1',
		bucket: 'bucket-a',
		prefix: 'docs/',
		fileCount: 1,
		status: 'queued',
		createdAtMs: 1,
		loadedBytes: 0,
		totalBytes: 128,
		speedBps: 0,
		etaSeconds: 0,
		label: 'Upload: clip.mp4',
		filePaths: ['clip.mp4'],
		resumeFileSize: 128,
		...overrides,
	}
}

function createUploadItem(name = 'clip.mp4', size = 128, type = 'video/mp4') {
	return {
		file: new File(['x'.repeat(size)], name, { type }),
		relPath: name,
	}
}

describe('queueLocalUploadPreview', () => {
	beforeEach(() => {
		createLocalVideoUploadPreviewMock.mockReset()
		isVideoUploadFileMock.mockReset()
		revokeObjectURLSafeMock.mockReset()
	})

	it('attaches generated previews to live upload tasks', async () => {
		const item = createUploadItem()
		const task = createUploadTask()
		const updateUploadTask = vi.fn((_taskId: string, updater: (task: UploadTask) => UploadTask) => updater(task))
		const uploadPreviewUrlByTaskIdRef = { current: {} as Record<string, string> }
		const uploadTasksRef = { current: [task] }
		isVideoUploadFileMock.mockReturnValue(true)
		createLocalVideoUploadPreviewMock.mockResolvedValue({
			kind: 'video_frame',
			source: 'local',
			url: 'blob:preview',
			label: 'clip.mp4',
			width: 240,
			height: 135,
		})

		await queueLocalUploadPreview({
			items: [item],
			taskId: task.id,
			updateUploadTask,
			uploadPreviewUrlByTaskIdRef,
			uploadTasksRef,
		})

		expect(uploadPreviewUrlByTaskIdRef.current).toEqual({ [task.id]: 'blob:preview' })
		expect(updateUploadTask).toHaveBeenCalledTimes(1)
		expect(revokeObjectURLSafeMock).not.toHaveBeenCalled()
	})

	it('reclaims generated previews when the upload task disappeared', async () => {
		const item = createUploadItem()
		const updateUploadTask = vi.fn()
		const uploadPreviewUrlByTaskIdRef = { current: {} as Record<string, string> }
		const uploadTasksRef = { current: [] as UploadTask[] }
		isVideoUploadFileMock.mockReturnValue(true)
		createLocalVideoUploadPreviewMock.mockResolvedValue({
			kind: 'video_frame',
			source: 'local',
			url: 'blob:stale-preview',
			label: 'clip.mp4',
			width: 240,
			height: 135,
		})

		await queueLocalUploadPreview({
			items: [item],
			taskId: 'upload-missing',
			updateUploadTask,
			uploadPreviewUrlByTaskIdRef,
			uploadTasksRef,
		})

		expect(revokeObjectURLSafeMock).toHaveBeenCalledWith('blob:stale-preview')
		expect(uploadPreviewUrlByTaskIdRef.current).toEqual({})
		expect(updateUploadTask).not.toHaveBeenCalled()
	})

	it('skips non-video upload items', () => {
		isVideoUploadFileMock.mockReturnValue(false)

		const result = queueLocalUploadPreview({
			items: [createUploadItem('report.txt', 32, 'text/plain')],
			taskId: 'upload-1',
			updateUploadTask: vi.fn(),
			uploadPreviewUrlByTaskIdRef: { current: {} },
			uploadTasksRef: { current: [createUploadTask()] },
		})

		expect(result).toBeUndefined()
		expect(createLocalVideoUploadPreviewMock).not.toHaveBeenCalled()
	})
})
