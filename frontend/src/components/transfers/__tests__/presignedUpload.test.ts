import { describe, expect, it, vi } from 'vitest'

import { planPresignedMultipart, uploadPresignedFilesWithProgress } from '../presignedUpload'

describe('planPresignedMultipart', () => {
	it('returns null for invalid or below-threshold sizes', () => {
		expect(planPresignedMultipart({ fileSize: 0, partSizeBytes: 10, thresholdBytes: 1 })).toBeNull()
		expect(planPresignedMultipart({ fileSize: 10, partSizeBytes: 10, thresholdBytes: 11 })).toBeNull()
	})

	it('clamps part size to the minimum', () => {
		const min = 5 * 1024 * 1024
		const plan = planPresignedMultipart({ fileSize: min * 2, partSizeBytes: 1, thresholdBytes: 1 })
		expect(plan).not.toBeNull()
		expect(plan?.partSizeBytes).toBe(min)
		expect(plan?.partCount).toBe(2)
	})

	it('returns null if the computed part count would be 1', () => {
		const min = 5 * 1024 * 1024
		expect(planPresignedMultipart({ fileSize: min, partSizeBytes: min * 10, thresholdBytes: 1 })).toBeNull()
	})

	it('adjusts part size when exceeding max parts', () => {
		const min = 5 * 1024 * 1024
		const maxParts = 10_000
		const fileSize = min*maxParts + 1
		const plan = planPresignedMultipart({ fileSize, partSizeBytes: min, thresholdBytes: 1 })
		expect(plan).not.toBeNull()
		expect(plan?.partCount).toBeLessThanOrEqual(maxParts)
		expect(plan?.partSizeBytes).toBeGreaterThanOrEqual(min)
	})
})

describe('uploadPresignedFilesWithProgress', () => {
	it('does not proxy-fallback a single PUT whose response remains ambiguous', async () => {
		const originalXMLHttpRequest = globalThis.XMLHttpRequest
		let attempts = 0
		class NetworkErrorXMLHttpRequest {
			upload = { onprogress: null as ((event: { loaded: number }) => void) | null }
			status = 0
			onload: (() => void) | null = null
			onerror: (() => void) | null = null
			onabort: (() => void) | null = null
			open() {}
			setRequestHeader() {}
			getResponseHeader() { return null }
			send(body: Blob) {
				attempts += 1
				queueMicrotask(() => {
					this.upload.onprogress?.({ loaded: body.size })
					this.onerror?.()
				})
			}
			abort() { this.onabort?.() }
		}
		globalThis.XMLHttpRequest = NetworkErrorXMLHttpRequest as unknown as typeof XMLHttpRequest
		try {
			const presignUpload = vi.fn().mockResolvedValue({ mode: 'single', url: 'https://objects.test/file.txt' })
			const handle = uploadPresignedFilesWithProgress({
				api: { uploads: { presignUpload } } as never,
				profileId: 'profile-1',
				uploadId: 'upload-1',
				items: [{ file: new File(['hello'], 'file.txt'), relPath: 'file.txt' }],
				singleConcurrency: 1,
				multipartFileConcurrency: 1,
				partConcurrency: 1,
				chunkThresholdBytes: 1024,
				chunkSizeBytes: 512,
			})

			await expect(handle.promise).resolves.toEqual({ skipped: 0 })
			expect(attempts).toBe(2)
			expect(presignUpload).toHaveBeenCalledTimes(1)
		} finally {
			globalThis.XMLHttpRequest = originalXMLHttpRequest
		}
	})

	it('retries the same multipart part before completing the upload', async () => {
		const originalXMLHttpRequest = globalThis.XMLHttpRequest
		let attempts = 0
		class RetryXMLHttpRequest {
			upload = { onprogress: null as ((event: { loaded: number }) => void) | null }
			status = 0
			onload: (() => void) | null = null
			onerror: (() => void) | null = null
			onabort: (() => void) | null = null
			open() {}
			setRequestHeader() {}
			getResponseHeader(name: string) { return name.toLowerCase() === 'etag' ? '"etag"' : null }
			send(body: Blob) {
				attempts += 1
				const currentAttempt = attempts
				queueMicrotask(() => {
					this.upload.onprogress?.({ loaded: body.size })
					if (currentAttempt === 1) {
						this.onerror?.()
						return
					}
					this.status = 200
					this.onload?.()
				})
			}
			abort() { this.onabort?.() }
		}
		globalThis.XMLHttpRequest = RetryXMLHttpRequest as unknown as typeof XMLHttpRequest
		try {
			const partSize = 5 * 1024 * 1024
			const completeMultipartUpload = vi.fn().mockResolvedValue(undefined)
			const handle = uploadPresignedFilesWithProgress({
				api: {
					uploads: {
						presignUpload: vi.fn().mockResolvedValue({
							mode: 'multipart',
							multipart: {
								partSizeBytes: partSize,
								partCount: 2,
								parts: [
									{ number: 1, url: 'https://objects.test/part-1' },
									{ number: 2, url: 'https://objects.test/part-2' },
								],
							},
						}),
						completeMultipartUpload,
						abortMultipartUpload: vi.fn(),
					},
				} as never,
				profileId: 'profile-1',
				uploadId: 'upload-1',
				items: [{ file: new File([new Uint8Array(partSize * 2)], 'file.bin'), relPath: 'file.bin' }],
				singleConcurrency: 1,
				multipartFileConcurrency: 1,
				partConcurrency: 1,
				chunkThresholdBytes: 1,
				chunkSizeBytes: partSize,
			})

			await expect(handle.promise).resolves.toEqual({ skipped: 0 })
			expect(attempts).toBe(3)
			expect(completeMultipartUpload).toHaveBeenCalledWith('profile-1', 'upload-1', {
				path: 'file.bin',
				parts: [
					{ number: 1, etag: '"etag"' },
					{ number: 2, etag: '"etag"' },
				],
			})
		} finally {
			globalThis.XMLHttpRequest = originalXMLHttpRequest
		}
	})
})
