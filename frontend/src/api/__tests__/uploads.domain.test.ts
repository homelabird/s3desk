import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createUpload, getUploadChunks, getUploadChunksBatch, uploadFilesWithProgress } from '../domains/uploads'
import type { UploadFileItem } from '../uploads'

type RecordedRequest = {
	method: string
	url: string
	headers: Record<string, string>
	body: Document | XMLHttpRequestBodyInit | null
}

class FakeXMLHttpRequest {
	static requests: RecordedRequest[] = []

	static reset() {
		FakeXMLHttpRequest.requests = []
	}

	upload: { onprogress: ((event: { loaded: number }) => void) | null } = { onprogress: null }
	status = 0
	responseText = ''
	onload: (() => void) | null = null
	onerror: (() => void) | null = null
	onabort: (() => void) | null = null

	private method = 'GET'
	private url = ''
	private headers: Record<string, string> = {}

	open(method: string, url: string) {
		this.method = method
		this.url = url
	}

	setRequestHeader(name: string, value: string) {
		this.headers[name.toLowerCase()] = value
	}

	getResponseHeader(name: string) {
		void name
		return null
	}

	send(body: Document | XMLHttpRequestBodyInit | null = null) {
		FakeXMLHttpRequest.requests.push({
			method: this.method,
			url: this.url,
			headers: { ...this.headers },
			body,
		})

		queueMicrotask(() => {
			const size = body instanceof Blob ? body.size : 0
			this.upload.onprogress?.({ loaded: size })
			this.status = 204
			this.onload?.()
		})
	}

	abort() {
		this.onabort?.()
	}
}

function buildItem(contents: string, name: string, relPath?: string): UploadFileItem {
	return {
		file: new File([contents], name, { type: 'text/plain' }),
		relPath,
	}
}

it('bounds and forwards cancellation for upload session creation', async () => {
	const request = vi.fn().mockResolvedValue({ uploadId: 'upload-1', mode: 'staging' })
	const controller = new AbortController()
	const payload = { bucket: 'bucket-a', prefix: 'docs/', mode: 'staging' as const }

	await createUpload(request, 'profile-1', payload, controller.signal)

	expect(request).toHaveBeenCalledWith('/uploads', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload),
		signal: controller.signal,
	}, { profileId: 'profile-1', timeoutMs: 30_000 })
})

it('forwards AbortSignal through batch and compatibility chunk-status requests', async () => {
	const request = vi.fn()
		.mockResolvedValueOnce({ items: [{ path: 'file.bin', present: [0] }] })
		.mockResolvedValueOnce({ present: [0] })
	const controller = new AbortController()
	const item = { path: 'file.bin', total: 2, chunkSize: 5, fileSize: 10 }

	await getUploadChunksBatch(request, 'profile-1', 'upload-1', { items: [item] }, controller.signal)
	await getUploadChunks(request, 'profile-1', 'upload-1', item, controller.signal)

	expect(request).toHaveBeenNthCalledWith(1, '/uploads/upload-1/chunks/batch', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ items: [item] }),
		signal: controller.signal,
	}, { profileId: 'profile-1', timeoutMs: 30_000 })
	expect(request).toHaveBeenNthCalledWith(2, expect.stringContaining('/uploads/upload-1/chunks?'), {
		method: 'GET', signal: controller.signal,
	}, { profileId: 'profile-1' })
})

describe('uploadFilesWithProgress', () => {
	const originalXMLHttpRequest = globalThis.XMLHttpRequest

	beforeEach(() => {
		FakeXMLHttpRequest.reset()
		globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest
	})

	afterEach(() => {
		globalThis.XMLHttpRequest = originalXMLHttpRequest
	})

	it('routes nested relative paths through chunk uploads even below the chunk threshold', async () => {
		const handle = uploadFilesWithProgress(
			{ baseUrl: 'http://example.test/api/v1', apiToken: 'playwright-token' },
			'playwright-profile',
			'upload-test',
			[
				buildItem('alpha', 'alpha.txt', 'dir-a/alpha.txt'),
				buildItem('beta', 'beta.txt', 'dir-b/nested/beta.txt'),
			],
			{
				chunkThresholdBytes: 1024 * 1024,
				chunkSizeBytes: 1024,
				chunkConcurrency: 1,
				chunkFileConcurrency: 1,
			},
		)

		await expect(handle.promise).resolves.toEqual({ skipped: 0 })

		expect(FakeXMLHttpRequest.requests).toHaveLength(2)
		expect(FakeXMLHttpRequest.requests.map((request) => request.headers['x-upload-relative-path'])).toEqual([
			'dir-a/alpha.txt',
			'dir-b/nested/beta.txt',
		])
		expect(FakeXMLHttpRequest.requests.map((request) => request.headers['x-upload-chunk-index'])).toEqual(['0', '0'])
		expect(FakeXMLHttpRequest.requests.map((request) => request.headers['x-upload-chunk-total'])).toEqual(['1', '1'])
		expect(FakeXMLHttpRequest.requests.map((request) => request.headers['x-upload-chunk-size'])).toEqual(['1024', '1024'])
		expect(FakeXMLHttpRequest.requests.map((request) => request.headers['x-upload-file-size'])).toEqual(['5', '4'])
		expect(FakeXMLHttpRequest.requests.every((request) => request.body instanceof Blob)).toBe(true)
	})

	it('keeps flat files on multipart uploads when they do not need chunking', async () => {
		const handle = uploadFilesWithProgress(
			{ baseUrl: 'http://example.test/api/v1', apiToken: 'playwright-token' },
			'playwright-profile',
			'upload-test',
			[buildItem('alpha', 'alpha.txt')],
			{
				chunkThresholdBytes: 1024 * 1024,
				chunkSizeBytes: 1024,
			},
		)

		await expect(handle.promise).resolves.toEqual({ skipped: 0 })

		expect(FakeXMLHttpRequest.requests).toHaveLength(1)
		expect(FakeXMLHttpRequest.requests[0]?.headers['x-upload-relative-path']).toBeUndefined()
		expect(FakeXMLHttpRequest.requests[0]?.body instanceof FormData).toBe(true)
	})

	it('streams non-S3 direct files as one multipart request per relative path', async () => {
		const handle = uploadFilesWithProgress(
			{ baseUrl: 'http://example.test/api/v1', apiToken: 'playwright-token' },
			'playwright-profile',
			'upload-test',
			[
				buildItem('alpha', 'alpha.txt', 'dir-a/alpha.txt'),
				buildItem('beta', 'beta.txt', 'dir-b/beta.txt'),
			],
			{ forceMultipartForm: true, concurrency: 2 },
		)

		await expect(handle.promise).resolves.toEqual({ skipped: 0 })
		expect(FakeXMLHttpRequest.requests).toHaveLength(2)
		expect(FakeXMLHttpRequest.requests.map((request) => request.headers['x-upload-relative-path'])).toEqual([
			'dir-a/alpha.txt',
			'dir-b/beta.txt',
		])
		expect(FakeXMLHttpRequest.requests.every((request) => request.body instanceof FormData)).toBe(true)
	})
})
