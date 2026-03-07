import { useQueryClient } from '@tanstack/react-query'
import { Grid } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { APIClient } from '../../api/client'
import type { JobCreateRequest } from '../../api/types'
import { useTransfers } from '../../components/useTransfers'
import { withJobQueueRetry } from '../../lib/jobQueue'
import {
	OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS,
	OBJECTS_AUTO_INDEX_TTL_MAX_HOURS,
	OBJECTS_AUTO_INDEX_TTL_MIN_HOURS,
} from '../../lib/objectIndexing'
import {
	createThumbnailCache,
	THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES,
	THUMBNAIL_CACHE_MAX_ENTRIES,
	THUMBNAIL_CACHE_MIN_ENTRIES,
} from '../../lib/thumbnailCache'
import { useIsOffline } from '../../lib/useIsOffline'
import { useLocalStorageState } from '../../lib/useLocalStorageState'
import { useObjectsDeferredOpener } from './useObjectsDeferredOpener'
import { useObjectsFiltersState } from './useObjectsFiltersState'
import { useObjectsGlobalSearchOverlayState } from './useObjectsGlobalSearchOverlayState'
import { useObjectsGlobalSearchState } from './useObjectsGlobalSearchState'
import { useObjectsIndexedSearchQuery } from './useObjectsIndexedSearchQuery'
import { useObjectsIndexing } from './useObjectsIndexing'
import { useObjectsLayout } from './useObjectsLayout'
import { useObjectsListDerivedState } from './useObjectsListDerivedState'
import { useObjectsLocationState } from './useObjectsLocationState'
import { useObjectsPageQueries } from './useObjectsPageQueries'
import { useObjectsPrefetch } from './useObjectsPrefetch'
import { useObjectsSearchState } from './useObjectsSearchState'
import { useObjectsSelection } from './useObjectsSelection'
import { useObjectsSelectionBulk } from './useObjectsSelectionBulk'
import { useObjectsSelectionHandlers } from './useObjectsSelectionHandlers'
import { useObjectsTree } from './useObjectsTree'
import { useObjectsZipJobs } from './useObjectsZipJobs'
import {
	AUTO_INDEX_COOLDOWN_MS,
	OBJECTS_LIST_PAGE_SIZE,
	type ObjectsUIMode,
} from './objectsPageConstants'
import { isContextMenuDebugEnabled, isObjectsListDebugEnabled, logObjectsDebug } from './objectsPageDebug'

type Props = {
	apiToken: string
	profileId: string | null
}

export function useObjectsPageData(props: Props) {
	const queryClient = useQueryClient()
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
	const transfers = useTransfers()
	const screens = Grid.useBreakpoint()
	const isOffline = useIsOffline()
	const debugObjectsList = isObjectsListDebugEnabled()
	const debugContextMenu = isContextMenuDebugEnabled()
	const commandPaletteOpener = useObjectsDeferredOpener()

	const createJobWithRetry = useCallback(
		(req: JobCreateRequest) => {
			if (!props.profileId) throw new Error('profile is required')
			return withJobQueueRetry(() => api.createJob(props.profileId!, req))
		},
		[api, props.profileId],
	)

	const isDesktop = !!screens.lg
	const isWideDesktop = !!screens.xl
	const canDragDrop = !!screens.lg && !isOffline

	const {
		bucket,
		prefix,
		tabs,
		activeTabId,
		recentBuckets,
		setActiveTabId,
		pathDraft,
		setPathDraft,
		pathModalOpen,
		setPathModalOpen,
		pathInputRef,
		openPathModal,
		prefixByBucketRef,
		navigateToLocation,
		canGoBack,
		canGoForward,
		goBack,
		goForward,
		addTab,
		closeTab,
		pathOptions,
		isBookmarked,
		toggleBookmark,
		canGoUp,
		onUp,
		onOpenPrefix,
		commitPathDraft,
	} = useObjectsLocationState({ profileId: props.profileId })
	const [uiMode, setUiMode] = useLocalStorageState<ObjectsUIMode>('objectsUIMode', 'simple')
	const isAdvanced = uiMode === 'advanced'
	const { search, searchDraft, setSearchDraft, clearSearch, deferredSearch } = useObjectsSearchState()

	const {
		globalSearch,
		setGlobalSearch,
		globalSearchDraft,
		setGlobalSearchDraft,
		deferredGlobalSearch,
		globalSearchPrefix,
		setGlobalSearchPrefix,
		globalSearchLimit,
		setGlobalSearchLimit,
		globalSearchExt,
		setGlobalSearchExt,
		globalSearchMinSize,
		setGlobalSearchMinSize,
		globalSearchMaxSize,
		setGlobalSearchMaxSize,
		globalSearchMinModifiedMs,
		setGlobalSearchMinModifiedMs,
		globalSearchMaxModifiedMs,
		setGlobalSearchMaxModifiedMs,
		indexPrefix,
		setIndexPrefix,
		indexFullReindex,
		setIndexFullReindex,
		resetGlobalSearch,
	} = useObjectsGlobalSearchState()

	const { globalSearchOpen, openGlobalSearch, closeGlobalSearch } = useObjectsGlobalSearchOverlayState({
		globalSearch,
		setGlobalSearch,
		globalSearchDraft,
		setGlobalSearchDraft,
	})

	const {
		typeFilter,
		setTypeFilter,
		favoritesOnly,
		setFavoritesOnly,
		favoritesFirst,
		setFavoritesFirst,
		favoritesSearch,
		setFavoritesSearch,
		favoritesOpenDetails,
		setFavoritesOpenDetails,
		extFilter,
		setExtFilter,
		minSize,
		setMinSize,
		maxSize,
		setMaxSize,
		minModifiedMs,
		setMinModifiedMs,
		maxModifiedMs,
		setMaxModifiedMs,
		sort,
		setSort,
		viewMode,
		setViewMode,
		showThumbnails,
		thumbnailCacheSize,
		autoIndexEnabled,
		autoIndexTtlHours,
	} = useObjectsFiltersState()
	const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false)
	const [detailsOpen, setDetailsOpen] = useLocalStorageState<boolean>('objectsDetailsOpen', true)
	const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false)
	const layoutRef = useRef<HTMLDivElement | null>(null)
	const [layoutWidthPx, setLayoutWidthPx] = useState(0)
	const [autoScanReadyKey, setAutoScanReadyKey] = useState('')
	const autoScanKey = bucket ? `${bucket}|${prefix}` : ''
	const autoScanReady = !!bucket && autoScanReadyKey === autoScanKey
	const handleToggleUiMode = useCallback(() => {
		if (isAdvanced) {
			setDetailsOpen(false)
			setDetailsDrawerOpen(false)
			setUiMode('simple')
			return
		}
		setUiMode('advanced')
	}, [isAdvanced, setDetailsDrawerOpen, setDetailsOpen, setUiMode])
	const normalizedThumbnailCacheSize = useMemo(() => {
		if (typeof thumbnailCacheSize !== 'number' || !Number.isFinite(thumbnailCacheSize)) {
			return THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES
		}
		return Math.min(
			THUMBNAIL_CACHE_MAX_ENTRIES,
			Math.max(THUMBNAIL_CACHE_MIN_ENTRIES, Math.round(thumbnailCacheSize)),
		)
	}, [thumbnailCacheSize])
	const thumbnailCache = useMemo(() => createThumbnailCache({ maxEntries: normalizedThumbnailCacheSize }), [normalizedThumbnailCacheSize])
	const autoIndexTtlMs = useMemo(() => {
		if (typeof autoIndexTtlHours !== 'number' || !Number.isFinite(autoIndexTtlHours)) {
			return OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS * 60 * 60 * 1000
		}
		const clamped = Math.min(
			OBJECTS_AUTO_INDEX_TTL_MAX_HOURS,
			Math.max(OBJECTS_AUTO_INDEX_TTL_MIN_HOURS, Math.round(autoIndexTtlHours)),
		)
		return clamped * 60 * 60 * 1000
	}, [autoIndexTtlHours])
	const { selectedKeys, setSelectedKeys, selectedCount, lastSelectedObjectKey, setLastSelectedObjectKey, clearSelection } = useObjectsSelection()
	const {
		treeData,
		treeExpandedKeys,
		setTreeExpandedKeys,
		treeSelectedKeys,
		setTreeSelectedKeys,
		onTreeLoadData,
		refreshTreeNode,
		treeLoadingKeys,
		treeDrawerOpen,
		setTreeDrawerOpen,
	} = useObjectsTree({
		api,
		profileId: props.profileId,
		bucket,
		prefix,
		debugEnabled: debugObjectsList,
		log: logObjectsDebug,
	})
	const {
		dockTree,
		dockDetails,
		detailsVisible,
		treeWidthUsed,
		detailsWidthUsed,
		isCompactList,
		treeResizeHandleWidth,
		detailsResizeHandleWidth,
		onTreeResizePointerDown,
		onTreeResizePointerMove,
		onTreeResizePointerUp,
		onDetailsResizePointerDown,
		onDetailsResizePointerMove,
		onDetailsResizePointerUp,
	} = useObjectsLayout({
		layoutWidthPx,
		isDesktop,
		isWideDesktop,
		isAdvanced,
		detailsOpen,
		detailsDrawerOpen,
		setDetailsDrawerOpen,
		setTreeDrawerOpen,
	})

	const [moveAfterUploadDefault, setMoveAfterUploadDefault] = useLocalStorageState<boolean>('moveAfterUploadDefault', false)
	const [cleanupEmptyDirsDefault, setCleanupEmptyDirsDefault] = useLocalStorageState<boolean>('cleanupEmptyDirsDefault', false)
	const [downloadLinkProxyEnabled] = useLocalStorageState<boolean>('downloadLinkProxyEnabled', false)
	const {
		profileCapabilities,
		objectCrudSupported,
		uploadSupported,
		uploadDisabledReason,
		bucketsQuery,
		bucketOptions,
		objectsQuery,
		favoritesQuery,
		favoriteItems,
		favoriteKeys,
		favoritePendingKeys,
		toggleFavorite,
	} = useObjectsPageQueries({
		api,
		apiToken: props.apiToken,
		profileId: props.profileId,
		bucket,
		prefix,
		debugObjectsList,
	})

	useEffect(() => {
		const el = layoutRef.current
		if (!el) return
		const ro = new ResizeObserver((entries) => {
			const next = entries[0]?.contentRect?.width ?? 0
			setLayoutWidthPx(Math.max(0, Math.round(next)))
		})
		ro.observe(el)
		return () => ro.disconnect()
	}, [])

	useEffect(() => {
		if (uiMode !== 'simple') return
		setExtFilter('')
		setMinSize(null)
		setMaxSize(null)
	}, [setExtFilter, setMaxSize, setMinSize, uiMode])

	useEffect(() => {
		if (uiMode !== 'simple') return
		setDetailsOpen(false)
	}, [setDetailsOpen, uiMode])

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
				e.preventDefault()
				openPathModal()
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [openPathModal])

	const {
		globalSearchQueryText,
		globalSearchPrefixNormalized,
		globalSearchLimitClamped,
		indexedSearchQuery,
		indexedSearchItems,
		indexedSearchNotIndexed,
		indexedSearchErrorMessage,
	} = useObjectsIndexedSearchQuery({
		api,
		apiToken: props.apiToken,
		profileId: props.profileId,
		bucket,
		globalSearchOpen,
		deferredGlobalSearch,
		globalSearchPrefix,
		globalSearchLimit,
		globalSearchExt,
		globalSearchMinSize,
		globalSearchMaxSize,
		globalSearchMinModifiedMs,
		globalSearchMaxModifiedMs,
	})

	const { zipPrefixJobMutation, zipObjectsJobMutation } = useObjectsZipJobs({
		profileId: props.profileId,
		bucket,
		prefix,
		transfers,
		createJobWithRetry,
	})
	const { indexObjectsJobMutation } = useObjectsIndexing({
		api,
		profileId: props.profileId,
		bucket,
		prefix,
		globalSearchOpen,
		globalSearchQueryText,
		globalSearchPrefixNormalized,
		autoIndexEnabled,
		autoIndexTtlMs,
		autoIndexCooldownMs: AUTO_INDEX_COOLDOWN_MS,
		setIndexPrefix,
		createJobWithRetry,
	})

	const {
		highlightText,
		rows,
		rowIndexByObjectKey,
		rawTotalCount,
		emptyKind,
		visibleObjectKeys,
		orderedVisibleObjectKeys,
		visiblePrefixCount,
		visibleFileCount,
		allLoadedSelected,
		someLoadedSelected,
		extOptions,
	} = useObjectsListDerivedState({
		deferredSearch,
		objectsPages: objectsQuery.data?.pages ?? [],
		favoriteItems,
		favoritesOnly,
		favoriteKeys,
		prefix,
		extFilter,
		minSize,
		maxSize,
		minModifiedMs,
		maxModifiedMs,
		typeFilter,
		sort,
		favoritesFirst,
		selectedKeys,
	})

	const {
		selectObjectFromPointerEvent,
		selectObjectFromCheckboxEvent,
		ensureObjectSelectedForContextMenu,
	} = useObjectsSelectionHandlers({
		orderedVisibleObjectKeys,
		lastSelectedObjectKey,
		setSelectedKeys,
		setLastSelectedObjectKey,
	})
	const { handleToggleSelectAll, selectRange, selectAllLoaded } = useObjectsSelectionBulk({
		visibleObjectKeys,
		orderedVisibleObjectKeys,
		setSelectedKeys,
		setLastSelectedObjectKey,
	})

	const { handleBucketDropdownVisibleChange } = useObjectsPrefetch({
		api,
		apiToken: props.apiToken,
		profileId: props.profileId,
		queryClient,
		bucket,
		recentBuckets,
		bucketOptions,
		prefixByBucketRef,
		pageSize: OBJECTS_LIST_PAGE_SIZE,
	})

	const handleTreeSelect = useCallback(
		(key: string, closeDrawer: boolean) => {
			setTreeSelectedKeys([key])
			if (!bucket) return
			navigateToLocation(bucket, key === '/' ? '' : key, { recordHistory: true })
			if (closeDrawer) setTreeDrawerOpen(false)
		},
		[bucket, navigateToLocation, setTreeDrawerOpen, setTreeSelectedKeys],
	)

	return {
		activeTabId,
		addTab,
		allLoadedSelected,
		api,
		autoScanReady,
		bucket,
		bucketOptions,
		bucketsQuery,
		canGoBack,
		canGoForward,
		canGoUp,
		canDragDrop,
		cleanupEmptyDirsDefault,
		clearSearch,
		clearSelection,
		closeGlobalSearch,
		closeTab,
		commandPaletteOpener,
		commitPathDraft,
		createJobWithRetry,
		debugContextMenu,
		debugObjectsList,
		deferredGlobalSearch,
		deferredSearch,
		detailsDrawerOpen,
		detailsOpen,
		detailsResizeHandleWidth,
		detailsVisible,
		detailsWidthUsed,
		dockDetails,
		dockTree,
		downloadLinkProxyEnabled,
		emptyKind,
		ensureObjectSelectedForContextMenu,
		extFilter,
		extOptions,
		favoriteItems,
		favoriteKeys,
		favoritePendingKeys,
		favoritesFirst,
		favoritesOnly,
		favoritesOpenDetails,
		favoritesQuery,
		favoritesSearch,
		filtersDrawerOpen,
		globalSearch,
		globalSearchDraft,
		globalSearchExt,
		globalSearchLimit,
		globalSearchLimitClamped,
		globalSearchMaxModifiedMs,
		globalSearchMaxSize,
		globalSearchMinModifiedMs,
		globalSearchMinSize,
		globalSearchOpen,
		globalSearchPrefix,
		globalSearchPrefixNormalized,
		globalSearchQueryText,
		goBack,
		goForward,
		handleBucketDropdownVisibleChange,
		handleToggleSelectAll,
		handleToggleUiMode,
		handleTreeSelect,
		highlightText,
		indexFullReindex,
		indexObjectsJobMutation,
		indexPrefix,
		indexedSearchErrorMessage,
		indexedSearchItems,
		indexedSearchNotIndexed,
		indexedSearchQuery,
		isAdvanced,
		isBookmarked,
		isCompactList,
		isDesktop,
		isOffline,
		lastSelectedObjectKey,
		layoutRef,
		maxModifiedMs,
		maxSize,
		minModifiedMs,
		minSize,
		moveAfterUploadDefault,
		navigateToLocation,
		objectCrudSupported,
		objectsQuery,
		onDetailsResizePointerDown,
		onDetailsResizePointerMove,
		onDetailsResizePointerUp,
		onOpenPrefix,
		onTreeLoadData,
		onTreeResizePointerDown,
		onTreeResizePointerMove,
		onTreeResizePointerUp,
		onUp,
		openGlobalSearch,
		openPathModal,
		orderedVisibleObjectKeys,
		pathDraft,
		pathInputRef,
		pathModalOpen,
		pathOptions,
		prefix,
		prefixByBucketRef,
		profileCapabilities,
		queryClient,
		rawTotalCount,
		recentBuckets,
		refreshTreeNode,
		resetGlobalSearch,
		rowIndexByObjectKey,
		rows,
		screens,
		search,
		searchDraft,
		selectAllLoaded,
		selectObjectFromCheckboxEvent,
		selectObjectFromPointerEvent,
		selectRange,
		selectedCount,
		selectedKeys,
		setActiveTabId,
		setCleanupEmptyDirsDefault,
		setDetailsDrawerOpen,
		setDetailsOpen,
		setExtFilter,
		setFavoritesFirst,
		setFavoritesOnly,
		setFavoritesOpenDetails,
		setFavoritesSearch,
		setFiltersDrawerOpen,
		setGlobalSearch,
		setGlobalSearchDraft,
		setGlobalSearchExt,
		setGlobalSearchLimit,
		setGlobalSearchMaxModifiedMs,
		setGlobalSearchMaxSize,
		setGlobalSearchMinModifiedMs,
		setGlobalSearchMinSize,
		setGlobalSearchPrefix,
		setIndexFullReindex,
		setIndexPrefix,
		setLastSelectedObjectKey,
		setMaxModifiedMs,
		setMaxSize,
		setMinModifiedMs,
		setMinSize,
		setMoveAfterUploadDefault,
		setPathDraft,
		setPathModalOpen,
		setSearchDraft,
		setSelectedKeys,
		setSort,
		setViewMode,
		setAutoScanReadyKey,
		setTreeDrawerOpen,
		setTreeExpandedKeys,
		setTreeSelectedKeys,
		setTypeFilter,
		setUiMode,
		showThumbnails,
		someLoadedSelected,
		sort,
		tabs,
		thumbnailCache,
		toggleBookmark,
		toggleFavorite,
		transfers,
		treeData,
		treeDrawerOpen,
		treeExpandedKeys,
		treeLoadingKeys,
		treeResizeHandleWidth,
		treeSelectedKeys,
		treeWidthUsed,
		typeFilter,
		uploadDisabledReason,
		uploadSupported,
		visibleFileCount,
		visibleObjectKeys,
		visiblePrefixCount,
		viewMode,
		zipObjectsJobMutation,
		zipPrefixJobMutation,
	}
}
