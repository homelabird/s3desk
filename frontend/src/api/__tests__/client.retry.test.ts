import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { APIClient, RETRY_COUNT_STORAGE_KEY, RETRY_DELAY_STORAGE_KEY } from '../client'
import { clearNetworkLog, getNetworkLog } from '../../lib/networkStatus'

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/json',
			...headers,
		},
	})
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
		const promise = api.getMeta()
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
		await expect(api.getMeta()).rejects.toMatchObject({
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
		const promise = api.getMeta()

		await vi.advanceTimersByTimeAsync(1900)
		expect(fetchMock).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(100)
		await promise
		expect(fetchMock).toHaveBeenCalledTimes(2)
		const retryEntry = getNetworkLog().find((entry) => entry.kind === 'retry')
		expect(retryEntry?.message ?? '').toContain('Retry-After 2s')
		expect(retryEntry?.message ?? '').toContain('in 2s')
	})
})
