import { describe, expect, it, vi } from 'vitest'

import type { UploadFileItem } from '../../../api/client'
import { TransferEstimator } from '../../../lib/transfer'
import type { UploadTask } from '../transferTypes'
import { executeUploadAttempt } from '../uploadRuntimeAttempt'

const { uploadPresignedFilesWithProgressMock } = vi.hoisted(() => ({
	uploadPresignedFilesWithProgressMock: vi.fn(),
}))

vi.mock('../presignedUpload', () => ({
	uploadPresignedFilesWithProgress: (...args: unknown[]) => uploadPresignedFilesWithProgressMock(...args),
}))

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

function uploadTask(overrides: Partial<UploadTask> = {}): UploadTask {
	return {
		id: 'upload-1',
		profileId: 'profile-1',
		bucket: 'bucket-a',
		prefix: 'docs/',
		fileCount: 1,
		status: 'staging',
		createdAtMs: 1,
		loadedBytes: 0,
		totalBytes: 256,
		speedBps: 0,
		etaSeconds: 0,
		label: 'Upload',
		...overrides,
	}
}

function uploadItem(name = 'folder/report.bin', size = 256): UploadFileItem {
	return {
		file: new File(['x'.repeat(size)], name),
		relPath: name,
	}
}

describe('executeUploadAttempt', () => {
	it('executes direct/staging uploads with resume tracking, progress, and abort cleanup', async () => {
		const item = uploadItem()
		const task = uploadTask()
		const uploadResult = deferred<{ skipped: number }>()
		const abort = vi.fn()
		const uploadFilesWithProgress = vi.fn().mockReturnValue({
			abort,
			promise: uploadResult.promise,
		})
		const updateUploadTask = vi.fn()
		const uploadAbortByTaskIdRef = { current: {} as Record<string, () => void> }

		const attempt = executeUploadAttempt({
			api: {
				uploads: { uploadFilesWithProgress },
			} as never,
			taskId: 'upload-1',
			task,
			uploadId: 'session-1',
			mode: 'direct',
			items: [item],
			tuning: {
				batchConcurrency: 3,
				batchBytes: 1024,
				chunkSizeBytes: 64,
				chunkConcurrency: 2,
				chunkThresholdBytes: 128,
			},
			resumeFilesByPath: new Map([['folder/report.bin', { size: item.file.size, chunkSizeBytes: 32 }]]),
			resumeChunkSizeBytes: 32,
			allowPerFileChunkSize: false,
			existingChunksByPath: { 'folder/report.bin': [0] },
			uploadChunkFileConcurrency: 4,
			uploadAbortByTaskIdRef,
			uploadEstimatorByTaskIdRef: {
				current: {
					'upload-1': new TransferEstimator({ totalBytes: item.file.size, startedAtMs: Date.now() - 1_000 }),
				},
			},
			updateUploadTask,
		})

		expect(uploadAbortByTaskIdRef.current['upload-1']).toBe(abort)
		expect(uploadFilesWithProgress).toHaveBeenCalledWith('profile-1', 'session-1', [item], {
			onProgress: expect.any(Function),
			concurrency: 3,
			maxBatchBytes: 1024,
			maxBatchItems: 50,
			chunkSizeBytes: 32,
			chunkConcurrency: 2,
			chunkThresholdBytes: 128,
			existingChunksByPath: { 'folder/report.bin': [0] },
			chunkSizeBytesByPath: undefined,
			chunkFileConcurrency: 4,
		})

		const initialTask = updateUploadTask.mock.calls[0][1](task)
		expect(initialTask).toMatchObject({
			uploadId: 'session-1',
			uploadMode: 'direct',
			resumeChunkSizeBytes: 32,
			resumeFileSize: item.file.size,
			resumeFiles: [{ path: 'folder/report.bin', size: item.file.size, chunkSizeBytes: 32 }],
		})

		const options = uploadFilesWithProgress.mock.calls[0][3]
		options.onProgress({ loadedBytes: 128, totalBytes: item.file.size })
		const progressTask = updateUploadTask.mock.calls[1][1](task)
		expect(progressTask).toMatchObject({
			loadedBytes: 128,
			totalBytes: item.file.size,
		})

		uploadResult.resolve({ skipped: 0 })
		await expect(attempt).resolves.toEqual({ skipped: 0 })
		expect(uploadAbortByTaskIdRef.current['upload-1']).toBeUndefined()
	})

	it('routes presigned uploads through the presigned uploader without resume metadata', async () => {
		const item = uploadItem()
		const task = uploadTask()
		const abort = vi.fn()
		const updateUploadTask = vi.fn()
		uploadPresignedFilesWithProgressMock.mockReturnValue({
			abort,
			promise: Promise.resolve({ skipped: 0 }),
		})

		await executeUploadAttempt({
			api: { uploads: { uploadFilesWithProgress: vi.fn() } } as never,
			taskId: 'upload-1',
			task,
			uploadId: 'session-1',
			mode: 'presigned',
			items: [item],
			tuning: {
				batchConcurrency: 3,
				batchBytes: 1024,
				chunkSizeBytes: 64,
				chunkConcurrency: 2,
				chunkThresholdBytes: 128,
			},
			resumeFilesByPath: new Map([['folder/report.bin', { size: item.file.size, chunkSizeBytes: 32 }]]),
			resumeChunkSizeBytes: 32,
			allowPerFileChunkSize: false,
			uploadChunkFileConcurrency: 4,
			uploadAbortByTaskIdRef: { current: {} },
			uploadEstimatorByTaskIdRef: { current: {} },
			updateUploadTask,
		})

		expect(uploadPresignedFilesWithProgressMock).toHaveBeenCalledWith({
			api: expect.any(Object),
			profileId: 'profile-1',
			uploadId: 'session-1',
			items: [item],
			onProgress: expect.any(Function),
			singleConcurrency: 3,
			multipartFileConcurrency: 4,
			partConcurrency: 2,
			chunkThresholdBytes: 128,
			chunkSizeBytes: 32,
		})
		const initialTask = updateUploadTask.mock.calls[0][1](task)
		expect(initialTask).toMatchObject({
			uploadId: 'session-1',
			uploadMode: 'presigned',
			resumeChunkSizeBytes: undefined,
			resumeFiles: undefined,
		})
	})
})
