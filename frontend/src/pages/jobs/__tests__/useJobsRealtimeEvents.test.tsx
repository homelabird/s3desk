import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { QueryClient } from '@tanstack/react-query'

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
		expect(setQueriesData).toHaveBeenCalledTimes(4)
		expect(setQueryData).toHaveBeenCalledTimes(2)

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
		expect(filters).toEqual(['job', 'profile-1', 'job-1', 'token'])
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

		unmount()
	})

	it('invalidates jobs when sse reconnects after an error', async () => {
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
			vi.runOnlyPendingTimers()
			await Promise.resolve()
			await Promise.resolve()
		})

		await flushRealtimeSetup()
		const reconnectEs = MockEventSource.instances[1]
		expect(reconnectEs?.url).toContain('/events')
		expect(reconnectEs?.url).toContain('realtimeTicket=sse-ticket')

		act(() => {
			reconnectEs.emitOpen()
		})

		expect(invalidateQueries).toHaveBeenCalledTimes(1)
		expect(MockWebSocket.instances).toHaveLength(1)

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
