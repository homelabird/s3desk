import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { QueryClient } from '@tanstack/react-query'

import { queryKeys } from '../../../api/queryKeys'
import { useJobsRealtimeEvents } from '../useJobsRealtimeEvents'

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

	emitOpen() {
		this.onopen?.(new Event('open'))
	}

	emitError() {
		this.onerror?.(new Event('error'))
	}
}

async function flushRealtimeSetup() {
	await act(async () => {
		await Promise.resolve()
		await Promise.resolve()
		await Promise.resolve()
	})
}

describe('useJobsRealtimeEvents', () => {
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
	})

	it.each(['ws', 'sse'])('aborts pending %s tickets when the scope changes or unmounts', async (transport) => {
		fetchMock.mockImplementation((_input, init) => new Promise((_resolve, reject) => {
			init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
		}))
		if (transport === 'sse') fetchMock.mockRejectedValueOnce(new Error('ws unavailable'))
		const queryClient = new QueryClient()
		const { rerender, unmount } = renderHook(
			({ apiToken }) => useJobsRealtimeEvents({ apiToken, profileId: 'profile-1', queryClient }),
			{ initialProps: { apiToken: 'token-a' } },
		)
		await flushRealtimeSetup()
		const request = fetchMock.mock.calls.at(-1)
		expect(String(request?.[0])).toContain(`transport=${transport}`)
		const signal = request?.[1]?.signal

		rerender({ apiToken: 'token-b' })
		await flushRealtimeSetup()
		expect(signal?.aborted).toBe(true)
		const nextSignal = fetchMock.mock.calls.at(-1)?.[1]?.signal
		expect(nextSignal?.aborted).toBe(false)
		const requestCount = fetchMock.mock.calls.length
		unmount()
		await flushRealtimeSetup()
		expect(nextSignal?.aborted).toBe(true)
		expect(fetchMock).toHaveBeenCalledTimes(requestCount)
		expect(MockWebSocket.instances).toHaveLength(0)
		expect(MockEventSource.instances).toHaveLength(0)
	})

	it.each(['missing', 'throws'])('falls back to sse when the websocket constructor %s', async (behavior) => {
		vi.stubGlobal('WebSocket', behavior === 'missing' ? undefined : class {
			constructor() { throw new DOMException('WebSocket blocked', 'SecurityError') }
		})
		const queryClient = new QueryClient()
		const { result, unmount } = renderHook(() =>
			useJobsRealtimeEvents({ apiToken: 'token', profileId: 'profile-1', queryClient }),
		)
		await flushRealtimeSetup()
		expect(MockEventSource.instances).toHaveLength(1)
		act(() => MockEventSource.instances[0].emitOpen())
		expect(result.current.eventsConnected).toBe(true)
		expect(result.current.eventsTransport).toBe('sse')
		unmount()
	})

	it('invalidates jobs when it detects an event sequence gap', async () => {
		const invalidateQueries = vi.fn().mockResolvedValue(undefined)
		const setQueriesData = vi.fn()
		const setQueryData = vi.fn()
		const queryClient = {
			invalidateQueries,
			setQueriesData,
			setQueryData,
		} as unknown as QueryClient

		const { unmount } = renderHook(() =>
			useJobsRealtimeEvents({
				apiToken: 'token',
				profileId: 'profile-1',
				queryClient,
			}),
		)

		await flushRealtimeSetup()
		const ws = MockWebSocket.instances[0]
		expect(ws?.url).toContain('/ws')
		expect(ws?.url).toContain('realtimeTicket=ws-ticket')

		act(() => {
			ws.emitOpen()
			ws.emitMessage(JSON.stringify({ type: 'job.progress', seq: 1, jobId: 'job-1', payload: { status: 'running' } }))
			ws.emitMessage(JSON.stringify({ type: 'job.progress', seq: 3, jobId: 'job-1', payload: { status: 'running' } }))
		})

		expect(invalidateQueries).toHaveBeenCalledTimes(1)
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.jobs.scope('profile-1', 'token'), exact: false })
		expect(setQueriesData).toHaveBeenCalledTimes(2)
		expect(setQueryData).toHaveBeenCalledTimes(2)
		expect(setQueriesData).toHaveBeenNthCalledWith(
			1,
			{ queryKey: queryKeys.jobs.scope('profile-1', 'token'), exact: false },
			expect.any(Function),
		)

		unmount()
	})

	it('updates active job detail queries from realtime progress events', async () => {
		const setQueriesData = vi.fn()
		const setQueryData = vi.fn()
		const queryClient = {
			invalidateQueries: vi.fn().mockResolvedValue(undefined),
			setQueriesData,
			setQueryData,
		} as unknown as QueryClient

		const { unmount } = renderHook(() =>
			useJobsRealtimeEvents({
				apiToken: 'token',
				profileId: 'profile-1',
				queryClient,
			}),
		)

		await flushRealtimeSetup()
		const ws = MockWebSocket.instances[0]
		act(() => {
			ws.emitOpen()
			ws.emitMessage(
				JSON.stringify({
					type: 'job.completed',
					seq: 1,
					jobId: 'job-1',
					payload: {
						status: 'succeeded',
						progress: { bytesDone: 4096, bytesTotal: 4096 },
						error: null,
					},
				}),
			)
		})

		const detailCall = setQueryData.mock.calls[0]
		expect(detailCall).toBeTruthy()
		expect(detailCall?.[2]).toEqual({ updatedAt: 0 })
		const [filters, updater] = detailCall as [
			unknown[],
			(old: {
				id: string
				status: string
				progress: { bytesDone: number; bytesTotal: number } | null
				error: string | null
				errorCode?: string | null
			}) => unknown,
		]
		expect(filters).toEqual(queryKeys.jobs.detail('profile-1', 'job-1', 'token'))
		expect(
			updater({
				id: 'job-1',
				status: 'running',
				progress: { bytesDone: 1024, bytesTotal: 4096 },
				error: 'old error',
				errorCode: 'old_code',
			}),
		).toEqual({
			id: 'job-1',
			status: 'succeeded',
			progress: { bytesDone: 4096, bytesTotal: 4096 },
			error: 'old error',
			errorCode: 'old_code',
		})

		unmount()
	})

	it('marks partial realtime list updates stale without clearing prior invalidation', async () => {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const jobsQueryKey = queryKeys.jobs.list('profile-1', 'token', 'all', '', '')
		const dataUpdatedAt = Date.now()
		queryClient.setQueryData(
			jobsQueryKey,
			{
				pages: [{ items: [{
					id: 'job-1',
					type: 'transfer_direct_upload',
					status: 'running',
					payload: { bucket: 'bucket-a' },
					createdAt: '2026-08-24T00:00:00Z',
				}] }],
				pageParams: [undefined],
			},
			{ updatedAt: dataUpdatedAt },
		)

		const { unmount } = renderHook(() =>
			useJobsRealtimeEvents({
				apiToken: 'token',
				profileId: 'profile-1',
				queryClient,
			}),
		)

		await flushRealtimeSetup()
		const ws = MockWebSocket.instances[0]
		act(() => {
			ws.emitOpen()
			ws.emitMessage(JSON.stringify({
				type: 'job.progress',
				seq: 1,
				jobId: 'job-1',
				payload: { status: 'running', progress: { bytesDone: 1, bytesTotal: 2 } },
			}))
		})

		expect(queryClient.getQueryState(jobsQueryKey)?.dataUpdatedAt).toBe(0)
		await queryClient.invalidateQueries({ queryKey: jobsQueryKey, exact: true, refetchType: 'none' })
		act(() => {
			ws.emitMessage(JSON.stringify({
				type: 'job.progress',
				seq: 2,
				jobId: 'job-1',
				payload: { status: 'running', progress: { bytesDone: 2, bytesTotal: 2 } },
			}))
		})
		expect(queryClient.getQueryState(jobsQueryKey)?.isInvalidated).toBe(true)
		unmount()
	})

	it.each(['failed', 'canceled'] as const)('reports %s terminal events to the completion owner', async (status) => {
		const cachedJob = {
			id: 'job-delete',
			type: 's3_delete_objects',
			status: 'running',
			payload: { bucket: 'bucket-a', keys: ['logs/app.log'] },
			createdAt: '2026-08-24T00:00:00Z',
		}
		const onJobCompleted = vi.fn()
		const queryClient = {
			getQueryData: vi.fn().mockReturnValue(cachedJob),
			invalidateQueries: vi.fn().mockResolvedValue(undefined),
			setQueriesData: vi.fn(),
			setQueryData: vi.fn(),
		} as unknown as QueryClient

		const { unmount } = renderHook(() =>
			useJobsRealtimeEvents({
				apiToken: 'token',
				profileId: 'profile-1',
				queryClient,
				onJobCompleted,
			}),
		)

		await flushRealtimeSetup()
		const ws = MockWebSocket.instances[0]
		act(() => {
			ws.emitOpen()
			ws.emitMessage(JSON.stringify({
				type: 'job.completed',
				seq: 1,
				jobId: cachedJob.id,
				payload: { status, error: `${status} detail` },
			}))
		})

		expect(onJobCompleted).toHaveBeenCalledWith(
			{
				job: { ...cachedJob, status, error: `${status} detail` },
				jobId: cachedJob.id,
				status,
				error: `${status} detail`,
				errorCode: undefined,
			},
		)
		unmount()
	})

	it('reports terminal status and error when the completed job is not cached', async () => {
		const onJobCompleted = vi.fn()
		const queryClient = {
			invalidateQueries: vi.fn().mockResolvedValue(undefined),
			setQueriesData: vi.fn(),
			setQueryData: vi.fn(),
		} as unknown as QueryClient

		const { unmount } = renderHook(() =>
			useJobsRealtimeEvents({
				apiToken: 'token',
				profileId: 'profile-1',
				queryClient,
				onJobCompleted,
			}),
		)

		await flushRealtimeSetup()
		const ws = MockWebSocket.instances[0]
		act(() => {
			ws.emitOpen()
			ws.emitMessage(JSON.stringify({
				type: 'job.completed',
				seq: 1,
				jobId: 'job-cache-miss',
				payload: { status: 'failed', error: 'failed detail', errorCode: 'provider_error' },
			}))
		})

		expect(onJobCompleted).toHaveBeenCalledWith({
			job: null,
			jobId: 'job-cache-miss',
			status: 'failed',
			error: 'failed detail',
			errorCode: 'provider_error',
		})
		unmount()
	})

	it('resets the realtime sequence when switching profiles', async () => {
		const queryClient = {
			invalidateQueries: vi.fn().mockResolvedValue(undefined),
			setQueriesData: vi.fn(),
			setQueryData: vi.fn(),
		} as unknown as QueryClient

		const { result, rerender, unmount } = renderHook(
			(props: { profileId: string | null }) =>
				useJobsRealtimeEvents({
					apiToken: 'token',
					profileId: props.profileId,
					queryClient,
				}),
			{
				initialProps: { profileId: 'profile-1' },
			},
		)

		await flushRealtimeSetup()
		const firstWs = MockWebSocket.instances[0]
		act(() => {
			firstWs.emitOpen()
			firstWs.emitMessage(
				JSON.stringify({
					type: 'job.progress',
					seq: 5,
					jobId: 'job-1',
					payload: { status: 'running' },
				}),
			)
		})

		act(() => {
			result.current.retryRealtime()
		})

		await flushRealtimeSetup()
		const retryWs = MockWebSocket.instances[1]
		expect(retryWs?.url).toContain('afterSeq=5')

		rerender({ profileId: 'profile-2' })

		await flushRealtimeSetup()
		const switchedWs = MockWebSocket.instances[2]
		expect(switchedWs?.url).not.toContain('afterSeq=')

		unmount()
	})

	it('resets the realtime sequence and connection state when switching api tokens', async () => {
		const queryClient = {
			invalidateQueries: vi.fn().mockResolvedValue(undefined),
			setQueriesData: vi.fn(),
			setQueryData: vi.fn(),
		} as unknown as QueryClient

		const { result, rerender, unmount } = renderHook(
			(props: { apiToken: string }) =>
				useJobsRealtimeEvents({
					apiToken: props.apiToken,
					profileId: 'profile-1',
					queryClient,
				}),
			{
				initialProps: { apiToken: 'token-a' },
			},
		)

		await flushRealtimeSetup()
		const firstWs = MockWebSocket.instances[0]
		act(() => {
			firstWs.emitOpen()
			firstWs.emitMessage(
				JSON.stringify({
					type: 'job.progress',
					seq: 5,
					jobId: 'job-1',
					payload: { status: 'running' },
				}),
			)
		})

		expect(result.current.eventsConnected).toBe(true)
		expect(result.current.eventsTransport).toBe('ws')

		act(() => {
			result.current.retryRealtime()
		})

		await flushRealtimeSetup()
		const retryWs = MockWebSocket.instances[1]
		expect(retryWs?.url).toContain('afterSeq=5')

		rerender({ apiToken: 'token-b' })
		await flushRealtimeSetup()

		expect(result.current.eventsConnected).toBe(false)
		expect(result.current.eventsTransport).toBeNull()
		expect(result.current.eventsRetryCount).toBe(0)

		const switchedWs = MockWebSocket.instances[2]
		expect(switchedWs?.url).not.toContain('afterSeq=')

		unmount()
	})

	it('invalidates jobs when realtime reconnects after a disconnect', async () => {
		const invalidateQueries = vi.fn().mockResolvedValue(undefined)
		const queryClient = {
			invalidateQueries,
			setQueriesData: vi.fn(),
			setQueryData: vi.fn(),
		} as unknown as QueryClient

		const { unmount } = renderHook(() =>
			useJobsRealtimeEvents({
				apiToken: 'token',
				profileId: 'profile-1',
				queryClient,
			}),
		)

		await flushRealtimeSetup()
		const ws = MockWebSocket.instances[0]
		act(() => {
			ws.emitOpen()
		})
		invalidateQueries.mockClear()

		act(() => {
			ws.emitClose()
		})

		await flushRealtimeSetup()
		const es = MockEventSource.instances[0]
		expect(es?.url).toContain('/events')
		expect(es?.url).toContain('realtimeTicket=sse-ticket')

		act(() => {
			es.emitOpen()
		})

		expect(invalidateQueries).toHaveBeenCalledTimes(1)
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.jobs.scope('profile-1', 'token'), exact: false })

		unmount()
	})

	it('retries websocket and refreshes after an sse error', async () => {
		const invalidateQueries = vi.fn().mockResolvedValue(undefined)
		const queryClient = {
			invalidateQueries,
			setQueriesData: vi.fn(),
			setQueryData: vi.fn(),
		} as unknown as QueryClient

		const { result, unmount } = renderHook(() =>
			useJobsRealtimeEvents({
				apiToken: 'token',
				profileId: 'profile-1',
				queryClient,
			}),
		)

		await flushRealtimeSetup()
		const ws = MockWebSocket.instances[0]
		act(() => {
			ws.emitClose()
		})

		await flushRealtimeSetup()
		const es = MockEventSource.instances[0]
		act(() => {
			es.emitOpen()
		})
		invalidateQueries.mockClear()

		await act(async () => {
			es.emitError()
			es.emitOpen()
			vi.runOnlyPendingTimers()
			await Promise.resolve()
			await Promise.resolve()
		})

		await flushRealtimeSetup()
		expect(result.current.eventsConnected).toBe(false)
		const reconnectWs = MockWebSocket.instances[1]
		expect(reconnectWs?.url).toContain('/ws')
		expect(reconnectWs?.url).toContain('realtimeTicket=ws-ticket')

		act(() => {
			reconnectWs.emitOpen()
		})

		expect(invalidateQueries).toHaveBeenCalledTimes(1)
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.jobs.scope('profile-1', 'token'), exact: false })
		unmount()
	})

	it('keeps a healthy sse stream without periodic websocket probes', async () => {
		const queryClient = {
			invalidateQueries: vi.fn().mockResolvedValue(undefined),
			setQueriesData: vi.fn(),
			setQueryData: vi.fn(),
		} as unknown as QueryClient

		const { unmount } = renderHook(() =>
			useJobsRealtimeEvents({
				apiToken: 'token',
				profileId: 'profile-1',
				queryClient,
			}),
		)

		await flushRealtimeSetup()
		const ws = MockWebSocket.instances[0]
		act(() => {
			ws.emitClose()
		})

		await flushRealtimeSetup()
		const es = MockEventSource.instances[0]
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
		expect(fetchMock).toHaveBeenCalledTimes(ticketRequests)

		unmount()
	})

	it('retries websocket when sse setup fails', async () => {
		const queryClient = {
			invalidateQueries: vi.fn().mockResolvedValue(undefined),
			setQueriesData: vi.fn(),
			setQueryData: vi.fn(),
		} as unknown as QueryClient

		const { unmount } = renderHook(() =>
			useJobsRealtimeEvents({ apiToken: 'token', profileId: 'profile-1', queryClient }),
		)

		await flushRealtimeSetup()
		fetchMock.mockRejectedValueOnce(new Error('sse unavailable'))
		act(() => MockWebSocket.instances[0].emitClose())
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

	it('ignores stale sse callbacks after websocket takeover', async () => {
		const queryClient = {
			invalidateQueries: vi.fn().mockResolvedValue(undefined),
			setQueriesData: vi.fn(),
			setQueryData: vi.fn(),
		} as unknown as QueryClient
		const { result, unmount } = renderHook(() =>
			useJobsRealtimeEvents({ apiToken: 'token', profileId: 'profile-1', queryClient }),
		)

		await flushRealtimeSetup()
		act(() => {
			MockWebSocket.instances[0].emitOpen()
			MockWebSocket.instances[0].emitClose()
		})
		await flushRealtimeSetup()
		const staleEs = MockEventSource.instances[0]

		await act(async () => {
			vi.advanceTimersByTime(1_000)
			await Promise.resolve()
			await Promise.resolve()
		})
		await flushRealtimeSetup()
		act(() => MockWebSocket.instances[1].emitOpen())
		const ticketRequests = fetchMock.mock.calls.length

		act(() => {
			staleEs.emitOpen()
			staleEs.emitError()
		})
		expect(result.current.eventsConnected).toBe(true)
		expect(result.current.eventsTransport).toBe('ws')
		expect(fetchMock).toHaveBeenCalledTimes(ticketRequests)

		unmount()
	})

	it('retries websocket only after a manual realtime retry', async () => {
		const queryClient = {
			invalidateQueries: vi.fn().mockResolvedValue(undefined),
			setQueriesData: vi.fn(),
			setQueryData: vi.fn(),
		} as unknown as QueryClient

		const { result, unmount } = renderHook(() =>
			useJobsRealtimeEvents({
				apiToken: 'token',
				profileId: 'profile-1',
				queryClient,
			}),
		)

		await flushRealtimeSetup()
		const ws = MockWebSocket.instances[0]
		act(() => {
			ws.emitClose()
		})

		await flushRealtimeSetup()
		expect(MockEventSource.instances).toHaveLength(1)
		expect(MockWebSocket.instances).toHaveLength(1)

		act(() => {
			result.current.retryRealtime()
		})

		await flushRealtimeSetup()
		expect(MockWebSocket.instances).toHaveLength(2)

		unmount()
	})
})
