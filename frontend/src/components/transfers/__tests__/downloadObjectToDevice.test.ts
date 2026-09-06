// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { APIClientShape } from '../../../api/client'
import { createMockApiClient } from '../../../test/mockApiClient'
import { downloadObjectToDevice } from '../downloadObjectToDevice'
import type { ObjectDeviceDownloadTask } from '../transferTypes'

const deviceFsMocks = vi.hoisted(() => ({
	ensureReadWritePermission: vi.fn(),
	getFileHandleForPath: vi.fn(),
	writeResponseToFile: vi.fn(),
}))

vi.mock('../../../lib/deviceFs', () => deviceFsMocks)

type DownloadURLArgs = Parameters<APIClientShape['objects']['getObjectDownloadURL']>[0]

const task: ObjectDeviceDownloadTask = {
	id: 'download-1',
	kind: 'object_device',
	profileId: 'profile-1',
	bucket: 'bucket-a',
	key: 'folder/report.txt',
	label: 'report.txt',
	status: 'running',
	createdAtMs: 1,
	loadedBytes: 0,
	totalBytes: 5,
	speedBps: 0,
	etaSeconds: 0,
	targetDirHandle: {} as FileSystemDirectoryHandle,
	targetPath: 'report.txt',
}

describe('downloadObjectToDevice', () => {
	beforeEach(() => {
		deviceFsMocks.ensureReadWritePermission.mockResolvedValue(undefined)
		deviceFsMocks.getFileHandleForPath.mockResolvedValue({} as FileSystemFileHandle)
		deviceFsMocks.writeResponseToFile.mockResolvedValue(undefined)
	})

	afterEach(() => {
		vi.restoreAllMocks()
		vi.clearAllMocks()
	})

	it('aborts a pending direct presign without starting a raw or proxy request', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch')
		let presignSignal: AbortSignal | undefined
		const getObjectDownloadURL = vi.fn((request: DownloadURLArgs) => {
			presignSignal = request.signal
			return new Promise<{ url: string; expiresAt: string }>((_resolve, reject) => {
				request.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
			})
		})
		const controller = new AbortController()
		const promise = downloadObjectToDevice({
			api: createMockApiClient({ objects: { getObjectDownloadURL } }),
			task,
			downloadLinkProxyEnabled: false,
			signal: controller.signal,
		})

		await vi.waitFor(() => expect(getObjectDownloadURL).toHaveBeenCalledTimes(1))
		const rejection = expect(promise).rejects.toMatchObject({ name: 'AbortError' })
		controller.abort()
		await rejection

		expect(presignSignal).toBe(controller.signal)
		expect(presignSignal?.aborted).toBe(true)
		expect(getObjectDownloadURL).not.toHaveBeenCalledWith(expect.objectContaining({ proxy: true }))
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	it('reuses the live task signal when direct fetch failure falls back to proxy presign', async () => {
		const proxyResponse = new Response(new Blob(['hello'], { type: 'text/plain' }), { status: 200 })
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockRejectedValueOnce(new TypeError('Failed to fetch'))
			.mockResolvedValueOnce(proxyResponse)
		const getObjectDownloadURL = vi.fn((request: DownloadURLArgs) =>
			Promise.resolve({
				url: request.proxy ? 'https://storage.local/proxy' : 'https://storage.local/direct',
				expiresAt: '2026-08-24T00:00:00Z',
			}),
		)
		const controller = new AbortController()

		await downloadObjectToDevice({
			api: createMockApiClient({ objects: { getObjectDownloadURL } }),
			task,
			downloadLinkProxyEnabled: false,
			signal: controller.signal,
		})

		expect(getObjectDownloadURL).toHaveBeenNthCalledWith(1, expect.objectContaining({ signal: controller.signal }))
		expect(getObjectDownloadURL).toHaveBeenNthCalledWith(2, expect.objectContaining({ proxy: true, signal: controller.signal }))
		expect(fetchSpy).toHaveBeenNthCalledWith(1, 'https://storage.local/direct', { signal: controller.signal })
		expect(fetchSpy).toHaveBeenNthCalledWith(2, 'https://storage.local/proxy', { signal: controller.signal })
		expect(controller.signal.aborted).toBe(false)
		expect(deviceFsMocks.writeResponseToFile).toHaveBeenCalledWith(expect.objectContaining({ response: proxyResponse, signal: controller.signal }))
	})
})
