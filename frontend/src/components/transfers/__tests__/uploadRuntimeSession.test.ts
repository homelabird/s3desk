import { describe, expect, it, vi } from 'vitest'

import { APIError } from '../../../api/client'
import type { UploadTask } from '../transferTypes'
import { createUploadSessionWithFallback } from '../uploadRuntimeSession'

function uploadTask(overrides: Partial<UploadTask> = {}): UploadTask {
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
		label: 'Upload',
		...overrides,
	}
}

function unsupportedError(code: 'not_supported' | 'invalid_request' = 'not_supported') {
	return new APIError({
		status: 400,
		code,
		message: 'unsupported upload mode',
	})
}

describe('createUploadSessionWithFallback', () => {
	it('falls back from presigned to the planned fallback mode on unsupported provider errors', async () => {
		const createUpload = vi
			.fn()
			.mockRejectedValueOnce(unsupportedError())
			.mockResolvedValueOnce({ uploadId: 'fallback-upload', mode: 'direct', maxBytes: null })
		const onFallback = vi.fn()

		const session = await createUploadSessionWithFallback({
			api: { uploads: { createUpload } } as never,
			task: uploadTask(),
			preferredMode: 'presigned',
			fallbackMode: 'direct',
			canUsePresigned: true,
			onFallback,
		})

		expect(session).toEqual({ uploadId: 'fallback-upload', mode: 'direct', maxBytes: null })
		expect(createUpload).toHaveBeenNthCalledWith(1, 'profile-1', {
			bucket: 'bucket-a',
			prefix: 'docs/',
			mode: 'presigned',
		})
		expect(createUpload).toHaveBeenNthCalledWith(2, 'profile-1', {
			bucket: 'bucket-a',
			prefix: 'docs/',
			mode: 'direct',
		})
		expect(onFallback).toHaveBeenCalledWith({
			from: 'presigned',
			to: 'direct',
			reason: 'provider_unsupported',
		})
	})

	it('falls back from direct to staging on unsupported provider errors', async () => {
		const createUpload = vi
			.fn()
			.mockRejectedValueOnce(unsupportedError('invalid_request'))
			.mockResolvedValueOnce({ uploadId: 'staging-upload', mode: 'staging' })
		const onFallback = vi.fn()

		await expect(
			createUploadSessionWithFallback({
				api: { uploads: { createUpload } } as never,
				task: uploadTask(),
				preferredMode: 'direct',
				fallbackMode: 'direct',
				canUsePresigned: false,
				onFallback,
			}),
		).resolves.toEqual({ uploadId: 'staging-upload', mode: 'staging' })

		expect(createUpload).toHaveBeenNthCalledWith(2, 'profile-1', {
			bucket: 'bucket-a',
			prefix: 'docs/',
			mode: 'staging',
		})
		expect(onFallback).toHaveBeenCalledWith({
			from: 'direct',
			to: 'staging',
			reason: 'provider_unsupported',
		})
	})

	it('rethrows non-fallback errors', async () => {
		const error = new Error('network down')
		const createUpload = vi.fn().mockRejectedValueOnce(error)

		await expect(
			createUploadSessionWithFallback({
				api: { uploads: { createUpload } } as never,
				task: uploadTask(),
				preferredMode: 'presigned',
				fallbackMode: 'staging',
				canUsePresigned: true,
			}),
		).rejects.toBe(error)
	})
})
