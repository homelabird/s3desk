import { describe, expect, it, vi } from 'vitest'

import { APIError, type UploadFileItem } from '../../../api/client'
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
		const getUploadChunks = vi.fn().mockResolvedValue({ present: [0, 2] })

		const result = await resolveExistingResumeChunks({
			api: { uploads: { getUploadChunks } } as never,
			profileId: 'profile-1',
			uploadId: 'session-1',
			items: [item],
			resumeFilesByPath: new Map([['folder/report.bin', { size: item.file.size, chunkSizeBytes: 64 }]]),
		})

		expect(getUploadChunks).toHaveBeenCalledWith('profile-1', 'session-1', {
			path: 'folder/report.bin',
			total: 4,
			chunkSize: 64,
			fileSize: item.file.size,
		})
		expect(result).toEqual({
			ok: true,
			available: true,
			uploadId: 'session-1',
			existingChunksByPath: { 'folder/report.bin': [0, 2] },
		})
	})

	it('returns a user-facing size mismatch instead of probing chunks', async () => {
		const getUploadChunks = vi.fn()

		const result = await resolveExistingResumeChunks({
			api: { uploads: { getUploadChunks } } as never,
			profileId: 'profile-1',
			uploadId: 'session-1',
			items: [uploadItem('folder/report.bin', 128)],
			resumeFilesByPath: new Map([['folder/report.bin', { size: 256, chunkSizeBytes: 64 }]]),
		})

		expect(getUploadChunks).not.toHaveBeenCalled()
		expect(result).toEqual({
			ok: false,
			error: 'Selected file size does not match the previous upload.',
		})
	})

	it('treats missing upload chunk state as unavailable resume data', async () => {
		const getUploadChunks = vi.fn().mockRejectedValue(
			new APIError({
				status: 404,
				code: 'not_found',
				message: 'upload session not found',
			}),
		)

		const result = await resolveExistingResumeChunks({
			api: { uploads: { getUploadChunks } } as never,
			profileId: 'profile-1',
			uploadId: 'session-1',
			items: [uploadItem()],
			resumeFilesByPath: new Map([['folder/report.bin', { size: 256, chunkSizeBytes: 64 }]]),
		})

		expect(result).toEqual({ ok: true, available: false })
	})
})
