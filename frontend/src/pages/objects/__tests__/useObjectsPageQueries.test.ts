import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { ListObjectsResponse, MetaResponse, Profile } from '../../../api/types'
import { createMockApiClient } from '../../../test/mockApiClient'
import { useObjectsAutoScan } from '../useObjectsAutoScan'
import { getNextObjectsContinuationToken, useObjectsPageQueries } from '../useObjectsPageQueries'

type MetaOverrides = Omit<Partial<MetaResponse>, 'capabilities'> & {
	capabilities?: Partial<MetaResponse['capabilities']>
}

function buildPage(overrides: Partial<ListObjectsResponse> = {}): ListObjectsResponse {
	return {
		bucket: 'bucket-a',
		prefix: 'photos/',
		items: [{ key: 'photos/a.jpg', size: 128, lastModified: '2026-03-06T00:00:00Z' }],
		commonPrefixes: [],
		isTruncated: false,
		nextContinuationToken: undefined,
		...overrides,
	} as ListObjectsResponse
}

function buildMeta(overrides: MetaOverrides = {}): MetaResponse {
	const base: MetaResponse = {
		version: 'test',
		serverAddr: '127.0.0.1:8080',
		dataDir: '/data',
		dbBackend: 'sqlite',
		staticDir: '/app/ui',
		apiTokenEnabled: true,
		encryptionEnabled: false,
		capabilities: {
			profileTls: { enabled: false, reason: 'disabled' },
			serverBackup: {
				export: { enabled: true, reason: '' },
				restoreStaging: { enabled: true, reason: '' },
			},
			providers: {},
		},
		allowedLocalDirs: [],
		jobConcurrency: 1,
		uploadSessionTTLSeconds: 3600,
		uploadDirectStream: false,
		transferEngine: {
			name: 'rclone',
			available: true,
			compatible: true,
			minVersion: '1.52.0',
			path: '/usr/bin/rclone',
			version: 'v1.66.0',
		},
	}
	return {
		...base,
		...overrides,
		capabilities: {
			...base.capabilities,
			...overrides.capabilities,
		},
	}
}

function buildProfile(overrides: Partial<Profile> = {}): Profile {
	return {
		id: 'profile-1',
		name: 'Primary Profile',
		provider: 's3_compatible',
		endpoint: 'http://127.0.0.1:9000',
		region: 'us-east-1',
		forcePathStyle: false,
		preserveLeadingSlash: false,
		tlsInsecureSkipVerify: false,
		createdAt: '2026-04-08T00:00:00Z',
		updatedAt: '2026-04-08T00:00:00Z',
		...overrides,
	} as Profile
}

function createWrapper(queryClient: QueryClient) {
	return function Wrapper(props: PropsWithChildren) {
		return createElement(QueryClientProvider, { client: queryClient }, props.children)
	}
}

describe('getNextObjectsContinuationToken', () => {
	it('returns the next token for a valid truncated page', () => {
		const nextToken = getNextObjectsContinuationToken({
			lastPage: buildPage({ isTruncated: true, nextContinuationToken: 'page-2' }),
			lastPageParam: 'page-1',
			allPageParams: [undefined, 'page-1'],
			bucket: 'bucket-a',
			prefix: 'photos/',
		})

		expect(nextToken).toBe('page-2')
	})

	it('stops pagination when a truncated page is missing a continuation token', () => {
		const onWarn = vi.fn()

		const nextToken = getNextObjectsContinuationToken({
			lastPage: buildPage({ isTruncated: true, nextContinuationToken: undefined }),
			lastPageParam: 'page-1',
			allPageParams: [undefined, 'page-1'],
			bucket: 'bucket-a',
			prefix: 'photos/',
			onWarn,
		})

		expect(nextToken).toBeUndefined()
		expect(onWarn).toHaveBeenCalledWith('List objects missing continuation token; stopping pagination', {
			bucket: 'bucket-a',
			prefix: 'photos/',
		})
	})

	it('stops pagination when a truncated page returns no objects or prefixes', () => {
		const onWarn = vi.fn()

		const nextToken = getNextObjectsContinuationToken({
			lastPage: buildPage({
				isTruncated: true,
				items: [],
				commonPrefixes: [],
				nextContinuationToken: 'page-2',
			}),
			lastPageParam: 'page-1',
			allPageParams: [undefined, 'page-1'],
			bucket: 'bucket-a',
			prefix: 'photos/',
			onWarn,
		})

		expect(nextToken).toBeUndefined()
		expect(onWarn).toHaveBeenCalledWith('List objects returned empty page; stopping pagination', {
			bucket: 'bucket-a',
			prefix: 'photos/',
			nextToken: 'page-2',
		})
	})

	it('stops pagination when the next token repeats the current page token', () => {
		const onWarn = vi.fn()

		const nextToken = getNextObjectsContinuationToken({
			lastPage: buildPage({ isTruncated: true, nextContinuationToken: 'page-1' }),
			lastPageParam: 'page-1',
			allPageParams: [undefined, 'page-1'],
			bucket: 'bucket-a',
			prefix: 'photos/',
			onWarn,
		})

		expect(nextToken).toBeUndefined()
		expect(onWarn).toHaveBeenCalledWith('List objects repeated continuation token; stopping pagination', {
			bucket: 'bucket-a',
			prefix: 'photos/',
			nextToken: 'page-1',
		})
	})

	it('stops pagination when the next token was already seen earlier', () => {
		const onWarn = vi.fn()

		const nextToken = getNextObjectsContinuationToken({
			lastPage: buildPage({ isTruncated: true, nextContinuationToken: 'page-1' }),
			lastPageParam: 'page-3',
			allPageParams: [undefined, 'page-1', 'page-2', 'page-3'],
			bucket: 'bucket-a',
			prefix: 'photos/',
			onWarn,
		})

		expect(nextToken).toBeUndefined()
		expect(onWarn).toHaveBeenCalledWith('List objects hit previously seen continuation token; stopping pagination', {
			bucket: 'bucket-a',
			prefix: 'photos/',
			nextToken: 'page-1',
		})
	})
})

describe('useObjectsPageQueries', () => {
	it('aborts the stale object list request when the prefix changes', async () => {
		const signals: AbortSignal[] = []
		const listBuckets = vi.fn().mockResolvedValue([{ name: 'bucket-a', createdAt: '2026-04-08T00:00:00Z' }])
		const listObjects = vi.fn(({ signal }: { signal?: AbortSignal }) => {
			if (signal) signals.push(signal)
			return new Promise<ListObjectsResponse>(() => {})
		})
		const api = createMockApiClient({
			server: { getMeta: async () => buildMeta() },
			profiles: { listProfiles: async () => [buildProfile()] },
			buckets: { listBuckets },
			objects: {
				listObjects,
				listObjectFavorites: async () => ({
					bucket: 'bucket-a',
					prefix: '',
					count: 0,
					keys: [],
					hydrated: false,
					items: [],
				}),
				createObjectFavorite: vi.fn(),
				deleteObjectFavorite: vi.fn(),
			},
		})
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		})
		const { rerender, unmount } = renderHook(
			({ prefix }: { prefix: string }) =>
				useObjectsPageQueries({
					api,
					apiToken: 'token-a',
					profileId: 'profile-1',
					bucket: 'bucket-a',
					prefix,
					debugObjectsList: false,
					favoritesPaneExpanded: false,
					favoritesOnly: false,
				}),
			{
				initialProps: { prefix: 'photos/' },
				wrapper: createWrapper(queryClient),
			},
		)

		await waitFor(() => expect(listObjects).toHaveBeenCalledTimes(1))
		expect(listBuckets).toHaveBeenCalledWith('profile-1', expect.any(AbortSignal))
		rerender({ prefix: 'reports/' })

		await waitFor(() => expect(listObjects).toHaveBeenCalledTimes(2))
		expect(signals[0]?.aborted).toBe(true)
		expect(signals[1]?.aborted).toBe(false)

		unmount()
		expect(signals[1]?.aborted).toBe(true)
	})

	it.each([
		{ isAdvanced: false, cap: 1_000, pageSizes: [200, 800] },
		{ isAdvanced: true, cap: 3_000, pageSizes: [200, 800, 1_000, 1_000] },
	])('stops automatic search scanning exactly at the $cap item cap', async ({ isAdvanced, cap, pageSizes }) => {
		let offset = 0
		const listObjects = vi.fn(async ({ maxKeys }: { maxKeys?: number; continuationToken?: string }) => {
			const size = maxKeys ?? 0
			const start = offset
			offset += size
			return buildPage({
				items: Array.from({ length: size }, (_, index) => ({
					key: `photos/item-${start + index}.jpg`,
					size: 128,
					lastModified: '2026-03-06T00:00:00Z',
				})),
				isTruncated: true,
				nextContinuationToken: `page-${offset}`,
			})
		})
		const api = createMockApiClient({
			server: { getMeta: async () => buildMeta() },
			profiles: { listProfiles: async () => [buildProfile()] },
			buckets: { listBuckets: async () => [{ name: 'bucket-a', createdAt: '2026-04-08T00:00:00Z' }] },
			objects: {
				listObjects,
				listObjectFavorites: async () => ({
					bucket: 'bucket-a',
					prefix: '',
					count: 0,
					keys: [],
					hydrated: false,
					items: [],
				}),
				createObjectFavorite: vi.fn(),
				deleteObjectFavorite: vi.fn(),
			},
		})
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		})

		const { result } = renderHook(
			() => {
				const queries = useObjectsPageQueries({
					api,
					apiToken: 'token-a',
					profileId: 'profile-1',
					bucket: 'bucket-a',
					prefix: 'photos/',
					debugObjectsList: false,
					favoritesPaneExpanded: false,
					favoritesOnly: false,
				})
				const rawTotalCount = (queries.objectsQuery.data?.pages ?? []).reduce(
					(total, page) => total + page.items.length + (page.commonPrefixes?.length ?? 0),
					0,
				)
				const autoScan = useObjectsAutoScan({
					favoritesOnly: false,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					prefix: 'photos/',
					search: 'item',
					isAdvanced,
					extFilter: '',
					minSize: null,
					maxSize: null,
					minModifiedMs: null,
					maxModifiedMs: null,
					typeFilter: 'all',
					rawTotalCount,
					rowsLength: rawTotalCount,
					virtualItems: [],
					autoScanReady: true,
					hasNextPage: queries.objectsQuery.hasNextPage,
					isFetchingNextPage: queries.objectsQuery.isFetchingNextPage,
					fetchNextPage: queries.objectsQuery.fetchNextPage,
					debugEnabled: false,
					log: vi.fn(),
				})
				return { queries, autoScan, rawTotalCount }
			},
			{ wrapper: createWrapper(queryClient) },
		)

		await waitFor(() => {
			expect(result.current.rawTotalCount).toBe(cap)
			expect(result.current.queries.objectsQuery.isFetchingNextPage).toBe(false)
			expect(result.current.autoScan.showLoadMore).toBe(true)
		})
		await act(async () => {
			await Promise.resolve()
		})

		expect(listObjects).toHaveBeenCalledTimes(pageSizes.length)
		expect(listObjects.mock.calls.map(([request]) => request.maxKeys)).toEqual(pageSizes)
		expect(listObjects.mock.calls.map(([request]) => request.continuationToken)).toEqual([
			undefined,
			...pageSizes.slice(1).map((_, index) => `page-${pageSizes.slice(0, index + 1).reduce((sum, size) => sum + size, 0)}`),
		])
		expect(result.current.autoScan.searchAutoScanCap).toBe(cap)
	})

	it('does not list buckets, objects, or favorites when provider capability disables object and bucket CRUD', async () => {
		const listBuckets = vi.fn().mockResolvedValue([{ name: 'bucket-a', createdAt: '2026-04-08T00:00:00Z' }])
		const listObjects = vi.fn().mockResolvedValue(buildPage())
		const listObjectFavorites = vi.fn().mockResolvedValue({
			bucket: 'bucket-a',
			prefix: '',
			count: 0,
			keys: [],
			hydrated: false,
			items: [],
		})
		const api = createMockApiClient({
			server: {
				getMeta: async () =>
					buildMeta({
						capabilities: {
							profileTls: { enabled: false, reason: 'disabled' },
							providers: {
								s3_compatible: {
									bucketCrud: false,
									objectCrud: false,
									jobTransfer: false,
									bucketPolicy: false,
									gcsIamPolicy: false,
									azureContainerAccessPolicy: false,
									presignedUpload: false,
									presignedMultipartUpload: false,
									directUpload: false,
									reasons: {
										bucketCrud: 'Bucket APIs are disabled.',
										objectCrud: 'Object APIs are disabled.',
									},
								},
							},
						},
					}),
			},
			profiles: {
				listProfiles: async () => [buildProfile()],
			},
			buckets: {
				listBuckets,
			},
			objects: {
				listObjects,
				listObjectFavorites,
				createObjectFavorite: vi.fn(),
				deleteObjectFavorite: vi.fn(),
			},
		})
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		})

		const { result } = renderHook(
			() =>
				useObjectsPageQueries({
					api,
					apiToken: 'token-a',
					profileId: 'profile-1',
					bucket: 'bucket-a',
					prefix: '',
					debugObjectsList: false,
					favoritesPaneExpanded: true,
					favoritesOnly: false,
				}),
			{
				wrapper: createWrapper(queryClient),
			},
		)

		await waitFor(() => expect(result.current.selectedProfile?.id).toBe('profile-1'))

		expect(result.current.objectCrudSupported).toBe(false)
		expect(result.current.bucketsQuery.fetchStatus).toBe('idle')
		expect(result.current.objectsQuery.fetchStatus).toBe('idle')
		expect(result.current.favoritesQuery.fetchStatus).toBe('idle')
		expect(listBuckets).not.toHaveBeenCalled()
		expect(listObjects).not.toHaveBeenCalled()
		expect(listObjectFavorites).not.toHaveBeenCalled()
	})
})
