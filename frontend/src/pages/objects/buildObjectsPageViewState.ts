import type { useObjectsAutoScanReadiness } from './useObjectsAutoScanReadiness'
import type { useObjectsPageLayoutState } from './useObjectsPageLayoutState'
import type { useObjectsPageViewFilters } from './useObjectsPageViewFilters'
import type { useObjectsScopedDrawers } from './useObjectsScopedDrawers'
import type { useObjectsViewModeState } from './useObjectsViewModeState'

type ObjectsResponsiveState = {
	canDragDrop: boolean
	isDesktop: boolean
}

type BuildObjectsPageViewStateArgs = {
	autoScan: ReturnType<typeof useObjectsAutoScanReadiness>
	drawers: ReturnType<typeof useObjectsScopedDrawers>
	filters: ReturnType<typeof useObjectsPageViewFilters>
	layout: ReturnType<typeof useObjectsPageLayoutState>
	responsive: ObjectsResponsiveState
	viewMode: ReturnType<typeof useObjectsViewModeState>
}

export function buildObjectsPageViewState({
	autoScan,
	drawers,
	filters,
	layout,
	responsive,
	viewMode,
}: BuildObjectsPageViewStateArgs) {
	return {
		autoIndexEnabled: filters.autoIndexEnabled,
		autoIndexTtlMs: viewMode.autoIndexTtlMs,
		autoScanReady: autoScan.autoScanReady,
		canDragDrop: responsive.canDragDrop,
		clearSearch: filters.clearSearch,
		closeGlobalSearch: filters.closeGlobalSearch,
		deferredGlobalSearch: filters.deferredGlobalSearch,
		deferredSearch: filters.deferredSearch,
		detailsDrawerOpen: drawers.detailsDrawerOpen,
		detailsOpen: viewMode.detailsOpen,
		detailsResizeHandleWidth: layout.detailsResizeHandleWidth,
		detailsVisible: layout.detailsVisible,
		detailsWidthUsed: layout.detailsWidthUsed,
		dockDetails: layout.dockDetails,
		dockTree: layout.dockTree,
		downloadLinkProxyEnabled: viewMode.downloadLinkProxyEnabled,
		extFilter: filters.extFilter,
		favoritesFirst: filters.favoritesFirst,
		favoritesOnly: filters.favoritesOnly,
		favoritesOpenDetails: filters.favoritesOpenDetails,
		favoritesPaneExpanded: filters.favoritesPaneExpanded,
		favoritesSearch: filters.favoritesSearch,
		filtersDrawerOpen: drawers.filtersDrawerOpen,
		globalSearch: filters.globalSearch,
		globalSearchDraft: filters.globalSearchDraft,
		globalSearchExt: filters.globalSearchExt,
		globalSearchLimit: filters.globalSearchLimit,
		globalSearchMaxModifiedMs: filters.globalSearchMaxModifiedMs,
		globalSearchMaxSize: filters.globalSearchMaxSize,
		globalSearchMinModifiedMs: filters.globalSearchMinModifiedMs,
		globalSearchMinSize: filters.globalSearchMinSize,
		globalSearchOpen: filters.globalSearchOpen,
		globalSearchPrefix: filters.globalSearchPrefix,
		handleToggleUiMode: viewMode.handleToggleUiMode,
		indexFullReindex: filters.indexFullReindex,
		indexPrefix: filters.indexPrefix,
		isAdvanced: viewMode.isAdvanced,
		isCompactList: layout.isCompactList,
		isDesktop: responsive.isDesktop,
		layoutRef: layout.layoutRef,
		maxModifiedMs: filters.maxModifiedMs,
		maxSize: filters.maxSize,
		minModifiedMs: filters.minModifiedMs,
		minSize: filters.minSize,
		objectsCostMode: filters.objectsCostMode,
		onDetailsResizePointerDown: layout.onDetailsResizePointerDown,
		onDetailsResizePointerMove: layout.onDetailsResizePointerMove,
		onDetailsResizePointerUp: layout.onDetailsResizePointerUp,
		onTreeResizePointerDown: layout.onTreeResizePointerDown,
		onTreeResizePointerMove: layout.onTreeResizePointerMove,
		onTreeResizePointerUp: layout.onTreeResizePointerUp,
		openGlobalSearch: filters.openGlobalSearch,
		resetGlobalSearch: filters.resetGlobalSearch,
		search: filters.search,
		searchDraft: filters.searchDraft,
		setAutoScanReadyKey: autoScan.setAutoScanReadyKey,
		setDetailsDrawerOpen: drawers.setDetailsDrawerOpen,
		setDetailsOpen: viewMode.setDetailsOpen,
		setExtFilter: filters.setExtFilter,
		setFavoritesFirst: filters.setFavoritesFirst,
		setFavoritesOnly: filters.setFavoritesOnly,
		setFavoritesOpenDetails: filters.setFavoritesOpenDetails,
		setFavoritesPaneExpanded: filters.setFavoritesPaneExpanded,
		setFavoritesSearch: filters.setFavoritesSearch,
		setFiltersDrawerOpen: drawers.setFiltersDrawerOpen,
		setGlobalSearch: filters.setGlobalSearch,
		setGlobalSearchDraft: filters.setGlobalSearchDraft,
		setGlobalSearchExt: filters.setGlobalSearchExt,
		setGlobalSearchLimit: filters.setGlobalSearchLimit,
		setGlobalSearchMaxModifiedMs: filters.setGlobalSearchMaxModifiedMs,
		setGlobalSearchMaxSize: filters.setGlobalSearchMaxSize,
		setGlobalSearchMinModifiedMs: filters.setGlobalSearchMinModifiedMs,
		setGlobalSearchMinSize: filters.setGlobalSearchMinSize,
		setGlobalSearchPrefix: filters.setGlobalSearchPrefix,
		setIndexFullReindex: filters.setIndexFullReindex,
		setIndexPrefix: filters.setIndexPrefix,
		setMaxModifiedMs: filters.setMaxModifiedMs,
		setMaxSize: filters.setMaxSize,
		setMinModifiedMs: filters.setMinModifiedMs,
		setMinSize: filters.setMinSize,
		setSearchDraft: filters.setSearchDraft,
		setSort: filters.setSort,
		setTypeFilter: filters.setTypeFilter,
		setUiMode: viewMode.setUiMode,
		setViewMode: filters.setViewMode,
		showThumbnails: filters.showThumbnails,
		sort: filters.sort,
		thumbnailCache: viewMode.thumbnailCache,
		treeResizeHandleWidth: layout.treeResizeHandleWidth,
		treeWidthUsed: layout.treeWidthUsed,
		typeFilter: filters.typeFilter,
		viewMode: filters.viewMode,
	}
}
