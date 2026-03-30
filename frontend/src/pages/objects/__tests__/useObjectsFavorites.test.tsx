import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMockApiClient } from '../../../test/mockApiClient'
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

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
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
		const api = createMockApiClient({
			objects: {
				listObjectFavorites,
				createObjectFavorite: vi.fn(),
				deleteObjectFavorite: vi.fn(),
			},
		})
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

	it('ignores stale favorite-add responses after the objects context changes', async () => {
		const createFavoriteRequest = deferred<{ key: string; createdAt: string }>()
		const api = createMockApiClient({
			objects: {
				listObjectFavorites: vi.fn(({ bucket, hydrate }: { bucket: string; hydrate?: boolean }) =>
					Promise.resolve({
						bucket,
						prefix: '',
						count: bucket === 'bucket-a' ? 1 : 1,
						keys: bucket === 'bucket-a' ? ['docs/readme.txt'] : ['archive/keep.txt'],
						hydrated: hydrate,
						items: hydrate
							? [
									{
										key: bucket === 'bucket-a' ? 'docs/readme.txt' : 'archive/keep.txt',
										size: 12,
										lastModified: '2026-03-09T00:00:00Z',
										createdAt: '2026-03-09T00:00:00Z',
									},
								]
							: [],
					} as never),
				),
				createObjectFavorite: vi.fn().mockReturnValue(createFavoriteRequest.promise),
				deleteObjectFavorite: vi.fn(),
			},
		})
		const { Wrapper } = createWrapper()

		const { result, rerender } = renderHook(
			(props: { profileId: string | null; bucket: string }) =>
				useObjectsFavorites({
					api,
					profileId: props.profileId,
					bucket: props.bucket,
					apiToken: 'token',
					objectsPages: [],
					hydrateItems: true,
				}),
			{
				initialProps: { profileId: 'profile-1', bucket: 'bucket-a' },
				wrapper: Wrapper,
			},
		)

		await waitFor(() => expect(result.current.favoriteKeys.has('docs/readme.txt')).toBe(true))

		act(() => {
			result.current.toggleFavorite('logs/new.txt')
		})

		await waitFor(() => expect(result.current.favoritePendingKeys.has('logs/new.txt')).toBe(true))

		rerender({ profileId: 'profile-2', bucket: 'bucket-b' })
		await waitFor(() => expect(result.current.favoriteKeys.has('archive/keep.txt')).toBe(true))

		await act(async () => {
			createFavoriteRequest.resolve({ key: 'logs/new.txt', createdAt: '2026-03-10T00:00:00Z' })
			await Promise.resolve()
		})

		expect(result.current.favoriteKeys.has('logs/new.txt')).toBe(false)
		expect(result.current.favoriteKeys.has('archive/keep.txt')).toBe(true)
		expect(result.current.favoritePendingKeys.size).toBe(0)
	})

	it('ignores stale favorite-remove responses after the objects context changes', async () => {
		const deleteFavoriteRequest = deferred<void>()
		const api = createMockApiClient({
			objects: {
				listObjectFavorites: vi.fn(({ bucket, hydrate }: { bucket: string; hydrate?: boolean }) =>
					Promise.resolve({
						bucket,
						prefix: '',
						count: 1,
						keys: [bucket === 'bucket-a' ? 'docs/readme.txt' : 'archive/keep.txt'],
						hydrated: hydrate,
						items: hydrate
							? [
									{
										key: bucket === 'bucket-a' ? 'docs/readme.txt' : 'archive/keep.txt',
										size: 12,
										lastModified: '2026-03-09T00:00:00Z',
										createdAt: '2026-03-09T00:00:00Z',
									},
								]
							: [],
					} as never),
				),
				createObjectFavorite: vi.fn(),
				deleteObjectFavorite: vi.fn().mockReturnValue(deleteFavoriteRequest.promise),
			},
		})
		const { Wrapper } = createWrapper()

		const { result, rerender } = renderHook(
			(props: { profileId: string | null; bucket: string }) =>
				useObjectsFavorites({
					api,
					profileId: props.profileId,
					bucket: props.bucket,
					apiToken: 'token',
					objectsPages: [],
					hydrateItems: true,
				}),
			{
				initialProps: { profileId: 'profile-1', bucket: 'bucket-a' },
				wrapper: Wrapper,
			},
		)

		await waitFor(() => expect(result.current.favoriteKeys.has('docs/readme.txt')).toBe(true))

		act(() => {
			result.current.toggleFavorite('docs/readme.txt')
		})

		await waitFor(() => expect(result.current.favoritePendingKeys.has('docs/readme.txt')).toBe(true))

		rerender({ profileId: 'profile-2', bucket: 'bucket-b' })
		await waitFor(() => expect(result.current.favoriteKeys.has('archive/keep.txt')).toBe(true))

		await act(async () => {
			deleteFavoriteRequest.resolve()
			await Promise.resolve()
		})

		expect(result.current.favoriteKeys.has('docs/readme.txt')).toBe(false)
		expect(result.current.favoriteKeys.has('archive/keep.txt')).toBe(true)
		expect(result.current.favoritePendingKeys.size).toBe(0)
	})
})
