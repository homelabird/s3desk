import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { queryKeys } from '../../../api/queryKeys'
import { createMockApiClient } from '../../../test/mockApiClient'
import { useObjectsFavorites } from '../useObjectsFavorites'

function createWrapper(options: { queryRetry?: boolean | number } = {}) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: options.queryRetry ?? false,
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
			signal: expect.any(AbortSignal),
		})

		rerender({ hydrateItems: true })

		await waitFor(() => expect(result.current.favoriteItems).toHaveLength(1))
		expect(listObjectFavorites).toHaveBeenNthCalledWith(2, {
			profileId: 'profile-1',
			bucket: 'bucket-a',
			hydrate: true,
			signal: expect.any(AbortSignal),
		})
	})

	it('aborts the active favorite request when hydration mode changes', async () => {
		const requests: Array<{ hydrate?: boolean; signal?: AbortSignal }> = []
		const listObjectFavorites = vi.fn((request: { hydrate?: boolean; signal?: AbortSignal }) => {
			requests.push(request)
			return new Promise<never>(() => {})
		})
		const api = createMockApiClient({
			objects: {
				listObjectFavorites,
				createObjectFavorite: vi.fn(),
				deleteObjectFavorite: vi.fn(),
			},
		})
		const { Wrapper } = createWrapper()

		const { rerender } = renderHook(
			(props: { hydrateItems: boolean }) =>
				useObjectsFavorites({
					api,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					apiToken: 'token',
					objectsPages: [],
					hydrateItems: props.hydrateItems,
				}),
			{ initialProps: { hydrateItems: false }, wrapper: Wrapper },
		)

		await waitFor(() => expect(requests[0]?.signal).toBeInstanceOf(AbortSignal))
		const summarySignal = requests[0]!.signal!
		rerender({ hydrateItems: true })
		await waitFor(() => expect(summarySignal.aborted).toBe(true))
		await waitFor(() => expect(requests[1]?.signal).toBeInstanceOf(AbortSignal))

		const itemsSignal = requests[1]!.signal!
		rerender({ hydrateItems: false })
		await waitFor(() => expect(itemsSignal.aborted).toBe(true))
	})

	it('uses one hydrated request on initial expanded load without creating a partial summary cache', async () => {
		const listObjectFavorites = vi.fn().mockResolvedValue({
			bucket: 'bucket-a',
			prefix: '',
			count: 2,
			keys: ['docs/readme.txt', 'missing.txt'],
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
		const createObjectFavorite = vi.fn().mockResolvedValue({
			key: 'logs/new.txt',
			createdAt: '2026-03-10T00:00:00Z',
		})
		const api = createMockApiClient({
			objects: {
				listObjectFavorites,
				createObjectFavorite,
				deleteObjectFavorite: vi.fn(),
			},
		})
		const { queryClient, Wrapper } = createWrapper()

		const { result } = renderHook(
			() =>
				useObjectsFavorites({
					api,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					apiToken: 'token',
					objectsPages: [],
					hydrateItems: true,
				}),
			{ wrapper: Wrapper },
		)

		await waitFor(() => expect(result.current.favoriteCount).toBe(2))
		expect(listObjectFavorites).toHaveBeenCalledTimes(1)
		expect(listObjectFavorites).toHaveBeenCalledWith({
			profileId: 'profile-1',
			bucket: 'bucket-a',
			hydrate: true,
			signal: expect.any(AbortSignal),
		})
		expect(result.current.favoriteKeys).toEqual(new Set(['docs/readme.txt', 'missing.txt']))

		act(() => {
			result.current.toggleFavorite('logs/new.txt')
		})
		await waitFor(() => expect(result.current.favoriteKeys.has('logs/new.txt')).toBe(true))
		expect(queryClient.getQueryData(queryKeys.objects.favoritesSummary('profile-1', 'bucket-a', 'token'))).toBeUndefined()
	})

	it('falls back to DB-only keys when remote hydration fails', async () => {
		const listObjectFavorites = vi.fn(({ hydrate }: { hydrate?: boolean }) =>
			hydrate
				? Promise.reject(new Error('remote metadata unavailable'))
				: Promise.resolve({
						bucket: 'bucket-a',
						prefix: '',
						count: 2,
						keys: ['docs/readme.txt', 'missing.txt'],
						hydrated: false,
						items: [],
					}),
		)
		const api = createMockApiClient({
			objects: {
				listObjectFavorites,
				createObjectFavorite: vi.fn(),
				deleteObjectFavorite: vi.fn(),
			},
		})
		const { Wrapper } = createWrapper()

		const { result } = renderHook(
			() =>
				useObjectsFavorites({
					api,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					apiToken: 'token',
					objectsPages: [],
					hydrateItems: true,
				}),
			{ wrapper: Wrapper },
		)

		await waitFor(() => expect(result.current.favoriteKeys.has('missing.txt')).toBe(true))
		expect(listObjectFavorites).toHaveBeenCalledTimes(2)
		expect(listObjectFavorites).toHaveBeenNthCalledWith(1, expect.objectContaining({ hydrate: true }))
		expect(listObjectFavorites).toHaveBeenNthCalledWith(2, expect.objectContaining({ hydrate: false }))
		expect(result.current.favoritesQuery.isError).toBe(true)
	})

	it('prefers a fresh DB summary after a hydrated background refresh fails', async () => {
		const listObjectFavorites = vi
			.fn()
			.mockResolvedValueOnce({
				bucket: 'bucket-a',
				prefix: '',
				count: 1,
				keys: ['docs/readme.txt'],
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
			.mockRejectedValueOnce(new Error('remote metadata unavailable'))
			.mockResolvedValueOnce({
				bucket: 'bucket-a',
				prefix: '',
				count: 2,
				keys: ['docs/readme.txt', 'missing.txt'],
				hydrated: false,
				items: [],
			})
		const api = createMockApiClient({
			objects: {
				listObjectFavorites,
				createObjectFavorite: vi.fn(),
				deleteObjectFavorite: vi.fn(),
			},
		})
		const { queryClient, Wrapper } = createWrapper()

		const { result } = renderHook(
			() =>
				useObjectsFavorites({
					api,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					apiToken: 'token',
					objectsPages: [],
					hydrateItems: true,
				}),
			{ wrapper: Wrapper },
		)

		await waitFor(() => expect(result.current.favoriteCount).toBe(1))
		await act(async () => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.objects.favoritesItems('profile-1', 'bucket-a', 'token'),
				exact: true,
			})
		})

		await waitFor(() => expect(result.current.favoriteKeys.has('missing.txt')).toBe(true))
		expect(result.current.favoriteCount).toBe(2)
		expect(result.current.favoritesQuery.isError).toBe(true)
		expect(listObjectFavorites).toHaveBeenCalledTimes(3)
	})

	it('refetches the active mode after a mutation cancels an empty in-flight cache', async () => {
		const staleHydration = deferred<{
			bucket: string
			prefix: string
			count: number
			keys: string[]
			hydrated: boolean
			items: never[]
		}>()
		let hydrateCalls = 0
		const listObjectFavorites = vi.fn(({ hydrate, signal }: { hydrate?: boolean; signal?: AbortSignal }) => {
			if (!hydrate) {
				return Promise.resolve({
					bucket: 'bucket-a',
					prefix: '',
					count: 1,
					keys: ['docs/readme.txt'],
					hydrated: false,
					items: [],
				})
			}
			hydrateCalls += 1
			if (hydrateCalls === 1) {
				signal?.addEventListener('abort', () => staleHydration.reject(signal.reason), { once: true })
				return staleHydration.promise
			}
			return Promise.resolve({
				bucket: 'bucket-a',
				prefix: '',
				count: 2,
				keys: ['docs/readme.txt', 'logs/new.txt'],
				hydrated: true,
				items: [
					{ key: 'docs/readme.txt', size: 12, lastModified: '2026-03-09T00:00:00Z', createdAt: '2026-03-09T00:00:00Z' },
					{ key: 'logs/new.txt', size: 0, lastModified: '2026-03-10T00:00:00Z', createdAt: '2026-03-10T00:00:00Z' },
				],
			})
		})
		const api = createMockApiClient({
			objects: {
				listObjectFavorites,
				createObjectFavorite: vi.fn().mockResolvedValue({ key: 'logs/new.txt', createdAt: '2026-03-10T00:00:00Z' }),
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
			{ initialProps: { hydrateItems: false }, wrapper: Wrapper },
		)

		await waitFor(() => expect(result.current.favoriteKeys.has('docs/readme.txt')).toBe(true))
		rerender({ hydrateItems: true })
		await waitFor(() => expect(listObjectFavorites).toHaveBeenCalledTimes(2))
		act(() => {
			result.current.toggleFavorite('logs/new.txt')
		})
		await waitFor(() => expect(listObjectFavorites).toHaveBeenCalledTimes(3))

		await act(async () => {
			staleHydration.resolve({
				bucket: 'bucket-a',
				prefix: '',
				count: 1,
				keys: ['docs/readme.txt'],
				hydrated: true,
				items: [],
			})
			await Promise.resolve()
		})

		await waitFor(() => expect(result.current.favoriteKeys.has('logs/new.txt')).toBe(true))
		expect(result.current.favoriteCount).toBe(2)
	})

	it('restarts an empty query when the mutation fails after cancellation', async () => {
		const firstHydration = deferred<never>()
		const listObjectFavorites = vi
			.fn()
			.mockResolvedValueOnce({
				bucket: 'bucket-a',
				prefix: '',
				count: 1,
				keys: ['docs/readme.txt'],
				hydrated: false,
				items: [],
			})
			.mockImplementationOnce(({ signal }: { signal?: AbortSignal }) => {
				signal?.addEventListener('abort', () => firstHydration.reject(signal.reason), { once: true })
				return firstHydration.promise
			})
			.mockResolvedValueOnce({
				bucket: 'bucket-a',
				prefix: '',
				count: 1,
				keys: ['docs/readme.txt'],
				hydrated: true,
				items: [{ key: 'docs/readme.txt', size: 12, lastModified: '2026-03-09T00:00:00Z', createdAt: '2026-03-09T00:00:00Z' }],
			})
		const api = createMockApiClient({
			objects: {
				listObjectFavorites,
				createObjectFavorite: vi.fn().mockRejectedValue(new Error('favorite write failed')),
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
			{ initialProps: { hydrateItems: false }, wrapper: Wrapper },
		)

		await waitFor(() => expect(result.current.favoriteKeys.has('docs/readme.txt')).toBe(true))
		rerender({ hydrateItems: true })
		await waitFor(() => expect(listObjectFavorites).toHaveBeenCalledTimes(2))
		act(() => {
			result.current.toggleFavorite('logs/new.txt')
		})

		await waitFor(() => expect(listObjectFavorites).toHaveBeenCalledTimes(3))
		await waitFor(() => expect(result.current.favoriteKeys.has('docs/readme.txt')).toBe(true))
		expect(result.current.favoritePendingKeys.size).toBe(0)
	})

	it('disables visible favorite actions until the scoped favorite state resolves', async () => {
		const initialFavorites = deferred<never>()
		const createObjectFavorite = vi.fn()
		const api = createMockApiClient({
			objects: {
				listObjectFavorites: vi.fn().mockReturnValue(initialFavorites.promise),
				createObjectFavorite,
				deleteObjectFavorite: vi.fn(),
			},
		})
		const { Wrapper } = createWrapper()

		const { result } = renderHook(
			() =>
				useObjectsFavorites({
					api,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					apiToken: 'token',
					objectsPages: [
						{
							bucket: 'bucket-a',
							prefix: '',
							delimiter: '/',
							commonPrefixes: [],
							items: [{ key: 'docs/readme.txt', size: 12, lastModified: '2026-03-09T00:00:00Z' }],
							isTruncated: false,
						},
					],
					hydrateItems: true,
				}),
			{ wrapper: Wrapper },
		)

		await waitFor(() => expect(result.current.favoritePendingKeys.has('docs/readme.txt')).toBe(true))
		act(() => {
			result.current.toggleFavorite('docs/readme.txt')
		})
		expect(createObjectFavorite).not.toHaveBeenCalled()
	})

	it('restarts a canceled background favorite refresh after mutation', async () => {
		const backgroundRefresh = deferred<never>()
		const listObjectFavorites = vi
			.fn()
			.mockResolvedValueOnce({
				bucket: 'bucket-a',
				prefix: '',
				count: 1,
				keys: ['docs/readme.txt'],
				hydrated: false,
				items: [],
			})
			.mockReturnValueOnce(backgroundRefresh.promise)
			.mockResolvedValueOnce({
				bucket: 'bucket-a',
				prefix: '',
				count: 2,
				keys: ['docs/readme.txt', 'logs/new.txt'],
				hydrated: false,
				items: [],
			})
		const api = createMockApiClient({
			objects: {
				listObjectFavorites,
				createObjectFavorite: vi.fn().mockResolvedValue({ key: 'logs/new.txt', createdAt: '2026-03-10T00:00:00Z' }),
				deleteObjectFavorite: vi.fn(),
			},
		})
		const { queryClient, Wrapper } = createWrapper()

		const { result } = renderHook(
			() =>
				useObjectsFavorites({
					api,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					apiToken: 'token',
					objectsPages: [],
					hydrateItems: false,
				}),
			{ wrapper: Wrapper },
		)

		await waitFor(() => expect(result.current.favoriteKeys.has('docs/readme.txt')).toBe(true))
		await act(async () => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.objects.favoritesSummary('profile-1', 'bucket-a', 'token'),
				exact: true,
			})
		})
		await waitFor(() => expect(listObjectFavorites).toHaveBeenCalledTimes(2))
		act(() => {
			result.current.toggleFavorite('logs/new.txt')
		})

		await waitFor(() => expect(listObjectFavorites).toHaveBeenCalledTimes(3))
		await waitFor(() => expect(result.current.favoriteKeys.has('logs/new.txt')).toBe(true))
	})

	it('surfaces favorite load failures without inheriting global query retries', async () => {
		const listObjectFavorites = vi.fn().mockRejectedValue(new Error('favorites backend unavailable'))
		const api = createMockApiClient({
			objects: {
				listObjectFavorites,
				createObjectFavorite: vi.fn(),
				deleteObjectFavorite: vi.fn(),
			},
		})
		const { Wrapper } = createWrapper({ queryRetry: 3 })

		const { result } = renderHook(
			() =>
				useObjectsFavorites({
					api,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					apiToken: 'token',
					objectsPages: [],
					hydrateItems: false,
				}),
			{
				wrapper: Wrapper,
			},
		)

		await waitFor(() => expect(result.current.favoritesQuery.isError).toBe(true))
		expect(listObjectFavorites).toHaveBeenCalledTimes(1)
	})

	it('does not load or mutate favorites when object capability disables favorites', () => {
		const listObjectFavorites = vi.fn()
		const createObjectFavorite = vi.fn()
		const deleteObjectFavorite = vi.fn()
		const api = createMockApiClient({
			objects: {
				listObjectFavorites,
				createObjectFavorite,
				deleteObjectFavorite,
			},
		})
		const { Wrapper } = createWrapper()

		const { result } = renderHook(
			() =>
				useObjectsFavorites({
					api,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					apiToken: 'token',
					objectsPages: [],
					hydrateItems: true,
					enabled: false,
				}),
			{
				wrapper: Wrapper,
			},
		)

		act(() => {
			result.current.toggleFavorite('docs/readme.txt')
		})

		expect(result.current.favoritesQuery.fetchStatus).toBe('idle')
		expect(listObjectFavorites).not.toHaveBeenCalled()
		expect(createObjectFavorite).not.toHaveBeenCalled()
		expect(deleteObjectFavorite).not.toHaveBeenCalled()
	})

	it('preserves and cleans up pending mutations independently across scopes', async () => {
		const firstScopeRequest = deferred<{ key: string; createdAt: string }>()
		const bridgeScopeRequest = deferred<{ key: string; createdAt: string }>()
		const createObjectFavorite = vi.fn(({ bucket }: { bucket: string }) => {
			if (bucket === 'bucket-b') return bridgeScopeRequest.promise
			return firstScopeRequest.promise
		})
		const api = createMockApiClient({
			objects: {
				listObjectFavorites: vi.fn(({ bucket, hydrate }: { bucket: string; hydrate?: boolean }) =>
					Promise.resolve({
						bucket,
						prefix: '',
						count: 1,
						keys: [bucket === 'bucket-a' ? 'docs/readme.txt' : 'archive/keep.txt'],
						hydrated: hydrate,
						items: [],
					} as never),
				),
				createObjectFavorite,
				deleteObjectFavorite: vi.fn(),
			},
		})
		const { Wrapper } = createWrapper()
		const { result, rerender } = renderHook(
			(props: { profileId: string; bucket: string }) =>
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
		act(() => result.current.toggleFavorite('logs/new.txt'))
		await waitFor(() => expect(result.current.favoritePendingKeys.has('logs/new.txt')).toBe(true))

		rerender({ profileId: 'profile-2', bucket: 'bucket-b' })
		await waitFor(() => expect(result.current.favoriteKeys.has('archive/keep.txt')).toBe(true))
		act(() => result.current.toggleFavorite('archive/new.txt'))
		await waitFor(() => expect(result.current.favoritePendingKeys.has('archive/new.txt')).toBe(true))

		rerender({ profileId: 'profile-1', bucket: 'bucket-a' })
		expect(result.current.favoritePendingKeys.has('logs/new.txt')).toBe(true)
		act(() => result.current.toggleFavorite('logs/new.txt'))
		expect(createObjectFavorite).toHaveBeenCalledTimes(2)

		await act(async () => {
			bridgeScopeRequest.resolve({ key: 'archive/new.txt', createdAt: '2026-03-10T00:00:00Z' })
			await Promise.resolve()
		})
		expect(result.current.favoritePendingKeys.has('logs/new.txt')).toBe(true)

		rerender({ profileId: 'profile-2', bucket: 'bucket-b' })
		expect(result.current.favoritePendingKeys.has('archive/new.txt')).toBe(false)
		rerender({ profileId: 'profile-1', bucket: 'bucket-a' })
		expect(result.current.favoritePendingKeys.has('logs/new.txt')).toBe(true)

		await act(async () => {
			firstScopeRequest.resolve({ key: 'logs/new.txt', createdAt: '2026-03-10T00:00:01Z' })
			await Promise.resolve()
		})
		await waitFor(() => expect(result.current.favoritePendingKeys.has('logs/new.txt')).toBe(false))
	})

	it.each([
		{ operation: 'add', change: 'profile' }, { operation: 'remove', change: 'profile' },
		{ operation: 'add', change: 'auth' }, { operation: 'remove', change: 'auth' },
	] as const)('keeps an offline favorite $operation bound to its origin after $change changes', async ({ operation, change }) => {
		const key = 'docs/readme.txt'
		const originalKeys = new Set(operation === 'remove' ? [key] : [])
		const listObjectFavorites = vi.fn(({ bucket }: { bucket: string }) => Promise.resolve({
			bucket, prefix: '', count: originalKeys.size,
			keys: Array.from(originalKeys), hydrated: true, items: [],
		}))
		const originalCreate = vi.fn(async () => {
			originalKeys.add(key)
			return { key, createdAt: '2026-09-08T00:00:00Z' }
		})
		const originalDelete = vi.fn(async () => { originalKeys.delete(key) })
		const nextCreate = vi.fn().mockResolvedValue({ key, createdAt: '2026-09-08T00:00:00Z' })
		const nextDelete = vi.fn().mockResolvedValue(undefined)
		const api = createMockApiClient({ objects: { listObjectFavorites, createObjectFavorite: originalCreate, deleteObjectFavorite: originalDelete } })
		const nextApi = createMockApiClient({ objects: { listObjectFavorites, createObjectFavorite: nextCreate, deleteObjectFavorite: nextDelete } })
		const { Wrapper, queryClient } = createWrapper()
		const initialProps = { api, profileId: 'profile-1', bucket: 'bucket-a', apiToken: 'token-a' }
		const { result, rerender } = renderHook(
			(props) => useObjectsFavorites({ ...props, objectsPages: [], hydrateItems: true }),
			{ initialProps, wrapper: Wrapper },
		)
		try {
			await waitFor(() => expect(result.current.favoritesQuery.isSuccess).toBe(true))
			onlineManager.setOnline(false)
			act(() => result.current.toggleFavorite(key))
			await waitFor(() => expect(result.current.favoritePendingKeys.has(key)).toBe(true))
			expect(originalCreate).not.toHaveBeenCalled()
			expect(originalDelete).not.toHaveBeenCalled()

			rerender({ api: nextApi, profileId: change === 'profile' ? 'profile-2' : 'profile-1', bucket: change === 'profile' ? 'bucket-b' : 'bucket-a', apiToken: 'token-b' })
			onlineManager.setOnline(true)
			const originalMutation = operation === 'add' ? originalCreate : originalDelete
			await waitFor(() => expect(originalCreate.mock.calls.length + originalDelete.mock.calls.length + nextCreate.mock.calls.length + nextDelete.mock.calls.length).toBe(1))
			expect(nextCreate).not.toHaveBeenCalled()
			expect(nextDelete).not.toHaveBeenCalled()
			expect(originalMutation).toHaveBeenCalledWith({ profileId: 'profile-1', bucket: 'bucket-a', key })
			rerender(initialProps)
			await waitFor(() => expect(result.current.favoritePendingKeys.has(key)).toBe(false))
			expect(result.current.favoriteKeys.has(key)).toBe(operation === 'add')
		} finally {
			onlineManager.setOnline(true)
			queryClient.clear()
		}
	})

	it('keeps the latest same-tick mutation as the pending cache owner', async () => {
		const firstRequest = deferred<{ key: string; createdAt: string }>()
		const latestRequest = deferred<{ key: string; createdAt: string }>()
		const createObjectFavorite = vi
			.fn()
			.mockReturnValueOnce(firstRequest.promise)
			.mockReturnValueOnce(latestRequest.promise)
		const api = createMockApiClient({
			objects: {
				listObjectFavorites: vi.fn().mockResolvedValue({
					bucket: 'bucket-a',
					prefix: '',
					count: 0,
					keys: [],
					hydrated: true,
					items: [],
				}),
				createObjectFavorite,
				deleteObjectFavorite: vi.fn(),
			},
		})
		const { Wrapper } = createWrapper()
		const { result } = renderHook(
			() =>
				useObjectsFavorites({
					api,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					apiToken: 'token',
					objectsPages: [],
					hydrateItems: true,
				}),
			{ wrapper: Wrapper },
		)

		await waitFor(() => expect(result.current.favoritesQuery.isSuccess).toBe(true))
		act(() => {
			result.current.toggleFavorite('logs/new.txt')
			result.current.toggleFavorite('logs/new.txt')
		})
		await waitFor(() => expect(createObjectFavorite).toHaveBeenCalledTimes(2))
		await waitFor(() => expect(result.current.favoritePendingKeys.has('logs/new.txt')).toBe(true))

		await act(async () => {
			firstRequest.resolve({ key: 'logs/new.txt', createdAt: '2026-03-10T00:00:00Z' })
			await Promise.resolve()
		})
		expect(result.current.favoriteKeys.has('logs/new.txt')).toBe(false)
		expect(result.current.favoritePendingKeys.has('logs/new.txt')).toBe(true)

		await act(async () => {
			latestRequest.resolve({ key: 'logs/new.txt', createdAt: '2026-03-10T00:00:01Z' })
			await Promise.resolve()
		})
		await waitFor(() => expect(result.current.favoritePendingKeys.has('logs/new.txt')).toBe(false))
		expect(result.current.favoriteKeys.has('logs/new.txt')).toBe(true)
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

		rerender({ profileId: 'profile-1', bucket: 'bucket-a' })
		expect(result.current.favoritePendingKeys.has('logs/new.txt')).toBe(false)
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

		rerender({ profileId: 'profile-1', bucket: 'bucket-a' })
		expect(result.current.favoritePendingKeys.has('docs/readme.txt')).toBe(false)
	})
})
