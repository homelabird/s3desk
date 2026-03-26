import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { APIClient } from '../../../api/client'
import type { UploadTask } from '../transferTypes'
import { useTransfersUploadJobEvents } from '../useTransfersUploadJobEvents'

class MockWebSocket {
	static instances: MockWebSocket[] = []

	url: string
	onopen: ((event: Event) => void) | null = null
	onclose: ((event: Event) => void) | null = null
	onerror: ((event: Event) => void) | null = null
	onmessage: ((event: MessageEvent<string>) => void) | null = null

	constructor(url: string) {
		this.url = url
		MockWebSocket.instances.push(this)
	}

	close() {
		this.onclose?.(new Event('close'))
	}

	emitOpen() {
		this.onopen?.(new Event('open'))
	}

	emitClose() {
		this.onclose?.(new Event('close'))
	}

	emitMessage(data: string) {
		this.onmessage?.({ data } as MessageEvent<string>)
	}
}

class MockEventSource {
	static instances: MockEventSource[] = []

	url: string
	onopen: ((event: Event) => void) | null = null
	onerror: ((event: Event) => void) | null = null
	onmessage: ((event: MessageEvent<string>) => void) | null = null

	constructor(url: string) {
		this.url = url
		MockEventSource.instances.push(this)
	}

	close() {}
}

function buildUploadTask(): UploadTask {
	return {
		id: 'upload-1',
		profileId: 'profile-1',
		bucket: 'bucket-a',
		prefix: 'folder/',
		fileCount: 1,
		status: 'waiting_job',
		createdAtMs: 1,
		loadedBytes: 10,
		totalBytes: 100,
		speedBps: 0,
		etaSeconds: 0,
		jobId: 'job-1',
		label: 'Upload: alpha.txt',
	}
}

async function flushRealtimeSetup() {
	await act(async () => {
		await Promise.resolve()
		await Promise.resolve()
		await Promise.resolve()
	})
}

describe('useTransfersUploadJobEvents', () => {
	const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

	beforeEach(() => {
		MockWebSocket.instances = []
		MockEventSource.instances = []
		vi.useFakeTimers()
		vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
		vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource)
		vi.stubGlobal('fetch', fetchMock)
		fetchMock.mockImplementation(async (input) => {
			const url = typeof input === 'string' ? new URL(input) : new URL(input.toString())
			const transport = url.searchParams.get('transport') ?? 'ws'
			return {
				ok: true,
				json: async () => ({ ticket: `${transport}-ticket` }),
			} as Response
		})
	})

	afterEach(() => {
		vi.runOnlyPendingTimers()
		vi.useRealTimers()
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
	})

	it('requests websocket realtime tickets and does not leak apiToken in realtime urls', async () => {
		const handleUploadJobUpdate = vi.fn(async () => {})
		const api = {
			jobs: {
				getJob: vi.fn().mockResolvedValue({ status: 'running' }),
			},
		} as unknown as APIClient
		const uploadTasksRef = { current: [buildUploadTask()] }

		const { unmount } = renderHook(() =>
			useTransfersUploadJobEvents({
				api,
				apiToken: 'token-123',
				hasPendingUploadJobs: true,
				uploadTasksRef,
				handleUploadJobUpdate,
				updateUploadTask: vi.fn(),
			}),
		)

		await flushRealtimeSetup()

		expect(fetchMock).toHaveBeenCalled()
		const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? []
		expect(String(requestUrl)).toContain('/realtime-ticket')
		expect(String(requestUrl)).toContain('transport=ws')
		expect(requestInit).toMatchObject({
			method: 'POST',
			headers: {
				'X-Api-Token': 'token-123',
			},
		})

		const ws = MockWebSocket.instances[0]
		expect(ws?.url).toContain('/ws')
		expect(ws?.url).toContain('realtimeTicket=ws-ticket')
		expect(ws?.url).not.toContain('apiToken=')

		handleUploadJobUpdate.mockClear()

		act(() => {
			ws.emitOpen()
			ws.emitMessage(JSON.stringify({ type: 'job.progress', jobId: 'job-1', payload: { status: 'running' } }))
		})

		expect(handleUploadJobUpdate).toHaveBeenCalledTimes(1)
		expect(handleUploadJobUpdate).toHaveBeenCalledWith('upload-1', { status: 'running' })

		unmount()
	})

	it('falls back to sse realtime tickets when websocket fails before opening', async () => {
		const api = {
			jobs: {
				getJob: vi.fn().mockResolvedValue({ status: 'running' }),
			},
		} as unknown as APIClient
		const uploadTasksRef = { current: [buildUploadTask()] }

		const { unmount } = renderHook(() =>
			useTransfersUploadJobEvents({
				api,
				apiToken: 'token-123',
				hasPendingUploadJobs: true,
				uploadTasksRef,
				handleUploadJobUpdate: vi.fn(async () => {}),
				updateUploadTask: vi.fn(),
			}),
		)

		await flushRealtimeSetup()

		const ws = MockWebSocket.instances[0]
		act(() => {
			ws.emitClose()
		})

		await flushRealtimeSetup()

		expect(fetchMock).toHaveBeenCalledTimes(2)
		expect(String(fetchMock.mock.calls[1]?.[0])).toContain('transport=sse')

		const es = MockEventSource.instances[0]
		expect(es?.url).toContain('/events')
		expect(es?.url).toContain('realtimeTicket=sse-ticket')
		expect(es?.url).not.toContain('apiToken=')

		unmount()
	})
})
