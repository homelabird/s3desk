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
		const queryClient = {
			invalidateQueries,
			setQueriesData,
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
		expect(setQueriesData).toHaveBeenCalledTimes(2)

		unmount()
	})

	it('invalidates jobs when realtime reconnects after a disconnect', async () => {
		const invalidateQueries = vi.fn().mockResolvedValue(undefined)
		const queryClient = {
			invalidateQueries,
			setQueriesData: vi.fn(),
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
		const reconnectWs = MockWebSocket.instances[1]
		expect(reconnectWs?.url).toContain('/ws')
		expect(reconnectWs?.url).toContain('realtimeTicket=ws-ticket')

		act(() => {
			reconnectWs.emitOpen()
		})

		expect(invalidateQueries).toHaveBeenCalledTimes(1)

		unmount()
	})
})
