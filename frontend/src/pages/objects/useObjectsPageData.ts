import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { buildObjectsPageDataState } from './buildObjectsPageDataState'
import { useObjectsIndexing } from './useObjectsIndexing'
import { useObjectsLocationState } from './useObjectsLocationState'
import { useObjectsPageEnvironment } from './useObjectsPageEnvironment'
import { useObjectsPageQueries } from './useObjectsPageQueries'
import { useObjectsPageSearchData } from './useObjectsPageSearchData'
import { useObjectsPageViewState } from './useObjectsPageViewState'
import { useObjectsPrefetch } from './useObjectsPrefetch'
import { useObjectsSelection } from './useObjectsSelection'
import { useObjectsSelectionBulk } from './useObjectsSelectionBulk'
import { useObjectsSelectionHandlers } from './useObjectsSelectionHandlers'
import { useObjectsTree } from './useObjectsTree'
import { useObjectsZipJobs } from './useObjectsZipJobs'
import { AUTO_INDEX_COOLDOWN_MS, OBJECTS_LIST_PAGE_SIZE } from './objectsPageConstants'
import { logObjectsDebug } from './objectsPageDebug'

type Props = {
	apiToken: string
	profileId: string | null
}

export function useObjectsPageData(props: Props) {
	const routeLocation = useLocation()
	const navigate = useNavigate()
	const environment = useObjectsPageEnvironment(props)
	const locationState = useObjectsLocationState({ profileId: props.profileId })
	const currentBucket = locationState.bucket
	const navigateToLocation = locationState.navigateToLocation
	const clearInvalidLocation = locationState.clearInvalidLocation

	const treeState = useObjectsTree({
		api: environment.api,
		profileId: props.profileId,
		bucket: locationState.bucket,
		prefix: locationState.prefix,
		debugEnabled: environment.debugObjectsList,
		log: logObjectsDebug,
	})

	const viewState = useObjectsPageViewState({
		bucket: locationState.bucket,
		prefix: locationState.prefix,
		isOffline: environment.isOffline,
		screens: environment.screens,
		openPathModal: locationState.openPathModal,
		setTreeDrawerOpen: treeState.setTreeDrawerOpen,
	})

	const queriesState = useObjectsPageQueries({
		api: environment.api,
		apiToken: props.apiToken,
		profileId: props.profileId,
		bucket: locationState.bucket,
		prefix: locationState.prefix,
		debugObjectsList: environment.debugObjectsList,
		favoritesPaneExpanded: viewState.favoritesPaneExpanded,
		favoritesOnly: viewState.favoritesOnly,
	})

	const availableBucketNames = useMemo(
		() => new Set((queriesState.bucketsQuery.data ?? []).map((entry) => entry.name.trim()).filter(Boolean)),
		[queriesState.bucketsQuery.data],
	)

	useEffect(() => {
		if (!routeLocation.state || typeof routeLocation.state !== 'object') return
		const state = routeLocation.state as { openBucket?: unknown; bucket?: unknown; prefix?: unknown }
		if (state.openBucket !== true) return
		const nextBucket = typeof state.bucket === 'string' ? state.bucket.trim() : ''
		if (!nextBucket) return
		const nextPrefix = typeof state.prefix === 'string' ? state.prefix : ''
		locationState.navigateToLocation(nextBucket, nextPrefix, { recordHistory: true })
		navigate(`${routeLocation.pathname}${routeLocation.search}${routeLocation.hash}`, {
			replace: true,
			state: null,
		})
	}, [navigate, navigateToLocation, routeLocation])

	useEffect(() => {
		if (!props.profileId || !queriesState.bucketsQuery.isSuccess) return
		const activeBucket = currentBucket.trim()
		if (!activeBucket) return
		if (availableBucketNames.has(activeBucket)) return
		clearInvalidLocation(activeBucket)
	}, [availableBucketNames, clearInvalidLocation, currentBucket, props.profileId, queriesState.bucketsQuery.isSuccess])

	const selectionState = useObjectsSelection()

	const searchState = useObjectsPageSearchData({
		api: environment.api,
		apiToken: props.apiToken,
		profileId: props.profileId,
		bucket: locationState.bucket,
		prefix: locationState.prefix,
		globalSearchOpen: viewState.globalSearchOpen,
		deferredGlobalSearch: viewState.deferredGlobalSearch,
		globalSearchPrefix: viewState.globalSearchPrefix,
		globalSearchLimit: viewState.globalSearchLimit,
		globalSearchExt: viewState.globalSearchExt,
		globalSearchMinSize: viewState.globalSearchMinSize,
		globalSearchMaxSize: viewState.globalSearchMaxSize,
		globalSearchMinModifiedMs: viewState.globalSearchMinModifiedMs,
		globalSearchMaxModifiedMs: viewState.globalSearchMaxModifiedMs,
		deferredSearch: viewState.deferredSearch,
		objectsPages: queriesState.objectsQuery.data?.pages ?? [],
		favoriteItems: queriesState.favoriteItems,
		favoritesOnly: viewState.favoritesOnly,
		favoriteKeys: queriesState.favoriteKeys,
		extFilter: viewState.extFilter,
		minSize: viewState.minSize,
		maxSize: viewState.maxSize,
		minModifiedMs: viewState.minModifiedMs,
		maxModifiedMs: viewState.maxModifiedMs,
		typeFilter: viewState.typeFilter,
		sort: viewState.sort,
		favoritesFirst: viewState.favoritesFirst,
		selectedKeys: selectionState.selectedKeys,
	})

	const selectionHandlers = useObjectsSelectionHandlers({
		orderedVisibleObjectKeys: searchState.orderedVisibleObjectKeys,
		lastSelectedObjectKey: selectionState.lastSelectedObjectKey,
		setSelectedKeys: selectionState.setSelectedKeys,
		setLastSelectedObjectKey: selectionState.setLastSelectedObjectKey,
	})

	const selectionBulk = useObjectsSelectionBulk({
		visibleObjectKeys: searchState.visibleObjectKeys,
		orderedVisibleObjectKeys: searchState.orderedVisibleObjectKeys,
		setSelectedKeys: selectionState.setSelectedKeys,
		setLastSelectedObjectKey: selectionState.setLastSelectedObjectKey,
	})

	const zipJobs = useObjectsZipJobs({
		profileId: props.profileId,
		bucket: locationState.bucket,
		prefix: locationState.prefix,
		transfers: environment.transfers,
		createJobWithRetry: environment.createJobWithRetry,
	})

	const indexingJobs = useObjectsIndexing({
		api: environment.api,
		profileId: props.profileId,
		bucket: locationState.bucket,
		prefix: locationState.prefix,
		globalSearchOpen: viewState.globalSearchOpen,
		globalSearchQueryText: searchState.globalSearchQueryText,
		globalSearchPrefixNormalized: searchState.globalSearchPrefixNormalized,
		objectsCostMode: viewState.objectsCostMode,
		autoIndexEnabled: viewState.autoIndexEnabled,
		autoIndexTtlMs: viewState.autoIndexTtlMs,
		autoIndexCooldownMs: AUTO_INDEX_COOLDOWN_MS,
		setIndexPrefix: viewState.setIndexPrefix,
		createJobWithRetry: environment.createJobWithRetry,
	})

	const prefetchState = useObjectsPrefetch({
		api: environment.api,
		apiToken: props.apiToken,
		profileId: props.profileId,
		profileProvider: queriesState.selectedProfile?.provider ?? null,
		objectsCostMode: viewState.objectsCostMode,
		queryClient: environment.queryClient,
		bucket: locationState.bucket,
		recentBuckets: locationState.recentBuckets,
		bucketOptions: queriesState.bucketOptions,
		prefixByBucketRef: locationState.prefixByBucketRef,
		pageSize: OBJECTS_LIST_PAGE_SIZE,
	})

	const handleTreeSelect = (key: string, closeDrawer: boolean) => {
		treeState.setTreeSelectedKeys([key])
		if (!locationState.bucket) return
		locationState.navigateToLocation(locationState.bucket, key === '/' ? '' : key, { recordHistory: true })
		if (closeDrawer) treeState.setTreeDrawerOpen(false)
	}

	return buildObjectsPageDataState({
		environment,
		location: locationState,
		tree: treeState,
		view: viewState,
		queries: queriesState,
		search: searchState,
		jobs: { ...zipJobs, ...indexingJobs },
		selection: {
			clearSelection: selectionState.clearSelection,
			ensureObjectSelectedForContextMenu: selectionHandlers.ensureObjectSelectedForContextMenu,
			handleToggleSelectAll: selectionBulk.handleToggleSelectAll,
			lastSelectedObjectKey: selectionState.lastSelectedObjectKey,
			selectAllLoaded: selectionBulk.selectAllLoaded,
			selectObjectFromCheckboxEvent: selectionHandlers.selectObjectFromCheckboxEvent,
			selectObjectFromPointerEvent: selectionHandlers.selectObjectFromPointerEvent,
			selectRange: selectionBulk.selectRange,
			selectedCount: selectionState.selectedCount,
			selectedKeys: selectionState.selectedKeys,
			setLastSelectedObjectKey: selectionState.setLastSelectedObjectKey,
			setSelectedKeys: selectionState.setSelectedKeys,
		},
		prefetch: prefetchState,
		handleTreeSelect,
	})
}
