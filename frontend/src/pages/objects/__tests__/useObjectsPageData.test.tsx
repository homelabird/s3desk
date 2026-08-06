import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useObjectsPageData } from '../useObjectsPageData'

type RouteLocation = ReturnType<typeof import('react-router').useLocation>
type NavigateFn = ReturnType<typeof import('react-router').useNavigate>
type UseObjectsPageEnvironmentArgs = Parameters<
	typeof import('../useObjectsPageEnvironment').useObjectsPageEnvironment
>[0]
type UseObjectsPageEnvironmentResult = ReturnType<
	typeof import('../useObjectsPageEnvironment').useObjectsPageEnvironment
>
type UseObjectsLocationStateArgs = Parameters<
	typeof import('../useObjectsLocationState').useObjectsLocationState
>[0]
type UseObjectsLocationStateResult = ReturnType<
	typeof import('../useObjectsLocationState').useObjectsLocationState
>
type UseObjectsTreeArgs = Parameters<
	typeof import('../useObjectsTree').useObjectsTree
>[0]
type UseObjectsTreeResult = ReturnType<typeof import('../useObjectsTree').useObjectsTree>
type UseObjectsPageViewStateArgs = Parameters<
	typeof import('../useObjectsPageViewState').useObjectsPageViewState
>[0]
type UseObjectsPageViewStateResult = ReturnType<
	typeof import('../useObjectsPageViewState').useObjectsPageViewState
>
type UseObjectsPageQueriesArgs = Parameters<
	typeof import('../useObjectsPageQueries').useObjectsPageQueries
>[0]
type UseObjectsPageQueriesResult = ReturnType<
	typeof import('../useObjectsPageQueries').useObjectsPageQueries
>
type UseObjectsPageLocationEffectsArgs = Parameters<
	typeof import('../useObjectsPageLocationEffects').useObjectsPageLocationEffects
>[0]
type UseObjectsSelectionResult = ReturnType<
	typeof import('../useObjectsSelection').useObjectsSelection
>
type UseObjectsPageSearchDataArgs = Parameters<
	typeof import('../useObjectsPageSearchData').useObjectsPageSearchData
>[0]
type UseObjectsPageSearchDataResult = ReturnType<
	typeof import('../useObjectsPageSearchData').useObjectsPageSearchData
>
type UseObjectsSelectionHandlersArgs = Parameters<
	typeof import('../useObjectsSelectionHandlers').useObjectsSelectionHandlers
>[0]
type UseObjectsSelectionHandlersResult = ReturnType<
	typeof import('../useObjectsSelectionHandlers').useObjectsSelectionHandlers
>
type UseObjectsSelectionBulkArgs = Parameters<
	typeof import('../useObjectsSelectionBulk').useObjectsSelectionBulk
>[0]
type UseObjectsSelectionBulkResult = ReturnType<
	typeof import('../useObjectsSelectionBulk').useObjectsSelectionBulk
>
type UseObjectsZipJobsArgs = Parameters<
	typeof import('../useObjectsZipJobs').useObjectsZipJobs
>[0]
type UseObjectsZipJobsResult = ReturnType<
	typeof import('../useObjectsZipJobs').useObjectsZipJobs
>
type UseObjectsIndexingArgs = Parameters<
	typeof import('../useObjectsIndexing').useObjectsIndexing
>[0]
type UseObjectsIndexingResult = ReturnType<
	typeof import('../useObjectsIndexing').useObjectsIndexing
>
type UseObjectsPrefetchArgs = Parameters<
	typeof import('../useObjectsPrefetch').useObjectsPrefetch
>[0]
type UseObjectsPrefetchResult = ReturnType<
	typeof import('../useObjectsPrefetch').useObjectsPrefetch
>
type BuildObjectsPageDataStateArgs = Parameters<
	typeof import('../buildObjectsPageDataState').buildObjectsPageDataState
>[0]
type BuildObjectsPageDataStateResult = ReturnType<
	typeof import('../buildObjectsPageDataState').buildObjectsPageDataState
>
type RefCell = {
	current: unknown | null
}

function readRef<T>(ref: RefCell): T {
	return ref.current as T
}

const {
	routeLocationRef,
	navigateRef,
	environmentRef,
	locationStateRef,
	treeStateRef,
	viewStateRef,
	queriesStateRef,
	locationEffectsArgsRef,
	selectionStateRef,
	searchStateRef,
	selectionHandlersRef,
	selectionBulkRef,
	zipJobsRef,
	indexingRef,
	prefetchRef,
	buildArgsRef,
	buildStateRef,
	environmentArgsRef,
	locationStateArgsRef,
	treeArgsRef,
	viewArgsRef,
	queriesArgsRef,
	searchArgsRef,
	selectionHandlersArgsRef,
	selectionBulkArgsRef,
	zipJobsArgsRef,
	indexingArgsRef,
	prefetchArgsRef,
} = vi.hoisted(
	(): Record<string, RefCell> => ({
		routeLocationRef: { current: null },
		navigateRef: { current: null },
		environmentRef: { current: null },
		locationStateRef: { current: null },
		treeStateRef: { current: null },
		viewStateRef: { current: null },
		queriesStateRef: { current: null },
		locationEffectsArgsRef: { current: null },
		selectionStateRef: { current: null },
		searchStateRef: { current: null },
		selectionHandlersRef: { current: null },
		selectionBulkRef: { current: null },
		zipJobsRef: { current: null },
		indexingRef: { current: null },
		prefetchRef: { current: null },
		buildArgsRef: { current: null },
		buildStateRef: { current: null },
		environmentArgsRef: { current: null },
		locationStateArgsRef: { current: null },
		treeArgsRef: { current: null },
		viewArgsRef: { current: null },
		queriesArgsRef: { current: null },
		searchArgsRef: { current: null },
		selectionHandlersArgsRef: { current: null },
		selectionBulkArgsRef: { current: null },
		zipJobsArgsRef: { current: null },
		indexingArgsRef: { current: null },
		prefetchArgsRef: { current: null },
	}),
)

vi.mock('react-router', () => ({
	useLocation: () => readRef<RouteLocation>(routeLocationRef),
	useNavigate: () => readRef<NavigateFn>(navigateRef),
}))

vi.mock('../useObjectsPageEnvironment', () => ({
	useObjectsPageEnvironment: (args: UseObjectsPageEnvironmentArgs) => {
		environmentArgsRef.current = args
		return readRef<UseObjectsPageEnvironmentResult>(environmentRef)
	},
}))

vi.mock('../useObjectsLocationState', () => ({
	useObjectsLocationState: (args: UseObjectsLocationStateArgs) => {
		locationStateArgsRef.current = args
		return readRef<UseObjectsLocationStateResult>(locationStateRef)
	},
}))

vi.mock('../useObjectsTree', () => ({
	useObjectsTree: (args: UseObjectsTreeArgs) => {
		treeArgsRef.current = args
		return readRef<UseObjectsTreeResult>(treeStateRef)
	},
}))

vi.mock('../useObjectsPageViewState', () => ({
	useObjectsPageViewState: (args: UseObjectsPageViewStateArgs) => {
		viewArgsRef.current = args
		return readRef<UseObjectsPageViewStateResult>(viewStateRef)
	},
}))

vi.mock('../useObjectsPageQueries', () => ({
	useObjectsPageQueries: (args: UseObjectsPageQueriesArgs) => {
		queriesArgsRef.current = args
		return readRef<UseObjectsPageQueriesResult>(queriesStateRef)
	},
}))

vi.mock('../useObjectsPageLocationEffects', () => ({
	useObjectsPageLocationEffects: (args: UseObjectsPageLocationEffectsArgs) => {
		locationEffectsArgsRef.current = args
	},
}))

vi.mock('../useObjectsSelection', () => ({
	useObjectsSelection: () => readRef<UseObjectsSelectionResult>(selectionStateRef),
}))

vi.mock('../useObjectsPageSearchData', () => ({
	useObjectsPageSearchData: (args: UseObjectsPageSearchDataArgs) => {
		searchArgsRef.current = args
		return readRef<UseObjectsPageSearchDataResult>(searchStateRef)
	},
}))

vi.mock('../useObjectsSelectionHandlers', () => ({
	useObjectsSelectionHandlers: (args: UseObjectsSelectionHandlersArgs) => {
		selectionHandlersArgsRef.current = args
		return readRef<UseObjectsSelectionHandlersResult>(selectionHandlersRef)
	},
}))

vi.mock('../useObjectsSelectionBulk', () => ({
	useObjectsSelectionBulk: (args: UseObjectsSelectionBulkArgs) => {
		selectionBulkArgsRef.current = args
		return readRef<UseObjectsSelectionBulkResult>(selectionBulkRef)
	},
}))

vi.mock('../useObjectsZipJobs', () => ({
	useObjectsZipJobs: (args: UseObjectsZipJobsArgs) => {
		zipJobsArgsRef.current = args
		return readRef<UseObjectsZipJobsResult>(zipJobsRef)
	},
}))

vi.mock('../useObjectsIndexing', () => ({
	useObjectsIndexing: (args: UseObjectsIndexingArgs) => {
		indexingArgsRef.current = args
		return readRef<UseObjectsIndexingResult>(indexingRef)
	},
}))

vi.mock('../useObjectsPrefetch', () => ({
	useObjectsPrefetch: (args: UseObjectsPrefetchArgs) => {
		prefetchArgsRef.current = args
		return readRef<UseObjectsPrefetchResult>(prefetchRef)
	},
}))

vi.mock('../buildObjectsPageDataState', () => ({
	buildObjectsPageDataState: (args: BuildObjectsPageDataStateArgs) => {
		buildArgsRef.current = args
		return readRef<BuildObjectsPageDataStateResult>(buildStateRef)
	},
}))

function seedObjectsPageDataState(overrides?: { bucket?: string }) {
	const navigate = vi.fn()
	const navigateToLocation = vi.fn()
	const clearInvalidLocation = vi.fn()
	const setTreeDrawerOpen = vi.fn()
	const setTreeSelectedKeys = vi.fn()
	const setSelectedKeys = vi.fn()
	const setLastSelectedObjectKey = vi.fn()
	const createJobWithRetry = vi.fn()

	routeLocationRef.current = {
		pathname: '/objects',
		search: '?view=list',
		hash: '#top',
		state: { openBucket: true, bucket: 'bucket-a', prefix: 'docs' },
		key: 'route-key-1',
	} satisfies RouteLocation
	navigateRef.current = navigate
	environmentRef.current = {
		api: { tag: 'api' },
		queryClient: { tag: 'query-client' },
		transfers: { tag: 'transfers' },
		screens: { md: true },
		isOffline: false,
		debugObjectsList: true,
		debugContextMenu: false,
		commandPaletteOpener: vi.fn(),
		createJobWithRetry,
	} as unknown as UseObjectsPageEnvironmentResult
	locationStateRef.current = {
		bucket: overrides?.bucket ?? 'bucket-a',
		prefix: 'docs/',
		navigateToLocation,
		clearInvalidLocation,
		openPathModal: vi.fn(),
		recentBuckets: ['bucket-a', 'bucket-b'],
		prefixByBucketRef: { current: { 'bucket-a': 'docs/' } },
	} as unknown as UseObjectsLocationStateResult
	treeStateRef.current = {
		setTreeDrawerOpen,
		setTreeSelectedKeys,
	} as unknown as UseObjectsTreeResult
	viewStateRef.current = {
		favoritesPaneExpanded: true,
		favoritesOnly: false,
		globalSearchOpen: true,
		deferredGlobalSearch: 'annual report',
		globalSearchPrefix: 'docs',
		globalSearchLimit: 25,
		globalSearchExt: 'pdf',
		globalSearchMinSize: 10,
		globalSearchMaxSize: 1_000,
		globalSearchMinModifiedMs: 100,
		globalSearchMaxModifiedMs: 200,
		deferredSearch: 'report',
		extFilter: 'pdf',
		minSize: 10,
		maxSize: 1_000,
		minModifiedMs: 100,
		maxModifiedMs: 200,
		typeFilter: 'all',
		sort: 'name_asc',
		favoritesFirst: true,
		objectsCostMode: 'adaptive',
		autoIndexEnabled: true,
		autoIndexTtlMs: 60_000,
		setIndexPrefix: vi.fn(),
	} as unknown as UseObjectsPageViewStateResult
	queriesStateRef.current = {
		bucketsQuery: {
			data: [{ name: ' bucket-a ' }, { name: '' }, { name: 'bucket-b' }],
			isSuccess: true,
		},
		objectsQuery: {
			data: { pages: [{ items: [] }] },
		},
		favoriteItems: [{ key: 'docs/report.pdf' }],
		favoriteKeys: new Set(['docs/report.pdf']),
		selectedProfile: { provider: 's3_compatible' },
		bucketOptions: [{ label: 'bucket-a', value: 'bucket-a' }],
	} as unknown as UseObjectsPageQueriesResult
	selectionStateRef.current = {
		selectedKeys: new Set(['docs/report.pdf']),
		lastSelectedObjectKey: 'docs/report.pdf',
		setSelectedKeys,
		setLastSelectedObjectKey,
		clearSelection: vi.fn(),
		selectedCount: 1,
	} as unknown as UseObjectsSelectionResult
	searchStateRef.current = {
		orderedVisibleObjectKeys: ['docs/report.pdf', 'docs/summary.pdf'],
		visibleObjectKeys: new Set(['docs/report.pdf', 'docs/summary.pdf']),
		globalSearchQueryText: 'annual report',
		globalSearchPrefixNormalized: 'docs/',
	} as unknown as UseObjectsPageSearchDataResult
	selectionHandlersRef.current = {
		ensureObjectSelectedForContextMenu: vi.fn(),
		selectObjectFromCheckboxEvent: vi.fn(),
		selectObjectFromPointerEvent: vi.fn(),
	} as unknown as UseObjectsSelectionHandlersResult
	selectionBulkRef.current = {
		handleToggleSelectAll: vi.fn(),
		selectAllLoaded: vi.fn(),
		selectRange: vi.fn(),
	} as unknown as UseObjectsSelectionBulkResult
	zipJobsRef.current = {
		zipObjectsJobMutation: { tag: 'zip-objects' },
		zipPrefixJobMutation: { tag: 'zip-prefix' },
	} as unknown as UseObjectsZipJobsResult
	indexingRef.current = {
		indexObjectsJobMutation: { tag: 'index-objects' },
	} as unknown as UseObjectsIndexingResult
	prefetchRef.current = {
		handleBucketDropdownVisibleChange: vi.fn(),
	} as unknown as UseObjectsPrefetchResult
	buildStateRef.current = {
		tag: 'built-state',
	} as unknown as BuildObjectsPageDataStateResult

	return {
		navigate,
		navigateToLocation,
		clearInvalidLocation,
		setTreeDrawerOpen,
		setTreeSelectedKeys,
		setSelectedKeys,
		setLastSelectedObjectKey,
		createJobWithRetry,
	}
}

describe('useObjectsPageData', () => {
	beforeEach(() => {
		for (const ref of [
			routeLocationRef,
			navigateRef,
			environmentRef,
			locationStateRef,
			treeStateRef,
			viewStateRef,
			queriesStateRef,
			locationEffectsArgsRef,
			selectionStateRef,
			searchStateRef,
			selectionHandlersRef,
			selectionBulkRef,
			zipJobsRef,
			indexingRef,
			prefetchRef,
			buildArgsRef,
			buildStateRef,
			environmentArgsRef,
			locationStateArgsRef,
			treeArgsRef,
			viewArgsRef,
			queriesArgsRef,
			searchArgsRef,
			selectionHandlersArgsRef,
			selectionBulkArgsRef,
			zipJobsArgsRef,
			indexingArgsRef,
			prefetchArgsRef,
		]) {
			ref.current = null
		}
	})

	it('composes derived hook arguments and forwards them to the state builder', () => {
		const {
			navigate,
			navigateToLocation,
			clearInvalidLocation,
			setTreeDrawerOpen,
			setTreeSelectedKeys,
			createJobWithRetry,
		} = seedObjectsPageDataState()

		const { result } = renderHook(() =>
			useObjectsPageData({
				apiToken: 'token-a',
				profileId: 'profile-1',
			}),
		)

		expect(result.current).toBe(buildStateRef.current)
		expect(readRef<UseObjectsPageEnvironmentArgs>(environmentArgsRef)).toEqual({
			apiToken: 'token-a',
			profileId: 'profile-1',
		})
		expect(readRef<UseObjectsLocationStateArgs>(locationStateArgsRef)).toEqual({
			apiToken: 'token-a',
			profileId: 'profile-1',
		})
		expect(readRef<UseObjectsTreeArgs>(treeArgsRef)).toMatchObject({
			apiToken: 'token-a',
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'docs/',
			debugEnabled: true,
		})
		expect(readRef<UseObjectsPageViewStateArgs>(viewArgsRef)).toMatchObject({
			apiToken: 'token-a',
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'docs/',
			isOffline: false,
			openPathModal: readRef<UseObjectsLocationStateResult>(locationStateRef).openPathModal,
			setTreeDrawerOpen,
		})
		expect(readRef<UseObjectsPageQueriesArgs>(queriesArgsRef)).toMatchObject({
			apiToken: 'token-a',
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'docs/',
			debugObjectsList: true,
			favoritesPaneExpanded: true,
			favoritesOnly: false,
		})
		expect(readRef<UseObjectsPageSearchDataArgs>(searchArgsRef)).toMatchObject({
			apiToken: 'token-a',
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'docs/',
			globalSearchOpen: true,
			favoriteItems: [{ key: 'docs/report.pdf' }],
			favoriteKeys: new Set(['docs/report.pdf']),
			selectedKeys: new Set(['docs/report.pdf']),
		})
		expect(readRef<UseObjectsSelectionHandlersArgs>(selectionHandlersArgsRef)).toEqual({
			orderedVisibleObjectKeys: ['docs/report.pdf', 'docs/summary.pdf'],
			lastSelectedObjectKey: 'docs/report.pdf',
			setSelectedKeys: readRef<UseObjectsSelectionResult>(selectionStateRef).setSelectedKeys,
			setLastSelectedObjectKey:
				readRef<UseObjectsSelectionResult>(selectionStateRef).setLastSelectedObjectKey,
		})
		expect(readRef<UseObjectsSelectionBulkArgs>(selectionBulkArgsRef)).toEqual({
			visibleObjectKeys: new Set(['docs/report.pdf', 'docs/summary.pdf']),
			orderedVisibleObjectKeys: ['docs/report.pdf', 'docs/summary.pdf'],
			setSelectedKeys: readRef<UseObjectsSelectionResult>(selectionStateRef).setSelectedKeys,
			setLastSelectedObjectKey:
				readRef<UseObjectsSelectionResult>(selectionStateRef).setLastSelectedObjectKey,
		})
		expect(readRef<UseObjectsZipJobsArgs>(zipJobsArgsRef)).toMatchObject({
			profileId: 'profile-1',
			apiToken: 'token-a',
			bucket: 'bucket-a',
			prefix: 'docs/',
			createJobWithRetry,
		})
		expect(readRef<UseObjectsIndexingArgs>(indexingArgsRef)).toMatchObject({
			profileId: 'profile-1',
			apiToken: 'token-a',
			bucket: 'bucket-a',
			prefix: 'docs/',
			globalSearchOpen: true,
			globalSearchQueryText: 'annual report',
			globalSearchPrefixNormalized: 'docs/',
			createJobWithRetry,
		})
		expect(readRef<UseObjectsPrefetchArgs>(prefetchArgsRef)).toMatchObject({
			apiToken: 'token-a',
			profileId: 'profile-1',
			profileProvider: 's3_compatible',
			queryClient: { tag: 'query-client' },
			bucket: 'bucket-a',
			recentBuckets: ['bucket-a', 'bucket-b'],
			bucketOptions: [{ label: 'bucket-a', value: 'bucket-a' }],
			prefixByBucketRef: { current: { 'bucket-a': 'docs/' } },
		})

		const locationEffectsArgs =
			readRef<UseObjectsPageLocationEffectsArgs>(locationEffectsArgsRef)
		expect(locationEffectsArgs.routeLocation).toEqual(readRef<RouteLocation>(routeLocationRef))
		expect(locationEffectsArgs.navigate).toBe(navigate)
		expect(locationEffectsArgs.navigateToLocation).toBe(navigateToLocation)
		expect(locationEffectsArgs.clearInvalidLocation).toBe(clearInvalidLocation)
		expect(locationEffectsArgs.profileId).toBe('profile-1')
		expect(locationEffectsArgs.currentBucket).toBe('bucket-a')
		expect(locationEffectsArgs.bucketsLoaded).toBe(true)
		expect([...locationEffectsArgs.availableBucketNames]).toEqual([
			'bucket-a',
			'bucket-b',
		])

		const buildArgs = readRef<BuildObjectsPageDataStateArgs>(buildArgsRef)
		expect(buildArgs.environment).toBe(environmentRef.current)
		expect(buildArgs.location).toBe(locationStateRef.current)
		expect(buildArgs.tree).toBe(treeStateRef.current)
		expect(buildArgs.view).toBe(viewStateRef.current)
		expect(buildArgs.queries).toBe(queriesStateRef.current)
		expect(buildArgs.search).toBe(searchStateRef.current)
		expect(buildArgs.jobs).toMatchObject({
			zipObjectsJobMutation: { tag: 'zip-objects' },
			zipPrefixJobMutation: { tag: 'zip-prefix' },
			indexObjectsJobMutation: { tag: 'index-objects' },
		})
		expect(buildArgs.prefetch).toBe(prefetchRef.current)

		act(() => {
			buildArgs.handleTreeSelect('/', true)
		})

		expect(setTreeSelectedKeys).toHaveBeenCalledWith(['/'])
		expect(navigateToLocation).toHaveBeenCalledWith('bucket-a', '', {
			recordHistory: true,
		})
		expect(setTreeDrawerOpen).toHaveBeenCalledWith(false)
	})

	it('does not navigate or close the drawer when there is no active bucket', () => {
		const { navigateToLocation, setTreeDrawerOpen, setTreeSelectedKeys } =
			seedObjectsPageDataState({ bucket: '' })

		renderHook(() =>
			useObjectsPageData({
				apiToken: 'token-a',
				profileId: 'profile-1',
			}),
		)

		const buildArgs = readRef<BuildObjectsPageDataStateArgs>(buildArgsRef)
		act(() => {
			buildArgs.handleTreeSelect('nested/path/', true)
		})

		expect(setTreeSelectedKeys).toHaveBeenCalledWith(['nested/path/'])
		expect(navigateToLocation).not.toHaveBeenCalled()
		expect(setTreeDrawerOpen).not.toHaveBeenCalled()
	})
})
