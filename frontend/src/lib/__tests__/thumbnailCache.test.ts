import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createThumbnailCache } from '../thumbnailCache'

describe('thumbnailCache', () => {
	beforeEach(() => {
		vi.useRealTimers()
	})

	it('tracks deterministic failures for a limited time', () => {
		vi.useFakeTimers()
		const cache = createThumbnailCache({ failureTtlMs: 1000 })

		cache.markFailed('profile:bucket:key:24')
		expect(cache.isFailed('profile:bucket:key:24')).toBe(true)

		vi.advanceTimersByTime(1001)
		expect(cache.isFailed('profile:bucket:key:24')).toBe(false)
	})

	it('clears failure markers when a thumbnail is stored', () => {
		const cache = createThumbnailCache({ failureTtlMs: 1000 })

		cache.markFailed('profile:bucket:key:24')
		cache.set('profile:bucket:key:24', 'blob:thumb-1')

		expect(cache.isFailed('profile:bucket:key:24')).toBe(false)
		expect(cache.get('profile:bucket:key:24')).toBe('blob:thumb-1')
	})
})
