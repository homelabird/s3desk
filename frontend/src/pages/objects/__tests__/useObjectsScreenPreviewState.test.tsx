import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { ObjectMeta } from '../../../api/types'
import { createThumbnailCache } from '../../../lib/thumbnailCache'
import { createMockApiClient } from '../../../test/mockApiClient'
import { useObjectsScreenPreviewState } from '../useObjectsScreenPreviewState'

describe('useObjectsScreenPreviewState', () => {
	it('exposes metadata errors and retries the same large-preview key without cancelling a pending retry', async () => {
		const failure = new Error('Preview metadata denied')
		const metadata: ObjectMeta = { key: 'hero.png', contentType: 'image/png', size: 1024 }
		let resolveMetadata!: (metadata: ObjectMeta) => void
		const getObjectMeta = vi.fn()
			.mockRejectedValueOnce(failure)
			.mockImplementationOnce(() => new Promise<ObjectMeta>((resolve) => { resolveMetadata = resolve }))
		const api = createMockApiClient({ objects: { getObjectMeta } })
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const thumbnailCache = createThumbnailCache()
		const wrapper = ({ children }: PropsWithChildren) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		)
		const { result } = renderHook(() => useObjectsScreenPreviewState({
			api,
			apiToken: 'token',
			profileId: 'profile-1',
			bucket: 'bucket-a',
			selectedKeys: new Set<string>(),
			selectedCount: 0,
			detailsVisible: false,
			favoritesOnly: false,
			favoriteItems: [],
			objectPages: [],
			downloadLinkProxyEnabled: false,
			presignedDownloadSupported: false,
			showThumbnails: false,
			thumbnailCache,
			setSelectedKeys: vi.fn(),
			setLastSelectedObjectKey: vi.fn(),
			setDetailsDrawerOpen: vi.fn(),
		}), { wrapper })

		act(() => result.current.openLargePreviewForKey('hero.png'))
		await waitFor(() => expect(result.current.largePreviewMetaIsError).toBe(true))
		expect(result.current.largePreviewMetaError).toBe(failure)
		expect(result.current.largePreviewMeta).toBeNull()
		expect(result.current.largePreviewMetaIsFetching).toBe(false)
		act(() => {
			result.current.refetchLargePreviewMeta()
			result.current.refetchLargePreviewMeta()
		})
		await waitFor(() => expect(result.current.largePreviewMetaIsFetching).toBe(true))
		expect(getObjectMeta).toHaveBeenCalledTimes(2)
		expect(getObjectMeta.mock.calls[1][0].key).toBe('hero.png')
		await act(async () => resolveMetadata(metadata))
		await waitFor(() => expect(result.current.largePreviewMeta).toEqual(metadata))
		expect(result.current.largePreviewMetaIsError).toBe(false)
		expect(result.current.largePreviewMetaError).toBeNull()
		expect(result.current.largePreviewMetaIsFetching).toBe(false)
	})

	it('preserves cached metadata when its large-preview refresh fails', async () => {
		const metadata: ObjectMeta = { key: 'hero.png', contentType: 'image/png', size: 1024 }
		const failure = new Error('Metadata refresh failed')
		const getObjectMeta = vi.fn().mockResolvedValueOnce(metadata).mockRejectedValueOnce(failure)
		const api = createMockApiClient({ objects: { getObjectMeta } })
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const thumbnailCache = createThumbnailCache()
		const wrapper = ({ children }: PropsWithChildren) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		)
		const { result } = renderHook(() => useObjectsScreenPreviewState({
			api,
			apiToken: 'token',
			profileId: 'profile-1',
			bucket: 'bucket-a',
			selectedKeys: new Set<string>(),
			selectedCount: 0,
			detailsVisible: false,
			favoritesOnly: false,
			favoriteItems: [],
			objectPages: [],
			downloadLinkProxyEnabled: false,
			presignedDownloadSupported: false,
			showThumbnails: false,
			thumbnailCache,
			setSelectedKeys: vi.fn(),
			setLastSelectedObjectKey: vi.fn(),
			setDetailsDrawerOpen: vi.fn(),
		}), { wrapper })
		act(() => result.current.openLargePreviewForKey('hero.png'))
		await waitFor(() => expect(result.current.largePreviewMeta).toEqual(metadata))
		act(() => result.current.refetchLargePreviewMeta())
		await waitFor(() => expect(result.current.largePreviewMetaIsError).toBe(true))
		expect(result.current.largePreviewMeta).toEqual(metadata)
		expect(result.current.largePreviewMetaError).toBe(failure)
		expect(getObjectMeta).toHaveBeenCalledTimes(2)
	})

	it('aborts details and large-preview metadata when the screen unmounts', async () => {
		const signals: AbortSignal[] = []
		const getObjectMeta = vi.fn((request: { key: string; signal?: AbortSignal }) => {
			if (request.signal) signals.push(request.signal)
			return new Promise<never>((_, reject) => {
				request.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
			})
		})
		const api = createMockApiClient({ objects: { getObjectMeta } })
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const wrapper = ({ children }: PropsWithChildren) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		)
		const { result, unmount } = renderHook(
			() =>
				useObjectsScreenPreviewState({
					api,
					apiToken: 'token',
					profileId: 'profile-1',
					bucket: 'bucket-a',
					selectedKeys: new Set(['details.txt']),
					selectedCount: 1,
					detailsVisible: true,
					favoritesOnly: false,
					favoriteItems: [],
					objectPages: [],
					downloadLinkProxyEnabled: false,
					presignedDownloadSupported: false,
					showThumbnails: false,
					thumbnailCache: createThumbnailCache(),
					setSelectedKeys: vi.fn(),
					setLastSelectedObjectKey: vi.fn(),
					setDetailsDrawerOpen: vi.fn(),
				}),
			{ wrapper },
		)

		await waitFor(() => expect(getObjectMeta).toHaveBeenCalledTimes(1))
		act(() => result.current.openLargePreviewForKey('large.txt'))
		await waitFor(() => expect(getObjectMeta).toHaveBeenCalledTimes(2))

		expect(getObjectMeta.mock.calls.map(([request]) => request.key)).toEqual(['details.txt', 'large.txt'])
		expect(signals).toHaveLength(2)

		unmount()

		expect(signals.every((signal) => signal.aborted)).toBe(true)
	})
})

it('does not reuse a late folder response for a selected MP4', async () => {
 let resolveFolder!: (value: ObjectMeta) => void
 const signals: AbortSignal[] = []
 const video = { key: 'the+winning+ticket+1080.mp4', size: 768531432, contentType: 'video/mp4' }
 const api = createMockApiClient({ objects: { getObjectMeta: vi.fn(({ key, signal }) => {
  if (signal) signals.push(signal)
  return key === 'folder/' ? new Promise<ObjectMeta>(resolve => { resolveFolder = resolve }) : Promise.resolve(video)
 }) } })
 const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
 const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
 const cache = createThumbnailCache()
 const { result, rerender } = renderHook(({ key }) => useObjectsScreenPreviewState({
  api, apiToken: 'token', profileId: 'profile-1', bucket: 'demo', selectedKeys: new Set([key]), selectedCount: 1,
  detailsVisible: true, favoritesOnly: false, favoriteItems: [], objectPages: [], downloadLinkProxyEnabled: false,
  presignedDownloadSupported: false, showThumbnails: false, thumbnailCache: cache,
  setSelectedKeys: vi.fn(), setLastSelectedObjectKey: vi.fn(), setDetailsDrawerOpen: vi.fn(),
 }), { wrapper, initialProps: { key: 'folder/' } })
 await waitFor(() => expect(signals).toHaveLength(1))
 rerender({ key: video.key })
 await waitFor(() => expect(result.current.detailsMeta).toEqual(video))
 expect(signals[0].aborted).toBe(true)
 await act(async () => resolveFolder({ key: 'folder/', size: 0, contentType: 'inode/directory' }))
 expect(result.current.detailsMeta).toEqual(video)
 act(() => result.current.openLargePreviewForKey(video.key))
 await waitFor(() => expect(result.current.largePreviewMeta).toEqual(video))
})
