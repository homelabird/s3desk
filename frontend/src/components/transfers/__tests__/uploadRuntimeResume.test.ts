import { describe, expect, it, vi } from 'vitest'

import { APIError, RequestAbortedError, type UploadFileItem } from '../../../api/client'
import { resolveExistingResumeChunks } from '../uploadRuntimeResume'

function uploadItem(name = 'folder/report.bin', size = 256): UploadFileItem {
	return {
		file: new File(['x'.repeat(size)], name),
		relPath: name,
	}
}

describe('resolveExistingResumeChunks', () => {
	it('loads present chunks for matching resumable files', async () => {
		const item = uploadItem()
		const getUploadChunks = vi.fn()
		const getUploadChunksBatch = vi.fn().mockResolvedValue({
			items: [{ path: 'folder/report.bin', present: [0, 2] }],
		})

		const result = await resolveExistingResumeChunks({
			api: { uploads: { getUploadChunks, getUploadChunksBatch } } as never,
			profileId: 'profile-1',
			uploadId: 'session-1',
			items: [item],
			resumeFilesByPath: new Map([['folder/report.bin', { size: item.file.size, chunkSizeBytes: 64 }]]),
		})

		expect(getUploadChunksBatch).toHaveBeenCalledWith('profile-1', 'session-1', { items: [{
			path: 'folder/report.bin', total: 4, chunkSize: 64, fileSize: item.file.size,
		}] }, undefined)
		expect(getUploadChunks).not.toHaveBeenCalled()
		expect(result).toEqual({
			ok: true,
			available: true,
			uploadId: 'session-1',
			existingChunksByPath: { 'folder/report.bin': [0, 2] },
		})
	})

	it('returns a user-facing size mismatch instead of probing chunks', async () => {
		const getUploadChunks = vi.fn()
		const getUploadChunksBatch = vi.fn()

		const result = await resolveExistingResumeChunks({
			api: { uploads: { getUploadChunks, getUploadChunksBatch } } as never,
			profileId: 'profile-1',
			uploadId: 'session-1',
			items: [uploadItem('folder/report.bin', 128)],
			resumeFilesByPath: new Map([['folder/report.bin', { size: 256, chunkSizeBytes: 64 }]]),
		})

		expect(getUploadChunks).not.toHaveBeenCalled()
		expect(getUploadChunksBatch).not.toHaveBeenCalled()
		expect(result).toEqual({
			ok: false,
			error: 'Selected file size does not match the previous upload.',
		})
	})

	it('falls back to single-file status calls when an older server lacks the batch route', async () => {
		const getUploadChunksBatch = vi.fn().mockRejectedValue(
			new APIError({
				status: 404,
				code: 'not_found',
				message: 'route not found',
			}),
		)
		const getUploadChunks = vi.fn().mockResolvedValue({ present: [0, 2] })

		const result = await resolveExistingResumeChunks({
			api: { uploads: { getUploadChunks, getUploadChunksBatch } } as never,
			profileId: 'profile-1',
			uploadId: 'session-1',
			items: [uploadItem()],
			resumeFilesByPath: new Map([['folder/report.bin', { size: 256, chunkSizeBytes: 64 }]]),
		})

		expect(getUploadChunks).toHaveBeenCalledWith('profile-1', 'session-1', {
			path: 'folder/report.bin', total: 4, chunkSize: 64, fileSize: 256,
		}, undefined)
		expect(result).toEqual({
			ok: true,
			available: true,
			uploadId: 'session-1',
			existingChunksByPath: { 'folder/report.bin': [0, 2] },
		})
	})

	it('preserves unavailable resume behavior when the single-file fallback returns 404', async () => {
		const notFound = new APIError({ status: 404, code: 'not_found', message: 'upload session not found' })
		const result = await resolveExistingResumeChunks({
			api: { uploads: {
				getUploadChunksBatch: vi.fn().mockRejectedValue(notFound),
				getUploadChunks: vi.fn().mockRejectedValue(notFound),
			} } as never,
			profileId: 'profile-1',
			uploadId: 'session-1',
			items: [uploadItem()],
			resumeFilesByPath: new Map([['folder/report.bin', { size: 256, chunkSizeBytes: 64 }]]),
		})

		expect(result).toEqual({ ok: true, available: false })
	})

	it('scales status request count with bounded batches instead of file count', async () => {
		const items = Array.from({ length: 205 }, (_, index) => uploadItem(`folder/file-${index}.bin`, 64))
		const resumeFilesByPath = new Map(items.map((item) => [item.relPath!, { size: 64, chunkSizeBytes: 32 }]))
		const getUploadChunks = vi.fn()
		const getUploadChunksBatch = vi.fn().mockImplementation((_profileId, _uploadId, req) => Promise.resolve({
			items: req.items.map((item: { path: string }) => ({ path: item.path, present: [0] })),
		}))

		const result = await resolveExistingResumeChunks({
			api: { uploads: { getUploadChunks, getUploadChunksBatch } } as never,
			profileId: 'profile-1',
			uploadId: 'session-1',
			items,
			resumeFilesByPath,
		})

		expect(getUploadChunksBatch).toHaveBeenCalledTimes(3)
		expect(getUploadChunksBatch.mock.calls.map((call) => call[2].items.length)).toEqual([100, 100, 5])
		expect(getUploadChunks).not.toHaveBeenCalled()
		expect(result.ok && result.available && Object.keys(result.existingChunksByPath)).toHaveLength(205)
	})

	it('bounds each batch by aggregate chunk count', async () => {
		const items = [uploadItem('first.bin', 6000), uploadItem('second.bin', 6000)]
		const getUploadChunksBatch = vi.fn().mockImplementation((_profileId, _uploadId, req) => Promise.resolve({
			items: req.items.map((item: { path: string }) => ({ path: item.path, present: [] })),
		}))

		await resolveExistingResumeChunks({
			api: { uploads: { getUploadChunks: vi.fn(), getUploadChunksBatch } } as never,
			profileId: 'profile-1',
			uploadId: 'session-1',
			items,
			resumeFilesByPath: new Map(items.map((item) => [item.relPath!, { size: 6000, chunkSizeBytes: 1 }])),
		})

		expect(getUploadChunksBatch).toHaveBeenCalledTimes(2)
		expect(getUploadChunksBatch.mock.calls.map((call) => call[2].items.length)).toEqual([1, 1])
	})

	it('maps batch status by path when the response order changes', async () => {
		const items = [uploadItem('folder/a.bin', 64), uploadItem('folder/b.bin', 64)]
		const getUploadChunksBatch = vi.fn().mockResolvedValue({
			items: [
				{ path: 'folder/b.bin', present: [1] },
				{ path: 'folder/a.bin', present: [0] },
			],
		})

		const result = await resolveExistingResumeChunks({
			api: { uploads: { getUploadChunks: vi.fn(), getUploadChunksBatch } } as never,
			profileId: 'profile-1',
			uploadId: 'session-1',
			items,
			resumeFilesByPath: new Map(items.map((item) => [item.relPath!, { size: 64, chunkSizeBytes: 32 }])),
		})

		expect(result).toMatchObject({
			ok: true,
			available: true,
			existingChunksByPath: { 'folder/a.bin': [0], 'folder/b.bin': [1] },
		})
	})

	it('matches server-normalized paths while preserving upload lookup keys', async () => {
		const item = uploadItem('./folder\\report.bin', 64)
		const getUploadChunksBatch = vi.fn().mockResolvedValue({
			items: [{ path: 'folder/report.bin', present: [1] }],
		})

		const result = await resolveExistingResumeChunks({
			api: { uploads: { getUploadChunks: vi.fn(), getUploadChunksBatch } } as never,
			profileId: 'profile-1',
			uploadId: 'session-1',
			items: [item],
			resumeFilesByPath: new Map([['folder/report.bin', { size: 64, chunkSizeBytes: 32 }]]),
		})

		expect(result).toMatchObject({
			ok: true,
			available: true,
			existingChunksByPath: { './folder\\report.bin': [1] },
		})
	})

	it('shares the caller AbortSignal with the in-flight batch request', async () => {
		const controller = new AbortController()
		const getUploadChunksBatch = vi.fn((_profileId, _uploadId, _req, signal: AbortSignal) => new Promise((_resolve, reject) => {
			signal.addEventListener('abort', () => reject(new RequestAbortedError()), { once: true })
		}))
		const pending = resolveExistingResumeChunks({
			api: { uploads: { getUploadChunks: vi.fn(), getUploadChunksBatch } } as never,
			profileId: 'profile-1',
			uploadId: 'session-1',
			items: [uploadItem()],
			resumeFilesByPath: new Map([['folder/report.bin', { size: 256, chunkSizeBytes: 64 }]]),
			signal: controller.signal,
		})

		controller.abort()
		await expect(pending).rejects.toBeInstanceOf(RequestAbortedError)
		expect(getUploadChunksBatch).toHaveBeenCalledWith(
			'profile-1', 'session-1', expect.any(Object), controller.signal,
		)
	})
})
