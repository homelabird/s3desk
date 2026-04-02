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
import { shouldIgnoreGlobalKeyboardShortcut } from '../../lib/keyboardShortcuts'
import { useObjectsFiltersState } from './useObjectsFiltersState'
import { useObjectsGlobalSearchOverlayState } from './useObjectsGlobalSearchOverlayState'
import { useObjectsGlobalSearchState } from './useObjectsGlobalSearchState'
import { useObjectsLayout } from './useObjectsLayout'
import { useObjectsSearchState } from './useObjectsSearchState'
import { type ObjectsUIMode } from './objectsPageConstants'

type ScreensState = Partial<Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl', boolean>>

type Args = {
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
	isOffline: boolean
	screens: ScreensState
	openPathModal: () => void
	setTreeDrawerOpen: Dispatch<SetStateAction<boolean>>
}

export function useObjectsPageViewState({
	apiToken,
	profileId,
	bucket,
	prefix,
	isOffline,
	screens,
	openPathModal,
	setTreeDrawerOpen,
}: Args) {
	const [uiMode, setUiMode] = useLocalStorageState<ObjectsUIMode>('objectsUIMode', 'simple')
	const isAdvanced = uiMode === 'advanced'
	const isDesktop = !!screens.xl
	const isWideDesktop = !!screens.xxl
	const canDragDrop = isDesktop && !isOffline

	const { search, searchDraft, setSearchDraft, clearSearch, deferredSearch } = useObjectsSearchState({ apiToken, profileId })
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
	} = useObjectsGlobalSearchState({ apiToken, profileId, bucket })
	const { globalSearchOpen, openGlobalSearch, closeGlobalSearch } = useObjectsGlobalSearchOverlayState({
		scopeKey: `${apiToken || '__no_server__'}:${profileId?.trim() || '__no_profile__'}:${bucket || '__no_bucket__'}`,
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
	} = useObjectsFiltersState(apiToken, profileId)

	const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false)
	const [filtersDrawerScopeKey, setFiltersDrawerScopeKey] = useState('')
	const [detailsOpen, setDetailsOpen] = useLocalStorageState<boolean>('objectsDetailsOpen', true)
	const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false)
	const [detailsDrawerScopeKey, setDetailsDrawerScopeKey] = useState('')
	const [downloadLinkProxyEnabled] = useLocalStorageState<boolean>('downloadLinkProxyEnabled', false)
	const layoutRef = useRef<HTMLDivElement | null>(null)
	const [layoutWidthPx, setLayoutWidthPx] = useState(0)
	const [autoScanReadyKey, setAutoScanReadyKey] = useState('')
	const currentOverlayScopeKey = `${apiToken || '__no_server__'}:${profileId?.trim() || '__no_profile__'}`
	const filtersDrawerOpenVisible = filtersDrawerOpen && filtersDrawerScopeKey === currentOverlayScopeKey
	const detailsDrawerOpenVisible = detailsDrawerOpen && detailsDrawerScopeKey === currentOverlayScopeKey
	const autoScanServerScope = apiToken || '__no_server__'
	const autoScanProfileScope = profileId?.trim() || '__no_profile__'
	const autoScanKey = bucket ? `${autoScanServerScope}:${autoScanProfileScope}:${bucket}|${prefix}` : ''
	const autoScanReady = !!bucket && autoScanReadyKey === autoScanKey

	const setScopedFiltersDrawerOpen = useCallback(
		(next: SetStateAction<boolean>) => {
			const nextOpen = typeof next === 'function' ? next(filtersDrawerOpenVisible) : next
			setFiltersDrawerOpen(nextOpen)
			setFiltersDrawerScopeKey(nextOpen ? currentOverlayScopeKey : '')
		},
		[currentOverlayScopeKey, filtersDrawerOpenVisible],
	)

	const setScopedDetailsDrawerOpen = useCallback(
		(next: SetStateAction<boolean>) => {
			const nextOpen = typeof next === 'function' ? next(detailsDrawerOpenVisible) : next
			setDetailsDrawerOpen(nextOpen)
			setDetailsDrawerScopeKey(nextOpen ? currentOverlayScopeKey : '')
		},
		[currentOverlayScopeKey, detailsDrawerOpenVisible],
	)

	const handleToggleUiMode = useCallback(() => {
		if (isAdvanced) {
			setDetailsOpen(false)
			setScopedDetailsDrawerOpen(false)
			setUiMode('simple')
			return
		}
		setUiMode('advanced')
	}, [isAdvanced, setDetailsOpen, setScopedDetailsDrawerOpen, setUiMode])

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
		detailsDrawerOpen: detailsDrawerOpenVisible,
		setDetailsDrawerOpen: setScopedDetailsDrawerOpen,
		setTreeDrawerOpen,
	})

	useEffect(() => {
		const el = layoutRef.current
		if (!el) return
		setLayoutWidthPx(Math.max(0, Math.round(el.getBoundingClientRect().width)))
		if (typeof ResizeObserver === 'undefined') return
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
			if (shouldIgnoreGlobalKeyboardShortcut(event)) return
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
		detailsDrawerOpen: detailsDrawerOpenVisible,
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
		filtersDrawerOpen: filtersDrawerOpenVisible,
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
		setDetailsDrawerOpen: setScopedDetailsDrawerOpen,
		setDetailsOpen,
		setExtFilter,
		setFavoritesFirst,
		setFavoritesOnly,
		setFavoritesOpenDetails,
		setFavoritesPaneExpanded,
		setFavoritesSearch,
		setFiltersDrawerOpen: setScopedFiltersDrawerOpen,
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
