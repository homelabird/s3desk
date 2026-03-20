import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'

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
import { useLocalStorageState } from '../../lib/useLocalStorageState'
import { useObjectsFiltersState } from './useObjectsFiltersState'
import { useObjectsGlobalSearchOverlayState } from './useObjectsGlobalSearchOverlayState'
import { useObjectsGlobalSearchState } from './useObjectsGlobalSearchState'
import { useObjectsLayout } from './useObjectsLayout'
import { useObjectsSearchState } from './useObjectsSearchState'
import { type ObjectsUIMode } from './objectsPageConstants'

type ScreensState = Partial<Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl', boolean>>

type Args = {
	bucket: string
	prefix: string
	isOffline: boolean
	screens: ScreensState
	openPathModal: () => void
	setTreeDrawerOpen: Dispatch<SetStateAction<boolean>>
}

export function useObjectsPageViewState({ bucket, prefix, isOffline, screens, openPathModal, setTreeDrawerOpen }: Args) {
	const [uiMode, setUiMode] = useLocalStorageState<ObjectsUIMode>('objectsUIMode', 'simple')
	const isAdvanced = uiMode === 'advanced'
	const isDesktop = !!screens.xl
	const isWideDesktop = !!screens.xxl
	const canDragDrop = isDesktop && !isOffline

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
		favoritesPaneExpanded,
		setFavoritesPaneExpanded,
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
		objectsCostMode,
		autoIndexEnabled,
		autoIndexTtlHours,
	} = useObjectsFiltersState()

	const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false)
	const [detailsOpen, setDetailsOpen] = useLocalStorageState<boolean>('objectsDetailsOpen', true)
	const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false)
	const [downloadLinkProxyEnabled] = useLocalStorageState<boolean>('downloadLinkProxyEnabled', false)
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
	}, [isAdvanced, setDetailsOpen, setUiMode])

	const normalizedThumbnailCacheSize = useMemo(() => {
		if (typeof thumbnailCacheSize !== 'number' || !Number.isFinite(thumbnailCacheSize)) {
			return THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES
		}
		return Math.min(
			THUMBNAIL_CACHE_MAX_ENTRIES,
			Math.max(THUMBNAIL_CACHE_MIN_ENTRIES, Math.round(thumbnailCacheSize)),
		)
	}, [thumbnailCacheSize])
	const thumbnailCache = useMemo(
		() => createThumbnailCache({ maxEntries: normalizedThumbnailCacheSize }),
		[normalizedThumbnailCacheSize],
	)
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
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
				event.preventDefault()
				openPathModal()
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [openPathModal])

	return {
		autoIndexEnabled,
		autoIndexTtlMs,
		autoScanReady,
		canDragDrop,
		clearSearch,
		closeGlobalSearch,
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
		extFilter,
		favoritesFirst,
		favoritesOnly,
		favoritesOpenDetails,
		favoritesPaneExpanded,
		favoritesSearch,
		filtersDrawerOpen,
		globalSearch,
		globalSearchDraft,
		globalSearchExt,
		globalSearchLimit,
		globalSearchMaxModifiedMs,
		globalSearchMaxSize,
		globalSearchMinModifiedMs,
		globalSearchMinSize,
		globalSearchOpen,
		globalSearchPrefix,
		handleToggleUiMode,
		indexFullReindex,
		indexPrefix,
		isAdvanced,
		isCompactList,
		isDesktop,
		layoutRef,
		maxModifiedMs,
		maxSize,
		minModifiedMs,
		minSize,
		objectsCostMode,
		onDetailsResizePointerDown,
		onDetailsResizePointerMove,
		onDetailsResizePointerUp,
		onTreeResizePointerDown,
		onTreeResizePointerMove,
		onTreeResizePointerUp,
		openGlobalSearch,
		resetGlobalSearch,
		search,
		searchDraft,
		setAutoScanReadyKey,
		setDetailsDrawerOpen,
		setDetailsOpen,
		setExtFilter,
		setFavoritesFirst,
		setFavoritesOnly,
		setFavoritesOpenDetails,
		setFavoritesPaneExpanded,
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
		setMaxModifiedMs,
		setMaxSize,
		setMinModifiedMs,
		setMinSize,
		setSearchDraft,
		setSort,
		setTypeFilter,
		setUiMode,
		setViewMode,
		showThumbnails,
		sort,
		thumbnailCache,
		treeResizeHandleWidth,
		treeWidthUsed,
		typeFilter,
		viewMode,
	}
}
