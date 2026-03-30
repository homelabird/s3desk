import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { APIClient } from '../../../api/client'
import type { UploadTask } from '../transferTypes'
import { getRealtimeSequenceState, useTransfersUploadJobEvents } from '../useTransfersUploadJobEvents'

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
	closed = false
	onopen: ((event: Event) => void) | null = null
	onerror: ((event: Event) => void) | null = null
	onmessage: ((event: MessageEvent<string>) => void) | null = null
	close = vi.fn(() => {
		this.closed = true
	})

	constructor(url: string) {
		this.url = url
		MockEventSource.instances.push(this)
	}

	emitOpen() {
		this.onopen?.(new Event('open'))
	}

	emitError() {
		this.onerror?.(new Event('error'))
	}
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

function activeWebSocket() {
	const ws = [...MockWebSocket.instances].reverse().find((entry) => !!entry.onmessage || !!entry.onopen || !!entry.onclose || !!entry.onerror)
	if (!ws) {
		throw new Error('expected an active websocket instance')
	}
	return ws
}

function activeEventSource() {
	const es = [...MockEventSource.instances].reverse().find((entry) => !!entry.onmessage || !!entry.onopen || !!entry.onerror)
	if (!es) {
		throw new Error('expected an active event source instance')
	}
	return es
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
		vi.spyOn(Math, 'random').mockReturnValue(0)
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

		const ws = activeWebSocket()
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

	it('falls back to sse when websocket fails before opening and reprobes websocket later', async () => {
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

		const ws = activeWebSocket()
		act(() => {
			ws.emitClose()
		})

		await flushRealtimeSetup()

		expect(fetchMock).toHaveBeenCalledTimes(2)
		expect(String(fetchMock.mock.calls[1]?.[0])).toContain('transport=sse')

		const es = activeEventSource()
		expect(es?.url).toContain('/events')
		expect(es?.url).toContain('realtimeTicket=sse-ticket')
		expect(es?.url).not.toContain('apiToken=')

		act(() => {
			es.emitOpen()
		})

		await act(async () => {
			vi.advanceTimersByTime(15_000)
			await Promise.resolve()
			await Promise.resolve()
		})

		await flushRealtimeSetup()
		const retriedWs = activeWebSocket()
		expect(retriedWs?.url).toContain('/ws')
		expect(retriedWs?.url).toContain('realtimeTicket=ws-ticket')

		unmount()
	})

	it('reuses the last sequence number when reconnecting after a disconnect', async () => {
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
		const ws = activeWebSocket()
		act(() => {
			ws.emitOpen()
			ws.emitMessage(JSON.stringify({ type: 'job.progress', seq: 5, jobId: 'job-1', payload: { status: 'running' } }))
			ws.emitClose()
		})

		await flushRealtimeSetup()
		expect(activeEventSource()?.url).toContain('afterSeq=5')

		await act(async () => {
			vi.advanceTimersByTime(1_000)
			await Promise.resolve()
			await Promise.resolve()
		})

		await flushRealtimeSetup()
		expect(activeWebSocket()?.url).toContain('afterSeq=5')

		unmount()
	})

	it('detects sequence gaps and preserves the latest realtime sequence', () => {
		expect(getRealtimeSequenceState(0, 1)).toEqual({ hasGap: false, resolvedSeq: 1 })
		expect(getRealtimeSequenceState(1, 3)).toEqual({ hasGap: true, resolvedSeq: 3 })
		expect(getRealtimeSequenceState(5, 4)).toEqual({ hasGap: false, resolvedSeq: 5 })
		expect(getRealtimeSequenceState(5, undefined)).toEqual({ hasGap: false, resolvedSeq: 5 })
	})

	it('does not overlap fallback polling while a previous job fetch is still running', async () => {
		let resolveJob: ((value: { status: string }) => void) | null = null
		const getJob = vi.fn().mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveJob = resolve
				}),
		)
		const api = {
			jobs: {
				getJob,
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
		expect(getJob).toHaveBeenCalledTimes(1)

		await act(async () => {
			vi.advanceTimersByTime(6_000)
			await Promise.resolve()
		})

		expect(getJob).toHaveBeenCalledTimes(1)

		await act(async () => {
			resolveJob?.({ status: 'running' })
			await Promise.resolve()
		})

		unmount()
	})
})
