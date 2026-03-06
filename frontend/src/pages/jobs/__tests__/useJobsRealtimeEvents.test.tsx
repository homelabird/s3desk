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

describe('useJobsRealtimeEvents', () => {
	beforeEach(() => {
		MockWebSocket.instances = []
		MockEventSource.instances = []
		vi.useFakeTimers()
		vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
		vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource)
	})

	afterEach(() => {
		vi.runOnlyPendingTimers()
		vi.useRealTimers()
		vi.unstubAllGlobals()
	})

	it('invalidates jobs when it detects an event sequence gap', () => {
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

		const ws = MockWebSocket.instances[0]
		expect(ws?.url).toContain('/ws')

		act(() => {
			ws.emitOpen()
			ws.emitMessage(JSON.stringify({ type: 'job.progress', seq: 1, jobId: 'job-1', payload: { status: 'running' } }))
			ws.emitMessage(JSON.stringify({ type: 'job.progress', seq: 3, jobId: 'job-1', payload: { status: 'running' } }))
		})

		expect(invalidateQueries).toHaveBeenCalledTimes(1)
		expect(setQueriesData).toHaveBeenCalledTimes(2)

		unmount()
	})

	it('invalidates jobs when realtime reconnects after a disconnect', () => {
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

		const ws = MockWebSocket.instances[0]
		act(() => {
			ws.emitOpen()
		})
		invalidateQueries.mockClear()

		act(() => {
			ws.emitClose()
		})

		const es = MockEventSource.instances[0]
		expect(es?.url).toContain('/events')

		act(() => {
			es.emitOpen()
		})

		expect(invalidateQueries).toHaveBeenCalledTimes(1)

		unmount()
	})

	it('invalidates jobs when sse reconnects after an error', () => {
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

		const ws = MockWebSocket.instances[0]
		act(() => {
			ws.emitClose()
		})

		const es = MockEventSource.instances[0]
		act(() => {
			es.emitOpen()
		})
		invalidateQueries.mockClear()

		act(() => {
			es.emitError()
			vi.runOnlyPendingTimers()
		})

		const reconnectWs = MockWebSocket.instances[1]
		expect(reconnectWs?.url).toContain('/ws')

		act(() => {
			reconnectWs.emitOpen()
		})

		expect(invalidateQueries).toHaveBeenCalledTimes(1)

		unmount()
	})
})
