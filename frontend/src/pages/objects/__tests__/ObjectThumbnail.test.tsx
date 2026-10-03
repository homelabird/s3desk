import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { APIError } from '../../../api/client'
import { buildThumbnailCacheKey, createThumbnailCache } from '../../../lib/thumbnailCache'
import { createMockApiClient } from '../../../test/mockApiClient'
import { ObjectThumbnail } from '../ObjectThumbnail'
import { buildObjectThumbnailRequest } from '../objectPreviewPolicy'

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
const PERSISTENT_THUMBNAIL_INDEX_KEY = 's3desk-thumbnail-blobs-v1:index'

beforeEach(() => {
	window.localStorage.clear()
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
	it.each([
		[null, 24, 256],
		[96, 24, 96],
		[256, 24, 256],
		[512, 24, 512],
		['invalid', 24, 256],
		[96, 512, 512],
	] as const)('requests quality %s at %s display pixels as %s pixels', async (quality, displaySize, requestSize) => {
		if (quality !== null) window.localStorage.setItem('objectsThumbnailQuality', JSON.stringify(quality))
		const downloadObjectThumbnail = vi.fn(() => ({
			promise: Promise.resolve({ blob: new Blob(['thumb'], { type: 'image/jpeg' }), contentType: 'image/jpeg' }),
			abort: vi.fn(),
		}))
		const api = createMockApiClient({ objects: { downloadObjectThumbnail } })
		render(<ObjectThumbnail api={api} apiToken="token-a" profileId="profile-1" bucket="bucket-a" objectKey="image.png" size={displaySize} cache={createThumbnailCache()} />)

		await waitFor(() => expect(downloadObjectThumbnail).toHaveBeenCalledWith(expect.objectContaining({ size: requestSize })))
		const image = await screen.findByRole('img', { name: 'Thumbnail of image.png' })
		expect(image).toHaveAttribute('width', String(displaySize))
		expect(image).toHaveAttribute('height', String(displaySize))
	})

	it('fetches a higher resolution when the saved quality changes while mounted', async () => {
		window.localStorage.setItem('objectsThumbnailQuality', '96')
		const downloadObjectThumbnail = vi.fn(() => ({
			promise: Promise.resolve({ blob: new Blob(['thumb'], { type: 'image/jpeg' }), contentType: 'image/jpeg' }),
			abort: vi.fn(),
		}))
		const api = createMockApiClient({ objects: { downloadObjectThumbnail } })
		render(<ObjectThumbnail api={api} apiToken="token-a" profileId="profile-1" bucket="bucket-a" objectKey="image.png" size={24} cache={createThumbnailCache()} />)
		await screen.findByRole('img', { name: 'Thumbnail of image.png' })

		act(() => {
			window.localStorage.setItem('objectsThumbnailQuality', '512')
			window.dispatchEvent(new CustomEvent('local-storage', { detail: { key: 'objectsThumbnailQuality', value: '512' } }))
		})
		await waitFor(() => expect(downloadObjectThumbnail).toHaveBeenLastCalledWith(expect.objectContaining({ size: 512 })))
		expect(downloadObjectThumbnail).toHaveBeenCalledTimes(2)
	})

	it('uses persistent local cache for video thumbnails before hitting the network', async () => {
		const cache = createThumbnailCache()
		const downloadObjectThumbnail = vi.fn()
		const cacheKey = buildThumbnailCacheKey(
			buildObjectThumbnailRequest({
				apiToken: 'token-a',
				profileId: 'profile-1',
				bucket: 'bucket-a',
				objectKey: 'clip.mp4',
				size: 256,
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
		const api = createMockApiClient({ objects: { downloadObjectThumbnail } })

		render(<ObjectThumbnail api={api} apiToken="token-a" profileId="profile-1" bucket="bucket-a" objectKey="clip.mp4" size={24} cache={cache} />)

		await waitFor(() => expect(match).toHaveBeenCalled())
		expect(downloadObjectThumbnail).not.toHaveBeenCalled()
	})

	it('does not start a thumbnail request when an unmounted cache lookup resolves as a miss', async () => {
		const cache = createThumbnailCache()
		const cacheKey = buildThumbnailCacheKey(
			buildObjectThumbnailRequest({
				apiToken: 'token-a',
				profileId: 'profile-1',
				bucket: 'bucket-a',
				objectKey: 'clip.mp4',
				size: 256,
			}),
		)
		let resolveMatch: ((value: Response | undefined) => void) | undefined
		const match = vi.fn(
			() => new Promise<Response | undefined>((resolve) => {
				resolveMatch = resolve
			}),
		)
		window.localStorage.setItem(PERSISTENT_THUMBNAIL_INDEX_KEY, JSON.stringify({ [cacheKey]: Date.now() }))
		;(window as typeof window & { caches?: CacheStorage }).caches = {
			open: vi.fn().mockResolvedValue({
				match,
				put: vi.fn(),
			}),
		} as unknown as CacheStorage
		const downloadObjectThumbnail = vi.fn(() => ({
			promise: Promise.resolve({
				blob: new Blob(['thumb-network'], { type: 'image/jpeg' }),
				contentType: 'image/jpeg',
			}),
			abort: vi.fn(),
		}))
		const api = createMockApiClient({ objects: { downloadObjectThumbnail } })
		const view = render(
			<ObjectThumbnail api={api} apiToken="token-a" profileId="profile-1" bucket="bucket-a" objectKey="clip.mp4" size={24} cache={cache} />,
		)

		await waitFor(() => expect(match).toHaveBeenCalledTimes(1))
		view.unmount()
		await act(async () => {
			resolveMatch?.(undefined)
			await Promise.resolve()
		})

		expect(downloadObjectThumbnail).not.toHaveBeenCalled()
	})

	it('does not publish a fetched thumbnail when unmounted during persistent cache write', async () => {
		const cache = createThumbnailCache()
		const cacheSet = vi.spyOn(cache, 'set')
		let resolvePut: (() => void) | undefined
		const put = vi.fn(
			() => new Promise<void>((resolve) => {
				resolvePut = resolve
			}),
		)
		;(window as typeof window & { caches?: CacheStorage }).caches = {
			open: vi.fn().mockResolvedValue({
				match: vi.fn(),
				put,
			}),
		} as unknown as CacheStorage
		const downloadObjectThumbnail = vi.fn(() => ({
			promise: Promise.resolve({
				blob: new Blob(['thumb-network'], { type: 'image/jpeg' }),
				contentType: 'image/jpeg',
			}),
			abort: vi.fn(),
		}))
		const api = createMockApiClient({ objects: { downloadObjectThumbnail } })
		const view = render(
			<ObjectThumbnail api={api} apiToken="token-a" profileId="profile-1" bucket="bucket-a" objectKey="clip.mp4" size={24} cache={cache} />,
		)

		await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
		view.unmount()
		await act(async () => {
			resolvePut?.()
			await Promise.resolve()
			await Promise.resolve()
			await Promise.resolve()
		})

		expect(URL.createObjectURL).not.toHaveBeenCalled()
		expect(cacheSet).not.toHaveBeenCalled()
	})

	it('does not reuse persistent thumbnails from a different api token scope', async () => {
		const cache = createThumbnailCache()
		const downloadObjectThumbnail = vi.fn(() => ({
			promise: Promise.resolve({
				blob: new Blob(['thumb-network'], { type: 'image/jpeg' }),
				contentType: 'image/jpeg',
			}),
			abort: vi.fn(),
		}))
		const tokenACacheKey = buildThumbnailCacheKey(
			buildObjectThumbnailRequest({
				apiToken: 'token-a',
				profileId: 'profile-1',
				bucket: 'bucket-a',
				objectKey: 'clip.mp4',
				size: 256,
			}),
		)
		const match = vi.fn().mockResolvedValue(
			new Response(new Blob(['thumb'], { type: 'image/jpeg' }), {
				status: 200,
				headers: { 'content-type': 'image/jpeg' },
			}),
		)
		window.localStorage.setItem(PERSISTENT_THUMBNAIL_INDEX_KEY, JSON.stringify({ [tokenACacheKey]: Date.now() }))
		;(window as typeof window & { caches?: CacheStorage }).caches = {
			open: vi.fn().mockResolvedValue({
				match,
				put: vi.fn(),
			}),
		} as unknown as CacheStorage
		const api = createMockApiClient({ objects: { downloadObjectThumbnail } })

		render(<ObjectThumbnail api={api} apiToken="token-b" profileId="profile-1" bucket="bucket-a" objectKey="clip.mp4" size={24} cache={cache} />)

		await waitFor(() => expect(downloadObjectThumbnail).toHaveBeenCalledTimes(1))
		expect(match).not.toHaveBeenCalled()
	})

	it('does not refetch thumbnails after a deterministic 413 failure', async () => {
		const cache = createThumbnailCache()
		const downloadObjectThumbnail = vi.fn(() => ({
			promise: Promise.reject(new APIError({ status: 413, code: 'too_large', message: 'object is too large for thumbnail' })),
			abort: vi.fn(),
		}))
		const api = createMockApiClient({ objects: { downloadObjectThumbnail } })

		const first = render(
			<ObjectThumbnail api={api} apiToken="token-a" profileId="profile-1" bucket="bucket-a" objectKey="clip.mp4" size={24} cache={cache} />,
		)

		await waitFor(() => expect(downloadObjectThumbnail).toHaveBeenCalledTimes(1))
		first.unmount()

		render(<ObjectThumbnail api={api} apiToken="token-a" profileId="profile-1" bucket="bucket-a" objectKey="clip.mp4" size={24} cache={cache} />)

		await waitFor(() =>
			expect(
				cache.isFailed(
					buildThumbnailCacheKey(
						buildObjectThumbnailRequest({
							apiToken: 'token-a',
							profileId: 'profile-1',
							bucket: 'bucket-a',
							objectKey: 'clip.mp4',
							size: 256,
						}),
					),
				),
			).toBe(true),
		)
		expect(downloadObjectThumbnail).toHaveBeenCalledTimes(1)
	})

	it('labels thumbnail failures as preview-specific recovery states', async () => {
		const cache = createThumbnailCache()
		const downloadObjectThumbnail = vi.fn(() => ({
			promise: Promise.reject(new APIError({ status: 413, code: 'too_large', message: 'object is too large for thumbnail' })),
			abort: vi.fn(),
		}))
		const api = createMockApiClient({ objects: { downloadObjectThumbnail } })

		render(<ObjectThumbnail api={api} apiToken="token-a" profileId="profile-1" bucket="bucket-a" objectKey="clip.mp4" size={72} cache={cache} />)

		const thumbnailState = await screen.findByRole('img', { name: 'Thumbnail unavailable for clip.mp4' })
		expect(thumbnailState.textContent).toContain('Unavailable')
		expect(thumbnailState.textContent).toContain('Open large preview or use Download.')
	})

	it('retries thumbnail fetches after transient errors', async () => {
		const cache = createThumbnailCache()
		const downloadObjectThumbnail = vi.fn(() => ({
			promise: Promise.reject(new Error('network error')),
			abort: vi.fn(),
		}))
		const api = createMockApiClient({ objects: { downloadObjectThumbnail } })

		const first = render(
			<ObjectThumbnail api={api} apiToken="token-a" profileId="profile-1" bucket="bucket-a" objectKey="clip.mp4" size={24} cache={cache} />,
		)

		await waitFor(() => expect(downloadObjectThumbnail).toHaveBeenCalledTimes(1))
		first.unmount()

		render(<ObjectThumbnail api={api} apiToken="token-a" profileId="profile-1" bucket="bucket-a" objectKey="clip.mp4" size={24} cache={cache} />)

		await waitFor(() => expect(downloadObjectThumbnail).toHaveBeenCalledTimes(2))
	})
})
