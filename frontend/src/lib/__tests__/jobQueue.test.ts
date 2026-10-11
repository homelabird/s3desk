import { afterEach, describe, expect, it, vi } from 'vitest'

import { APIError, RequestAbortedError } from '../../api/client'
import { subscribeJobQueueBanner, withJobQueueRetry } from '../jobQueue'

describe('withJobQueueRetry', () => {
	afterEach(() => vi.useRealTimers())

	it('does not submit an action when already canceled', async () => {
		const controller = new AbortController()
		controller.abort()
		const action = vi.fn().mockResolvedValue('ok')
		await expect(withJobQueueRetry(action, { signal: controller.signal })).rejects.toBeInstanceOf(RequestAbortedError)
		expect(action).not.toHaveBeenCalled()
	})

	it('cancels a queue backoff immediately without submitting another action', async () => {
		vi.useFakeTimers()
		const controller = new AbortController()
		const action = vi.fn().mockRejectedValue(new APIError({
			status: 429, code: 'job_queue_full', message: 'Queue full', retryAfterSeconds: 60,
		}))
		const onClear = vi.fn()
		const unsubscribe = subscribeJobQueueBanner(() => {}, onClear)
		try {
			const outcome = withJobQueueRetry(action, { signal: controller.signal }).catch((error: unknown) => error)
			await vi.advanceTimersByTimeAsync(0)
			controller.abort()
			await vi.advanceTimersByTimeAsync(0)
			expect(vi.getTimerCount()).toBe(0)
			await expect(outcome).resolves.toBeInstanceOf(RequestAbortedError)
			expect(action).toHaveBeenCalledOnce()
			expect(onClear).toHaveBeenCalled()
		} finally {
			unsubscribe()
		}
	})

	it('retries on queue full and clears banner after success', async () => {
		vi.useFakeTimers()

		let cleared = false
		const banners: string[] = []
		const unsubscribe = subscribeJobQueueBanner(
			(detail) => banners.push(detail.message),
			() => {
				cleared = true
			},
		)

		let attempts = 0
		const action = vi.fn(async () => {
			attempts += 1
			if (attempts < 3) {
				throw new APIError({
					status: 429,
					code: 'job_queue_full',
					message: 'Queue full',
					details: { queueDepth: 1, queueCapacity: 2 },
					retryAfterSeconds: 1,
				})
			}
			return 'ok'
		})

		try {
			const promise = withJobQueueRetry(action, { maxRetries: 3 })
			await vi.runAllTimersAsync()
			const result = await promise

			expect(result).toBe('ok')
			expect(action).toHaveBeenCalledTimes(3)
			expect(banners.length).toBeGreaterThan(0)
			expect(cleared).toBe(true)
		} finally {
			unsubscribe()
			vi.useRealTimers()
		}
	})
})
