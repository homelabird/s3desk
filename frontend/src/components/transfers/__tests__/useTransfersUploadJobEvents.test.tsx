import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { APIClientShape } from '../../../api/client'
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

function jobsListResponse(jobId = 'job-1', status = 'running') {
	return { items: [{ id: jobId, status }], nextCursor: undefined }
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
				listJobs: vi.fn().mockResolvedValue(jobsListResponse()),
			},
		} as unknown as APIClientShape
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

	it('keeps a healthy sse stream without periodic websocket probes', async () => {
		const api = {
			jobs: {
				listJobs: vi.fn().mockResolvedValue(jobsListResponse()),
			},
		} as unknown as APIClientShape
		const uploadTasksRef = { current: [buildUploadTask()] }
		const handleUploadJobUpdate = vi.fn(async () => {})

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
		const ticketRequests = fetchMock.mock.calls.length

		await act(async () => {
			vi.advanceTimersByTime(60_000)
			await Promise.resolve()
			await Promise.resolve()
		})

		expect(MockWebSocket.instances).toHaveLength(1)
		expect(MockEventSource.instances).toHaveLength(1)
		expect(es.closed).toBe(false)
		expect(fetchMock).toHaveBeenCalledTimes(ticketRequests)

		act(() => {
			es.emitError()
		})
		await act(async () => {
			vi.advanceTimersByTime(1_000)
			await Promise.resolve()
			await Promise.resolve()
		})
		await flushRealtimeSetup()
		expect(MockWebSocket.instances).toHaveLength(2)
		expect(activeWebSocket().url).toContain('realtimeTicket=ws-ticket')

		unmount()
	})

	it('retries websocket when sse setup fails', async () => {
		const api = { jobs: { listJobs: vi.fn().mockResolvedValue(jobsListResponse()) } } as unknown as APIClientShape
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
		fetchMock.mockRejectedValueOnce(new Error('sse unavailable'))
		act(() => activeWebSocket().emitClose())
		await flushRealtimeSetup()

		await act(async () => {
			vi.advanceTimersByTime(1_000)
			await Promise.resolve()
			await Promise.resolve()
		})
		await flushRealtimeSetup()
		expect(MockWebSocket.instances).toHaveLength(2)
		expect(MockEventSource.instances).toHaveLength(0)

		unmount()
	})

	it('reuses the last sequence number when reconnecting after a disconnect', async () => {
		const api = {
			jobs: {
				listJobs: vi.fn().mockResolvedValue(jobsListResponse()),
			},
		} as unknown as APIClientShape
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

	it('reruns a reconnect refresh queued behind disconnected polling', async () => {
		let resolveJobs: ((value: ReturnType<typeof jobsListResponse>) => void) | null = null
		const listJobs = vi.fn().mockResolvedValue(jobsListResponse())
		const api = { jobs: { listJobs } } as unknown as APIClientShape
		const uploadTasksRef = { current: [buildUploadTask()] }
		const handleUploadJobUpdate = vi.fn(async () => {})
		const updateUploadTask = vi.fn()

		const { unmount } = renderHook(() =>
			useTransfersUploadJobEvents({
				api,
				apiToken: 'token-123',
				hasPendingUploadJobs: true,
				uploadTasksRef,
				handleUploadJobUpdate,
				updateUploadTask,
			}),
		)

		await flushRealtimeSetup()
		act(() => activeWebSocket().emitOpen())
		await flushRealtimeSetup()

		listJobs.mockClear()
		listJobs.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveJobs = resolve
				}),
		)

		act(() => activeWebSocket().emitClose())
		await flushRealtimeSetup()
		expect(listJobs).toHaveBeenCalledTimes(1)

		act(() => activeEventSource().emitOpen())
		await flushRealtimeSetup()
		expect(listJobs).toHaveBeenCalledTimes(1)

		await act(async () => {
			resolveJobs?.(jobsListResponse())
			await Promise.resolve()
			await Promise.resolve()
		})
		expect(listJobs).toHaveBeenCalledTimes(2)

		unmount()
	})

	it('does not attach a late refresh error to a completed upload', async () => {
		const api = { jobs: { listJobs: vi.fn().mockRejectedValue(new Error('offline')) } } as unknown as APIClientShape
		const updateUploadTask = vi.fn()
		const uploadTasksRef = { current: [buildUploadTask()] }

		const { unmount } = renderHook(() =>
			useTransfersUploadJobEvents({
				api,
				apiToken: 'token-123',
				hasPendingUploadJobs: true,
				uploadTasksRef,
				handleUploadJobUpdate: vi.fn(async () => {}),
				updateUploadTask,
			}),
		)

		await flushRealtimeSetup()
		const updater = updateUploadTask.mock.calls[0]?.[1] as ((task: UploadTask) => UploadTask) | undefined
		expect(updater).toBeTypeOf('function')

		const completed = { ...buildUploadTask(), status: 'succeeded' as const }
		expect(updater?.(completed)).toBe(completed)
		expect(updater?.(buildUploadTask()).error).toContain('offline')

		unmount()
	})

	it('batches at most 200 waiting jobs without overlapping and aborts on unmount', async () => {
		let resolveFirstBatch: ((value: { items: Array<{ id: string; status: string }> }) => void) | undefined
		const listJobs = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveFirstBatch = resolve
					}),
			)
			.mockImplementationOnce(() => new Promise(() => {}))
		const api = {
			jobs: {
				listJobs,
			},
		} as unknown as APIClientShape
		const uploadTasksRef = {
			current: Array.from({ length: 201 }, (_, index) => ({
				...buildUploadTask(),
				id: `upload-${index + 1}`,
				jobId: `job-${index + 1}`,
			})),
		}

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
		expect(listJobs).toHaveBeenCalledTimes(1)
		expect(listJobs.mock.calls[0]?.[0]).toBe('profile-1')
		expect(listJobs.mock.calls[0]?.[1]).toMatchObject({
			ids: uploadTasksRef.current.slice(0, 200).map((task) => task.jobId),
			limit: 200,
			signal: expect.any(AbortSignal),
		})

		await act(async () => {
			vi.advanceTimersByTime(6_000)
			await Promise.resolve()
		})

		expect(listJobs).toHaveBeenCalledTimes(1)

		await act(async () => {
			resolveFirstBatch?.({
				items: uploadTasksRef.current
					.slice(0, 200)
					.map((task) => ({ id: task.jobId as string, status: 'running' })),
			})
			await Promise.resolve()
			await Promise.resolve()
		})
		expect(listJobs).toHaveBeenCalledTimes(2)
		expect(listJobs.mock.calls[1]?.[1]).toMatchObject({
			ids: ['job-201'],
			limit: 1,
			signal: expect.any(AbortSignal),
		})

		await act(async () => {
			vi.advanceTimersByTime(2_000)
			await Promise.resolve()
		})
		expect(listJobs).toHaveBeenCalledTimes(2)

		const signal = listJobs.mock.calls[1]?.[1]?.signal
		unmount()
		expect(signal?.aborted).toBe(true)
	})
})
