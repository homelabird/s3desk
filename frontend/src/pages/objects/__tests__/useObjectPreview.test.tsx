import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useObjectPreview } from '../useObjectPreview'

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

describe('useObjectPreview', () => {
	beforeEach(() => {
		URL.createObjectURL = vi.fn(() => 'blob:video-thumb')
		URL.revokeObjectURL = vi.fn()
	})

	afterEach(() => {
		URL.createObjectURL = originalCreateObjectURL
		URL.revokeObjectURL = originalRevokeObjectURL
		Reflect.deleteProperty(window as typeof window & { caches?: CacheStorage }, 'caches')
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
		const api = { downloadObjectThumbnail, getObjectDownloadURL } as never

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
		expect(downloadObjectThumbnail).toHaveBeenCalledWith({
			profileId: 'profile-1',
			bucket: 'bucket-a',
			key: 'clip.mp4',
			size: 360,
		})
		expect(getObjectDownloadURL).not.toHaveBeenCalled()

		unmount()
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video-thumb')
	})

	it('uses persistent local cache for video previews before requesting a new thumbnail', async () => {
		const match = vi.fn().mockResolvedValue(
			new Response(new Blob(['thumb'], { type: 'image/jpeg' }), {
				status: 200,
				headers: { 'content-type': 'image/jpeg' },
			}),
		)
		;(window as typeof window & { caches?: CacheStorage }).caches = {
			open: vi.fn().mockResolvedValue({
				match,
				put: vi.fn(),
			}),
		} as unknown as CacheStorage
		const downloadObjectThumbnail = vi.fn()
		const getObjectDownloadURL = vi.fn()
		const api = { downloadObjectThumbnail, getObjectDownloadURL } as never

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
		const api = { downloadObjectThumbnail, getObjectDownloadURL } as never

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
		expect(getObjectDownloadURL).toHaveBeenCalledWith({
			profileId: 'profile-1',
			bucket: 'bucket-a',
			key: 'report.txt',
			proxy: true,
		})
		expect(fetchSpy).toHaveBeenCalledTimes(1)
	})
})
