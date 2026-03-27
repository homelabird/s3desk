import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { uploadFilesWithProgress } from '../domains/uploads'
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
})
