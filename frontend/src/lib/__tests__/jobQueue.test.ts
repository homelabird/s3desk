import { describe, expect, it, vi } from 'vitest'

import { APIError } from '../../api/client'
import { subscribeJobQueueBanner, withJobQueueRetry } from '../jobQueue'

describe('withJobQueueRetry', () => {
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
