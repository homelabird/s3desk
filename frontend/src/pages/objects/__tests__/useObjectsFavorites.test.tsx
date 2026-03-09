import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useObjectsFavorites } from '../useObjectsFavorites'

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
			mutations: {
				retry: false,
			},
		},
	})

	function Wrapper(props: PropsWithChildren) {
		return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
	}

	return { queryClient, Wrapper }
}

describe('useObjectsFavorites', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('loads DB-backed summary first and only hydrates remote metadata when requested', async () => {
		const listObjectFavorites = vi
			.fn()
			.mockResolvedValueOnce({
				bucket: 'bucket-a',
				prefix: '',
				count: 2,
				keys: ['docs/readme.txt', 'videos/demo.mp4'],
				hydrated: false,
				items: [],
			})
			.mockResolvedValueOnce({
				bucket: 'bucket-a',
				prefix: '',
				count: 2,
				keys: ['docs/readme.txt', 'videos/demo.mp4'],
				hydrated: true,
				items: [
					{
						key: 'docs/readme.txt',
						size: 12,
						lastModified: '2026-03-09T00:00:00Z',
						createdAt: '2026-03-09T00:00:00Z',
					},
				],
			})
		const api = {
			listObjectFavorites,
			createObjectFavorite: vi.fn(),
			deleteObjectFavorite: vi.fn(),
		} as never
		const { Wrapper } = createWrapper()

		const { result, rerender } = renderHook(
			(props: { hydrateItems: boolean }) =>
				useObjectsFavorites({
					api,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					apiToken: 'token',
					objectsPages: [],
					hydrateItems: props.hydrateItems,
				}),
			{
				initialProps: { hydrateItems: false },
				wrapper: Wrapper,
			},
		)

		await waitFor(() => expect(result.current.favoriteCount).toBe(2))
		expect(result.current.favoriteItems).toEqual([])
		expect(listObjectFavorites).toHaveBeenNthCalledWith(1, {
			profileId: 'profile-1',
			bucket: 'bucket-a',
			hydrate: false,
		})

		rerender({ hydrateItems: true })

		await waitFor(() => expect(result.current.favoriteItems).toHaveLength(1))
		expect(listObjectFavorites).toHaveBeenNthCalledWith(2, {
			profileId: 'profile-1',
			bucket: 'bucket-a',
			hydrate: true,
		})
	})
})
