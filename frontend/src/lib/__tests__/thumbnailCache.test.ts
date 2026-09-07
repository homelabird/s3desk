import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
	buildThumbnailCacheKey,
	clearPersistentThumbnailCache,
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
		delete: vi.fn(async () => true),
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

	it('bounds failure markers and retains the most recently recorded failures', () => {
		const cache = createThumbnailCache({ maxEntries: 2 })
		cache.markFailed('first')
		cache.markFailed('second')
		cache.markFailed('first')
		cache.markFailed('third')

		expect(cache.isFailed('first')).toBe(true)
		expect(cache.isFailed('second')).toBe(false)
		expect(cache.isFailed('third')).toBe(true)
	})

	it('prefers exact sizes, then the smallest larger or largest smaller thumbnail, and refreshes LRU', () => {
		URL.revokeObjectURL = vi.fn()
		const cache = createThumbnailCache({ maxEntries: 3 })
		const request = { apiToken: 'token', profileId: 'profile', bucket: 'bucket', objectKey: 'image.png', size: 96 }
		const keys = [48, 96, 192].map((size) => buildThumbnailCacheKey({ ...request, size }))
		keys.forEach((key, index) => cache.set(key, `blob:${index}`))

		expect(cache.findBestMatch(request)).toEqual({ cacheKey: keys[1], size: 96, url: 'blob:1' })
		expect(cache.findBestMatch({ ...request, size: 64 })?.size).toBe(96)
		expect(cache.findBestMatch({ ...request, size: 256 })?.size).toBe(192)
		expect(cache.findBestMatch({ ...request, apiToken: 'other' })).toBeNull()
		cache.findBestMatch({ ...request, size: 48 })
		cache.findBestMatch(request)
		cache.set(buildThumbnailCacheKey({ ...request, objectKey: 'other.png' }), 'blob:other')

		expect(cache.get(keys[1])).toBe('blob:1')
		expect(cache.get(keys[2])).toBeUndefined()
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:2')
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
		expect(tokenAKey).not.toContain('token-a')
		expect(tokenBKey).not.toContain('token-b')
	})

	it('clears persistent thumbnails and their index', async () => {
		installPersistentThumbnailCacheMock()
		window.localStorage.setItem('s3desk-thumbnail-blobs-v1:index', '{}')

		await clearPersistentThumbnailCache()

		expect(window.localStorage.getItem('s3desk-thumbnail-blobs-v1:index')).toBeNull()
		expect(window.caches.delete).toHaveBeenCalledWith('s3desk-thumbnail-blobs-v1')
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
