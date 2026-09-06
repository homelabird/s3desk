import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { APIClient, RequestAbortedError, RequestTimeoutError, RETRY_COUNT_STORAGE_KEY, RETRY_DELAY_STORAGE_KEY } from '../client'
import { fetchWithRetry, fetchWithTimeout } from '../retryTransport'
import { clearNetworkLog, clearNetworkStatus, getNetworkLog, subscribeNetworkStatus, type NetworkStatusDetail } from '../../lib/networkStatus'

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/json',
			...headers,
		},
	})
}

function stalledJSONResponse(signal?: AbortSignal): Response {
	return new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				if (!signal) return
				const abort = () => controller.error(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'))
				if (signal.aborted) {
					abort()
					return
				}
				signal.addEventListener('abort', abort, { once: true })
			},
		}),
		{ status: 200, headers: { 'content-type': 'application/json' } },
	)
}

describe('APIClient retry semantics', () => {
	beforeEach(() => {
		window.localStorage.setItem(RETRY_COUNT_STORAGE_KEY, '1')
		window.localStorage.setItem(RETRY_DELAY_STORAGE_KEY, '200')
		clearNetworkLog()
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
		vi.unstubAllGlobals()
		window.localStorage.removeItem(RETRY_COUNT_STORAGE_KEY)
		window.localStorage.removeItem(RETRY_DELAY_STORAGE_KEY)
		clearNetworkLog()
	})

	it('retries idempotent GET when normalizedError.retryable is true', async () => {
		vi.useFakeTimers()
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse(400, {
					error: {
						code: 'provider_error',
						message: 'temporary provider failure',
						normalizedError: { code: 'endpoint_unreachable', retryable: true },
					},
				}),
			)
			.mockResolvedValueOnce(jsonResponse(200, { appVersion: 'test' }))
		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

		const api = new APIClient()
		const promise = api.server.getMeta()
		await vi.runAllTimersAsync()
		const result = await promise

		expect(result).toMatchObject({ appVersion: 'test' })
		expect(fetchMock).toHaveBeenCalledTimes(2)
		const retryEntry = getNetworkLog().find((entry) => entry.kind === 'retry')
		expect(retryEntry?.message ?? '').toContain('endpoint_unreachable')
		expect(retryEntry?.message ?? '').toContain('in')
	})

	it('does not retry when normalizedError.retryable is false and status is not retryable', async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(
			jsonResponse(400, {
				error: {
					code: 'invalid_request',
					message: 'bad input',
					normalizedError: { code: 'invalid_request', retryable: false },
				},
			}),
		)
		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

		const api = new APIClient()
		await expect(api.server.getMeta()).rejects.toMatchObject({
			status: 400,
			code: 'invalid_request',
		})
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it('respects Retry-After before retrying', async () => {
		vi.useFakeTimers()
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse(
					429,
					{
						error: {
							code: 'rate_limited',
							message: 'too many requests',
							normalizedError: { code: 'rate_limited', retryable: true },
						},
					},
					{ 'Retry-After': '2' },
				),
			)
			.mockResolvedValueOnce(jsonResponse(200, { appVersion: 'test' }))
		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

		const api = new APIClient()
		const promise = api.server.getMeta()

		await vi.advanceTimersByTimeAsync(1900)
		expect(fetchMock).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(100)
		await promise
		expect(fetchMock).toHaveBeenCalledTimes(2)
		const retryEntry = getNetworkLog().find((entry) => entry.kind === 'retry')
		expect(retryEntry?.message ?? '').toContain('Retry-After 2s')
		expect(retryEntry?.message ?? '').toContain('in 2s')
	})

	it('stops a Retry-After backoff as soon as the caller aborts', async () => {
		vi.useFakeTimers()
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse(
					429,
					{
						error: {
							code: 'rate_limited',
							message: 'too many requests',
							normalizedError: { code: 'rate_limited', retryable: true },
						},
					},
					{ 'Retry-After': '2' },
				),
			)
			.mockResolvedValueOnce(
				jsonResponse(200, {
					bucket: 'bucket-a',
					prefix: '',
					delimiter: '/',
					commonPrefixes: [],
					items: [],
					isTruncated: false,
				}),
			)
		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

		const controller = new AbortController()
		const api = new APIClient()
		const promise = api.objects.listObjects({
			profileId: 'profile-1',
			bucket: 'bucket-a',
			signal: controller.signal,
		})
		await vi.advanceTimersByTimeAsync(0)
		expect(fetchMock).toHaveBeenCalledTimes(1)

		let outcome: unknown = 'pending'
		void promise.then(
			() => {
				outcome = 'resolved'
			},
			(error: unknown) => {
				outcome = error
			},
		)
		controller.abort()
		await vi.advanceTimersByTimeAsync(0)
		const outcomeAfterAbort = outcome
		await vi.runAllTimersAsync()

		expect(outcomeAfterAbort).toBeInstanceOf(RequestAbortedError)
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it('keeps timeout and caller abort active while reading a body after headers', async () => {
		vi.useFakeTimers()
		const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
			Promise.resolve(stalledJSONResponse(init?.signal ?? undefined)),
		)
		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

		let timeoutOutcome: unknown = 'pending'
		void fetchWithTimeout('/stalled', { method: 'GET' }, 25).then(
			() => {
				timeoutOutcome = 'resolved'
			},
			(error: unknown) => {
				timeoutOutcome = error
			},
		)
		await vi.advanceTimersByTimeAsync(0)
		expect(timeoutOutcome).toBe('pending')
		await vi.advanceTimersByTimeAsync(25)
		expect(timeoutOutcome).toBeInstanceOf(RequestTimeoutError)

		const controller = new AbortController()
		const api = new APIClient()
		let abortOutcome: unknown = 'pending'
		void api.objects.listObjects({ profileId: 'profile-1', bucket: 'bucket-a', signal: controller.signal }).then(
			() => {
				abortOutcome = 'resolved'
			},
			(error: unknown) => {
				abortOutcome = error
			},
		)
		await vi.advanceTimersByTimeAsync(0)
		expect(abortOutcome).toBe('pending')
		controller.abort()
		await vi.advanceTimersByTimeAsync(0)
		expect(abortOutcome).toBeInstanceOf(RequestAbortedError)
	})

	it('keeps another request warning when an unrelated request succeeds or the latest retry is canceled', async () => {
		vi.useFakeTimers()
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(jsonResponse(503, {}, { 'Retry-After': '2' }))
			.mockResolvedValueOnce(jsonResponse(503, {}, { 'Retry-After': '3' }))
			.mockImplementation(() => Promise.resolve(jsonResponse(200, {})))
		vi.stubGlobal('fetch', fetchMock)
		let current: NetworkStatusDetail | null = null
		const readStatus = () => current
		const unsubscribe = subscribeNetworkStatus((detail) => { current = detail }, () => { current = null })
		const controller = new AbortController()
		try {
			const first = fetchWithRetry('/first', { method: 'GET' }, { retries: 1 })
			await vi.advanceTimersByTimeAsync(0)
			const firstStatus = readStatus()
			expect(firstStatus?.message).toContain('Auto-retry in 2s')
			const second = fetchWithRetry('/second', { method: 'GET', signal: controller.signal }, { retries: 1 })
			const canceled = expect(second).rejects.toBeInstanceOf(RequestAbortedError)
			await vi.advanceTimersByTimeAsync(0)
			expect(readStatus()?.message).toContain('Auto-retry in 3s')
			await fetchWithRetry('/unrelated', { method: 'GET' }, { retries: 0 })
			clearNetworkStatus()
			expect(readStatus()?.message).toContain('Auto-retry in 3s')
			controller.abort()
			await canceled
			expect(readStatus()).toBe(firstStatus)
			await vi.advanceTimersByTimeAsync(2000)
			await first
			expect(readStatus()).toBeNull()
		} finally {
			controller.abort()
			await vi.runAllTimersAsync()
			unsubscribe()
		}
	})

	it('ends the retry notice after exhaustion and leaves no stale notice after manual recovery', async () => {
		vi.useFakeTimers()
		vi.stubGlobal('fetch', vi.fn()
			.mockResolvedValueOnce(jsonResponse(503, {}, { 'Retry-After': '1' }))
			.mockResolvedValueOnce(jsonResponse(503, {}))
			.mockResolvedValueOnce(jsonResponse(200, {})))
		const show = vi.fn()
		const clear = vi.fn()
		const unsubscribe = subscribeNetworkStatus(show, clear)
		try {
			const failed = fetchWithRetry('/buckets', { method: 'GET' }, { retries: 1 })
			await vi.advanceTimersByTimeAsync(0)
			expect(show).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Auto-retry in 1s') }))
			await vi.advanceTimersByTimeAsync(1000)
			expect((await failed).status).toBe(503)
			expect(clear).toHaveBeenCalledTimes(1)
			expect((await fetchWithRetry('/buckets', { method: 'GET' }, { retries: 1 })).ok).toBe(true)
			expect(clear).toHaveBeenCalledTimes(2)
		} finally {
			unsubscribe()
		}
	})

	it('returns timeout-free raw streams without buffering their body', async () => {
		const response = stalledJSONResponse()
		const fetchMock = vi.fn().mockResolvedValue(response)
		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

		await expect(fetchWithTimeout('/stream', { method: 'GET' }, 0)).resolves.toBe(response)
		expect(response.bodyUsed).toBe(false)
	})
})
