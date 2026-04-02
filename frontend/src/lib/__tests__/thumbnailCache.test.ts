import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
	buildThumbnailCacheKey,
	createThumbnailCache,
	getPersistentThumbnailBlob,
	setPersistentThumbnailBlob,
} from '../thumbnailCache'

function installPersistentThumbnailCacheMock() {
	const entries = new Map<string, Response>()
	const cache = {
		match: vi.fn(async (request: Request) => entries.get(request.url)),
		put: vi.fn(async (request: Request, response: Response) => {
			entries.set(request.url, response.clone())
		}),
		delete: vi.fn(async (request: Request) => entries.delete(request.url)),
	}
	;(window as typeof window & { caches?: CacheStorage }).caches = {
		open: vi.fn().mockResolvedValue(cache),
	} as unknown as CacheStorage
	return { cache, entries }
}

describe('thumbnailCache', () => {
	beforeEach(() => {
		vi.useRealTimers()
		window.localStorage.clear()
	})

	afterEach(() => {
		Reflect.deleteProperty(window as typeof window & { caches?: CacheStorage }, 'caches')
		window.localStorage.clear()
		vi.restoreAllMocks()
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

	it('separates thumbnail cache keys by api token', () => {
		const tokenAKey = buildThumbnailCacheKey({
			apiToken: 'token-a',
			profileId: 'profile-1',
			bucket: 'bucket-a',
			objectKey: 'clip.mp4',
			size: 96,
			cacheKeySuffix: 'etag-1',
		})
		const tokenBKey = buildThumbnailCacheKey({
			apiToken: 'token-b',
			profileId: 'profile-1',
			bucket: 'bucket-a',
			objectKey: 'clip.mp4',
			size: 96,
			cacheKeySuffix: 'etag-1',
		})

		expect(tokenAKey).not.toBe(tokenBKey)
	})

	it('expires persistent thumbnail blobs after the configured TTL', async () => {
		vi.useFakeTimers()
		const { cache } = installPersistentThumbnailCacheMock()
		const blob = new Blob(['thumb-1'], { type: 'image/jpeg' })

		await setPersistentThumbnailBlob('profile:bucket:key:96', blob, { ttlMs: 1000 })
		expect(await getPersistentThumbnailBlob('profile:bucket:key:96', { ttlMs: 1000 })).not.toBeNull()

		vi.advanceTimersByTime(1001)

		await expect(getPersistentThumbnailBlob('profile:bucket:key:96', { ttlMs: 1000 })).resolves.toBeNull()
		expect(cache.delete).toHaveBeenCalledTimes(1)
	})

	it('evicts the oldest persistent thumbnail blobs when the cache exceeds max entries', async () => {
		vi.useFakeTimers()
		installPersistentThumbnailCacheMock()

		await setPersistentThumbnailBlob('profile:bucket:key-a:96', new Blob(['a'], { type: 'image/jpeg' }), { maxEntries: 1 })
		vi.advanceTimersByTime(1)
		await setPersistentThumbnailBlob('profile:bucket:key-b:96', new Blob(['b'], { type: 'image/jpeg' }), { maxEntries: 1 })

		await expect(getPersistentThumbnailBlob('profile:bucket:key-a:96', { maxEntries: 1 })).resolves.toBeNull()
		await expect(getPersistentThumbnailBlob('profile:bucket:key-b:96', { maxEntries: 1 })).resolves.not.toBeNull()
	})
})
