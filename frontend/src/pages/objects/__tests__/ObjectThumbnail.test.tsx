import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { APIError } from '../../../api/client'
import { buildThumbnailCacheKey, createThumbnailCache } from '../../../lib/thumbnailCache'
import { ObjectThumbnail } from '../ObjectThumbnail'
import { buildObjectThumbnailRequest } from '../objectPreviewPolicy'

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
const PERSISTENT_THUMBNAIL_INDEX_KEY = 's3desk-thumbnail-blobs-v1:index'

beforeEach(() => {
	URL.createObjectURL = vi.fn(() => 'blob:thumbnail')
	URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
	URL.createObjectURL = originalCreateObjectURL
	URL.revokeObjectURL = originalRevokeObjectURL
	vi.restoreAllMocks()
	Reflect.deleteProperty(window as typeof window & { caches?: CacheStorage }, 'caches')
	window.localStorage.removeItem(PERSISTENT_THUMBNAIL_INDEX_KEY)
})

describe('ObjectThumbnail', () => {
	it('uses persistent local cache for video thumbnails before hitting the network', async () => {
		const cache = createThumbnailCache()
		const downloadObjectThumbnail = vi.fn()
		const cacheKey = buildThumbnailCacheKey(
			buildObjectThumbnailRequest({
				profileId: 'profile-1',
				bucket: 'bucket-a',
				objectKey: 'clip.mp4',
				size: 24,
			}),
		)
		const match = vi.fn().mockResolvedValue(
			new Response(new Blob(['thumb'], { type: 'image/jpeg' }), {
				status: 200,
				headers: { 'content-type': 'image/jpeg' },
			}),
		)
		window.localStorage.setItem(PERSISTENT_THUMBNAIL_INDEX_KEY, JSON.stringify({ [cacheKey]: Date.now() }))
		;(window as typeof window & { caches?: CacheStorage }).caches = {
			open: vi.fn().mockResolvedValue({
				match,
				put: vi.fn(),
			}),
		} as unknown as CacheStorage
		const api = { downloadObjectThumbnail } as never

		render(<ObjectThumbnail api={api} profileId="profile-1" bucket="bucket-a" objectKey="clip.mp4" size={24} cache={cache} />)

		await waitFor(() => expect(match).toHaveBeenCalled())
		expect(downloadObjectThumbnail).not.toHaveBeenCalled()
	})

	it('does not refetch thumbnails after a deterministic 413 failure', async () => {
		const cache = createThumbnailCache()
		const downloadObjectThumbnail = vi.fn(() => ({
			promise: Promise.reject(new APIError({ status: 413, code: 'too_large', message: 'object is too large for thumbnail' })),
			abort: vi.fn(),
		}))
		const api = { downloadObjectThumbnail } as never

		const first = render(
			<ObjectThumbnail api={api} profileId="profile-1" bucket="bucket-a" objectKey="clip.mp4" size={24} cache={cache} />,
		)

		await waitFor(() => expect(downloadObjectThumbnail).toHaveBeenCalledTimes(1))
		first.unmount()

		render(<ObjectThumbnail api={api} profileId="profile-1" bucket="bucket-a" objectKey="clip.mp4" size={24} cache={cache} />)

		await waitFor(() =>
			expect(
				cache.isFailed(
					buildThumbnailCacheKey(
						buildObjectThumbnailRequest({
							profileId: 'profile-1',
							bucket: 'bucket-a',
							objectKey: 'clip.mp4',
							size: 24,
						}),
					),
				),
			).toBe(true),
		)
		expect(downloadObjectThumbnail).toHaveBeenCalledTimes(1)
	})

	it('retries thumbnail fetches after transient errors', async () => {
		const cache = createThumbnailCache()
		const downloadObjectThumbnail = vi.fn(() => ({
			promise: Promise.reject(new Error('network error')),
			abort: vi.fn(),
		}))
		const api = { downloadObjectThumbnail } as never

		const first = render(
			<ObjectThumbnail api={api} profileId="profile-1" bucket="bucket-a" objectKey="clip.mp4" size={24} cache={cache} />,
		)

		await waitFor(() => expect(downloadObjectThumbnail).toHaveBeenCalledTimes(1))
		first.unmount()

		render(<ObjectThumbnail api={api} profileId="profile-1" bucket="bucket-a" objectKey="clip.mp4" size={24} cache={cache} />)

		await waitFor(() => expect(downloadObjectThumbnail).toHaveBeenCalledTimes(2))
	})
})
