import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { createThumbnailCache } from '../../../lib/thumbnailCache'
import { createMockApiClient } from '../../../test/mockApiClient'
import { useObjectsScreenPreviewState } from '../useObjectsScreenPreviewState'

describe('useObjectsScreenPreviewState', () => {
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
