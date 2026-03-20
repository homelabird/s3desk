import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockApiClient } from '../../../test/mockApiClient'
import { buildThumbnailCacheKey } from '../../../lib/thumbnailCache'
import { buildObjectThumbnailRequest } from '../objectPreviewPolicy'
import { useObjectPreview } from '../useObjectPreview'

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
const PERSISTENT_THUMBNAIL_INDEX_KEY = 's3desk-thumbnail-blobs-v1:index'

describe('useObjectPreview', () => {
	beforeEach(() => {
		URL.createObjectURL = vi.fn(() => 'blob:video-thumb')
		URL.revokeObjectURL = vi.fn()
	})

	afterEach(() => {
		URL.createObjectURL = originalCreateObjectURL
		URL.revokeObjectURL = originalRevokeObjectURL
		Reflect.deleteProperty(window as typeof window & { caches?: CacheStorage }, 'caches')
		window.localStorage.removeItem(PERSISTENT_THUMBNAIL_INDEX_KEY)
		vi.restoreAllMocks()
	})

	it('loads a larger thumbnail preview for video objects', async () => {
		const abort = vi.fn()
		const downloadObjectThumbnail = vi.fn(() => ({
			promise: Promise.resolve({
				blob: new Blob(['thumb'], { type: 'image/jpeg' }),
				contentType: 'image/jpeg',
			}),
			abort,
		}))
		const getObjectDownloadURL = vi.fn()
		const api = createMockApiClient({ objects: { downloadObjectThumbnail, getObjectDownloadURL } })

		const { result, unmount } = renderHook(() =>
			useObjectPreview({
				api,
				profileId: 'profile-1',
				bucket: 'bucket-a',
				detailsKey: 'clip.mp4',
				detailsVisible: true,
				detailsMeta: {
					key: 'clip.mp4',
					contentType: 'video/mp4',
					size: 52_386_776,
				} as never,
				downloadLinkProxyEnabled: false,
				presignedDownloadSupported: true,
			}),
		)

		await act(async () => {
			await result.current.loadPreview()
		})

		await waitFor(() => expect(result.current.preview?.status).toBe('ready'))
		expect(result.current.preview).toMatchObject({
			key: 'clip.mp4',
			status: 'ready',
			kind: 'video',
			contentType: 'image/jpeg',
			url: 'blob:video-thumb',
		})
		expect(downloadObjectThumbnail).toHaveBeenCalledWith(expect.objectContaining({
			profileId: 'profile-1',
			bucket: 'bucket-a',
			key: 'clip.mp4',
			size: 360,
		}))
		expect(getObjectDownloadURL).not.toHaveBeenCalled()

		unmount()
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video-thumb')
	})

	it('uses persistent local cache for video previews before requesting a new thumbnail', async () => {
		const cacheKey = buildThumbnailCacheKey(
			buildObjectThumbnailRequest({
				profileId: 'profile-1',
				bucket: 'bucket-a',
				objectKey: 'clip.mp4',
				size: 360,
				etag: 'etag-1',
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
		const downloadObjectThumbnail = vi.fn()
		const getObjectDownloadURL = vi.fn()
		const api = createMockApiClient({ objects: { downloadObjectThumbnail, getObjectDownloadURL } })

		const { result, unmount } = renderHook(() =>
			useObjectPreview({
				api,
				profileId: 'profile-1',
				bucket: 'bucket-a',
				detailsKey: 'clip.mp4',
				detailsVisible: true,
				detailsMeta: {
					key: 'clip.mp4',
					contentType: 'video/mp4',
					size: 52_386_776,
					etag: 'etag-1',
				} as never,
				downloadLinkProxyEnabled: false,
				presignedDownloadSupported: true,
			}),
		)

		await act(async () => {
			await result.current.loadPreview()
		})

		await waitFor(() => expect(result.current.preview?.status).toBe('ready'))
		expect(downloadObjectThumbnail).not.toHaveBeenCalled()
		expect(getObjectDownloadURL).not.toHaveBeenCalled()
		unmount()
	})

	it('forces proxy download URLs when direct presigned links are unsupported', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(new Blob(['hello'], { type: 'text/plain' }), { status: 200, headers: { 'content-type': 'text/plain' } }))
		const getObjectDownloadURL = vi.fn().mockResolvedValue({
			url: 'http://127.0.0.1:8080/download-proxy?key=report.txt',
			expiresAt: '2026-03-09T00:00:00Z',
		})
		const downloadObjectThumbnail = vi.fn()
		const api = createMockApiClient({ objects: { downloadObjectThumbnail, getObjectDownloadURL } })

		const { result } = renderHook(() =>
			useObjectPreview({
				api,
				profileId: 'profile-1',
				bucket: 'bucket-a',
				detailsKey: 'report.txt',
				detailsVisible: true,
				detailsMeta: {
					key: 'report.txt',
					contentType: 'text/plain',
					size: 5,
				} as never,
				downloadLinkProxyEnabled: false,
				presignedDownloadSupported: false,
			}),
		)

		await act(async () => {
			await result.current.loadPreview()
		})

		await waitFor(() => expect(result.current.preview?.status).toBe('ready'))
		expect(getObjectDownloadURL).toHaveBeenCalledWith(expect.objectContaining({
			profileId: 'profile-1',
			bucket: 'bucket-a',
			key: 'report.txt',
			proxy: true,
		}))
		expect(fetchSpy).toHaveBeenCalledTimes(1)
	})

	it('loads a direct image preview for PNG objects and reuses it as an image preview asset', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(new Blob(['png'], { type: 'image/png' }), { status: 200, headers: { 'content-type': 'image/png' } }))
		const getObjectDownloadURL = vi.fn().mockResolvedValue({
			url: 'http://storage.local/direct.png',
			expiresAt: '2026-03-09T00:00:00Z',
		})
		const downloadObjectThumbnail = vi.fn()
		const api = createMockApiClient({ objects: { downloadObjectThumbnail, getObjectDownloadURL } })

		const { result } = renderHook(() =>
			useObjectPreview({
				api,
				profileId: 'profile-1',
				bucket: 'bucket-a',
				detailsKey: 'image.png',
				detailsVisible: true,
				detailsMeta: {
					key: 'image.png',
					contentType: 'image/png',
					size: 1024,
				} as never,
				downloadLinkProxyEnabled: false,
				presignedDownloadSupported: true,
			}),
		)

		await act(async () => {
			await result.current.loadPreview()
		})

		await waitFor(() => expect(result.current.preview?.status).toBe('ready'))
		expect(result.current.preview).toMatchObject({
			key: 'image.png',
			status: 'ready',
			kind: 'image',
			contentType: 'image/png',
			url: 'blob:video-thumb',
		})
		expect(getObjectDownloadURL).toHaveBeenCalledWith(expect.objectContaining({
			profileId: 'profile-1',
			bucket: 'bucket-a',
			key: 'image.png',
			proxy: false,
			size: 1024,
			contentType: 'image/png',
		}))
		expect(downloadObjectThumbnail).not.toHaveBeenCalled()
		expect(fetchSpy).toHaveBeenCalledTimes(1)
	})

	it('treats GIF objects as image previews instead of video thumbnail flows', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(new Blob(['gif'], { type: 'image/gif' }), { status: 200, headers: { 'content-type': 'image/gif' } }))
		const getObjectDownloadURL = vi.fn().mockResolvedValue({
			url: 'http://storage.local/animated.gif',
			expiresAt: '2026-03-09T00:00:00Z',
		})
		const downloadObjectThumbnail = vi.fn()
		const api = createMockApiClient({ objects: { downloadObjectThumbnail, getObjectDownloadURL } })

		const { result } = renderHook(() =>
			useObjectPreview({
				api,
				profileId: 'profile-1',
				bucket: 'bucket-a',
				detailsKey: 'clip.gif',
				detailsVisible: true,
				detailsMeta: {
					key: 'clip.gif',
					contentType: 'image/gif',
					size: 2048,
				} as never,
				downloadLinkProxyEnabled: false,
				presignedDownloadSupported: true,
			}),
		)

		await act(async () => {
			await result.current.loadPreview()
		})

		await waitFor(() => expect(result.current.preview?.status).toBe('ready'))
		expect(result.current.preview).toMatchObject({
			key: 'clip.gif',
			status: 'ready',
			kind: 'image',
			contentType: 'image/gif',
			url: 'blob:video-thumb',
		})
		expect(downloadObjectThumbnail).not.toHaveBeenCalled()
		expect(getObjectDownloadURL).toHaveBeenCalledWith(expect.objectContaining({
			profileId: 'profile-1',
			bucket: 'bucket-a',
			key: 'clip.gif',
			proxy: false,
			size: 2048,
			contentType: 'image/gif',
		}))
		expect(fetchSpy).toHaveBeenCalledTimes(1)
	})
})
