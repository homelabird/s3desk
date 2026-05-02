import { describe, expect, it, vi } from 'vitest'

import type { UploadTask } from '../transferTypes'
import { runUploadAttemptWithNetworkFallback } from '../uploadRuntimeFallback'

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
		totalBytes: 128,
		speedBps: 0,
		etaSeconds: 0,
		label: 'Upload',
		...overrides,
	}
}

function presignedNetworkError() {
	const error = new Error('presigned upload failed')
	error.name = 'PresignedUploadNetworkError'
	return error
}

describe('runUploadAttemptWithNetworkFallback', () => {
	it('returns the initial upload attempt result when no fallback is needed', async () => {
		const runUploadAttempt = vi.fn().mockResolvedValue({ skipped: 1 })
		const deleteUpload = vi.fn()
		const createUpload = vi.fn()

		await expect(
			runUploadAttemptWithNetworkFallback({
				api: { uploads: { deleteUpload, createUpload } } as never,
				task: uploadTask(),
				uploadId: 'presigned-upload',
				sessionMode: 'presigned',
				fallbackMode: 'direct',
				runUploadAttempt,
			}),
		).resolves.toEqual({ skipped: 1 })

		expect(runUploadAttempt).toHaveBeenCalledWith('presigned', 'presigned-upload')
		expect(deleteUpload).not.toHaveBeenCalled()
		expect(createUpload).not.toHaveBeenCalled()
	})

	it('falls back to the planned mode after presigned network path failures', async () => {
		const runUploadAttempt = vi
			.fn()
			.mockRejectedValueOnce(presignedNetworkError())
			.mockResolvedValueOnce({ skipped: 0 })
		const deleteUpload = vi.fn().mockResolvedValue(undefined)
		const createUpload = vi.fn().mockResolvedValue({
			uploadId: 'fallback-upload',
			mode: 'direct',
			maxBytes: null,
		})
		const onFallbackSessionReady = vi.fn()
		const onNetworkFallback = vi.fn()

		await expect(
			runUploadAttemptWithNetworkFallback({
				api: { uploads: { deleteUpload, createUpload } } as never,
				task: uploadTask(),
				uploadId: 'presigned-upload',
				sessionMode: 'presigned',
				fallbackMode: 'direct',
				runUploadAttempt,
				onFallbackSessionReady,
				onNetworkFallback,
			}),
		).resolves.toEqual({ skipped: 0 })

		expect(deleteUpload).toHaveBeenCalledWith('profile-1', 'presigned-upload')
		expect(createUpload).toHaveBeenCalledWith('profile-1', {
			bucket: 'bucket-a',
			prefix: 'docs/',
			mode: 'direct',
		})
		expect(onFallbackSessionReady).toHaveBeenCalledWith({
			uploadId: 'fallback-upload',
			mode: 'direct',
			maxBytes: null,
		})
		expect(onNetworkFallback).toHaveBeenCalledWith({
			uploadId: 'fallback-upload',
			mode: 'direct',
			maxBytes: null,
		})
		expect(runUploadAttempt).toHaveBeenNthCalledWith(1, 'presigned', 'presigned-upload')
		expect(runUploadAttempt).toHaveBeenNthCalledWith(2, 'direct', 'fallback-upload', undefined)
	})

	it('rethrows non-presigned-attempt errors without creating fallback sessions', async () => {
		const error = new Error('direct upload failed')
		const runUploadAttempt = vi.fn().mockRejectedValue(error)
		const deleteUpload = vi.fn()
		const createUpload = vi.fn()

		await expect(
			runUploadAttemptWithNetworkFallback({
				api: { uploads: { deleteUpload, createUpload } } as never,
				task: uploadTask(),
				uploadId: 'direct-upload',
				sessionMode: 'direct',
				fallbackMode: 'staging',
				runUploadAttempt,
			}),
		).rejects.toBe(error)

		expect(deleteUpload).not.toHaveBeenCalled()
		expect(createUpload).not.toHaveBeenCalled()
	})
})
