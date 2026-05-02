import type { useObjectsIndexing } from './useObjectsIndexing'
import type { useObjectsLocationState } from './useObjectsLocationState'
import type { useObjectsPageEnvironment } from './useObjectsPageEnvironment'
import type { useObjectsPageQueries } from './useObjectsPageQueries'
import type { useObjectsPageSearchData } from './useObjectsPageSearchData'
import type { useObjectsPageViewState } from './useObjectsPageViewState'
import type { ObjectsPageSelectionState } from './useObjectsPageSelectionControls'
import type { useObjectsPrefetch } from './useObjectsPrefetch'
import type { useObjectsTree } from './useObjectsTree'
import type { useObjectsZipJobs } from './useObjectsZipJobs'

type ObjectsPageDataStateArgs = {
	environment: ReturnType<typeof useObjectsPageEnvironment>
	location: ReturnType<typeof useObjectsLocationState>
	tree: ReturnType<typeof useObjectsTree>
	view: ReturnType<typeof useObjectsPageViewState>
	queries: ReturnType<typeof useObjectsPageQueries>
	search: ReturnType<typeof useObjectsPageSearchData>
	jobs: ReturnType<typeof useObjectsZipJobs> & ReturnType<typeof useObjectsIndexing>
	selection: ObjectsPageSelectionState
	prefetch: ReturnType<typeof useObjectsPrefetch>
	handleTreeSelect: (key: string, closeDrawer: boolean) => void
}

export type ObjectsLocationVm = Pick<
	ObjectsPageDataStateArgs['location'],
	| 'activeTabId'
	| 'addTab'
	| 'bucket'
	| 'canGoBack'
	| 'canGoForward'
	| 'canGoUp'
	| 'closeTab'
	| 'commitPathDraft'
	| 'goBack'
	| 'goForward'
	| 'isBookmarked'
	| 'navigateToLocation'
	| 'onOpenPrefix'
	| 'onUp'
	| 'openPathModal'
	| 'pathDraft'
	| 'pathInputRef'
	| 'pathModalOpen'
	| 'pathOptions'
	| 'prefix'
	| 'prefixByBucketRef'
	| 'recentBuckets'
	| 'setActiveTabId'
	| 'setPathDraft'
	| 'setPathModalOpen'
	| 'tabs'
	| 'toggleBookmark'
>

export interface ObjectsListVm extends Pick<
	ObjectsPageDataStateArgs['search'],
	| 'allLoadedSelected'
	| 'emptyKind'
	| 'extOptions'
	| 'globalSearchQueryText'
	| 'highlightText'
	| 'indexedSearchErrorMessage'
	| 'indexedSearchItems'
	| 'indexedSearchNotIndexed'
	| 'indexedSearchQuery'
	| 'orderedVisibleObjectKeys'
	| 'rawTotalCount'
	| 'rowIndexByObjectKey'
	| 'rows'
	| 'someLoadedSelected'
	| 'visibleFileCount'
	| 'visibleObjectKeys'
	| 'visiblePrefixCount'
>,
	Pick<
		ObjectsPageDataStateArgs['queries'],
		| 'bucketOptions'
		| 'bucketsQuery'
		| 'favoriteItems'
		| 'favoriteKeys'
		| 'favoritePendingKeys'
		| 'favoritesQuery'
		| 'objectsQuery'
	>,
	Pick<
		ObjectsPageDataStateArgs['view'],
		| 'clearSearch'
		| 'deferredGlobalSearch'
		| 'deferredSearch'
		| 'extFilter'
		| 'favoritesFirst'
		| 'favoritesOnly'
		| 'isAdvanced'
		| 'isCompactList'
		| 'maxModifiedMs'
		| 'maxSize'
		| 'minModifiedMs'
		| 'minSize'
		| 'search'
		| 'searchDraft'
		| 'setExtFilter'
		| 'setFavoritesFirst'
		| 'setFavoritesOnly'
		| 'setMaxModifiedMs'
		| 'setMaxSize'
		| 'setMinModifiedMs'
		| 'setMinSize'
		| 'setSearchDraft'
		| 'setSort'
		| 'setTypeFilter'
		| 'setViewMode'
		| 'showThumbnails'
		| 'sort'
		| 'typeFilter'
		| 'viewMode'
	>
{}

export type ObjectsSelectionVm = Pick<
	ObjectsPageDataStateArgs['selection'],
	| 'clearSelection'
	| 'ensureObjectSelectedForContextMenu'
	| 'handleToggleSelectAll'
	| 'lastSelectedObjectKey'
	| 'selectAllLoaded'
	| 'selectObjectFromCheckboxEvent'
	| 'selectObjectFromPointerEvent'
	| 'selectRange'
	| 'selectedCount'
	| 'selectedKeys'
	| 'setLastSelectedObjectKey'
	| 'setSelectedKeys'
>

export interface ObjectsOperationVm extends Pick<
	ObjectsPageDataStateArgs['environment'],
	| 'api'
	| 'commandPaletteOpener'
	| 'createJobWithRetry'
	| 'debugContextMenu'
	| 'debugObjectsList'
	| 'isOffline'
	| 'queryClient'
	| 'transfers'
>,
	Pick<ObjectsPageDataStateArgs['view'], 'downloadLinkProxyEnabled' | 'thumbnailCache'>,
	Pick<
		ObjectsPageDataStateArgs['jobs'],
		'indexObjectsJobMutation' | 'zipObjectsJobMutation' | 'zipPrefixJobMutation'
	>,
	Pick<
		ObjectsPageDataStateArgs['queries'],
		| 'objectCrudSupported'
		| 'profileCapabilities'
		| 'toggleFavorite'
		| 'uploadDisabledReason'
		| 'uploadSupported'
	>
{
	selectedProfileProvider: NonNullable<ObjectsPageDataStateArgs['queries']['selectedProfile']>['provider'] | null
}

export interface ObjectsPaneVm extends Pick<
	ObjectsPageDataStateArgs['view'],
	| 'autoScanReady'
	| 'canDragDrop'
	| 'closeGlobalSearch'
	| 'detailsDrawerOpen'
	| 'detailsOpen'
	| 'detailsResizeHandleWidth'
	| 'detailsVisible'
	| 'detailsWidthUsed'
	| 'dockDetails'
	| 'dockTree'
	| 'favoritesOpenDetails'
	| 'favoritesPaneExpanded'
	| 'favoritesSearch'
	| 'filtersDrawerOpen'
	| 'globalSearch'
	| 'globalSearchDraft'
	| 'globalSearchExt'
	| 'globalSearchLimit'
	| 'globalSearchMaxModifiedMs'
	| 'globalSearchMaxSize'
	| 'globalSearchMinModifiedMs'
	| 'globalSearchMinSize'
	| 'globalSearchOpen'
	| 'globalSearchPrefix'
	| 'handleToggleUiMode'
	| 'indexFullReindex'
	| 'indexPrefix'
	| 'isDesktop'
	| 'layoutRef'
	| 'onDetailsResizePointerDown'
	| 'onDetailsResizePointerMove'
	| 'onDetailsResizePointerUp'
	| 'onTreeResizePointerDown'
	| 'onTreeResizePointerMove'
	| 'onTreeResizePointerUp'
	| 'openGlobalSearch'
	| 'resetGlobalSearch'
	| 'setAutoScanReadyKey'
	| 'setDetailsDrawerOpen'
	| 'setDetailsOpen'
	| 'setFavoritesOpenDetails'
	| 'setFavoritesPaneExpanded'
	| 'setFavoritesSearch'
	| 'setFiltersDrawerOpen'
	| 'setGlobalSearch'
	| 'setGlobalSearchDraft'
	| 'setGlobalSearchExt'
	| 'setGlobalSearchLimit'
	| 'setGlobalSearchMaxModifiedMs'
	| 'setGlobalSearchMaxSize'
	| 'setGlobalSearchMinModifiedMs'
	| 'setGlobalSearchMinSize'
	| 'setGlobalSearchPrefix'
	| 'setIndexFullReindex'
	| 'setIndexPrefix'
	| 'setUiMode'
	| 'treeResizeHandleWidth'
	| 'treeWidthUsed'
>,
	Pick<ObjectsPageDataStateArgs['queries'], 'favoriteCount' | 'favoritePendingKeys'>,
	Pick<ObjectsPageDataStateArgs['prefetch'], 'handleBucketDropdownVisibleChange'>,
	Pick<ObjectsPageDataStateArgs['search'], 'globalSearchLimitClamped' | 'globalSearchPrefixNormalized'>,
	Pick<ObjectsPageDataStateArgs['environment'], 'screens'>,
	Pick<
		ObjectsPageDataStateArgs['tree'],
		| 'onTreeLoadData'
		| 'refreshTreeNode'
		| 'setTreeDrawerOpen'
		| 'setTreeExpandedKeys'
		| 'setTreeSelectedKeys'
		| 'treeData'
		| 'treeDrawerOpen'
		| 'treeErrorMessage'
		| 'treeExpandedKeys'
		| 'treeLoadingKeys'
		| 'treeSelectedKeys'
	>
{
	handleTreeSelect: ObjectsPageDataStateArgs['handleTreeSelect']
}

export interface ObjectsPageDataState {
	locationVm: ObjectsLocationVm
	listVm: ObjectsListVm
	selectionVm: ObjectsSelectionVm
	operationVm: ObjectsOperationVm
	paneVm: ObjectsPaneVm
}

export function buildObjectsPageDataState(args: ObjectsPageDataStateArgs): ObjectsPageDataState {
	const locationVm: ObjectsLocationVm = {
		activeTabId: args.location.activeTabId,
		addTab: args.location.addTab,
		bucket: args.location.bucket,
		canGoBack: args.location.canGoBack,
		canGoForward: args.location.canGoForward,
		canGoUp: args.location.canGoUp,
		closeTab: args.location.closeTab,
		commitPathDraft: args.location.commitPathDraft,
		goBack: args.location.goBack,
		goForward: args.location.goForward,
		isBookmarked: args.location.isBookmarked,
		navigateToLocation: args.location.navigateToLocation,
		onOpenPrefix: args.location.onOpenPrefix,
		onUp: args.location.onUp,
		openPathModal: args.location.openPathModal,
		pathDraft: args.location.pathDraft,
		pathInputRef: args.location.pathInputRef,
		pathModalOpen: args.location.pathModalOpen,
		pathOptions: args.location.pathOptions,
		prefix: args.location.prefix,
		prefixByBucketRef: args.location.prefixByBucketRef,
		recentBuckets: args.location.recentBuckets,
		setActiveTabId: args.location.setActiveTabId,
		setPathDraft: args.location.setPathDraft,
		setPathModalOpen: args.location.setPathModalOpen,
		tabs: args.location.tabs,
		toggleBookmark: args.location.toggleBookmark,
	}

	const listVm: ObjectsListVm = {
		allLoadedSelected: args.search.allLoadedSelected,
		bucketOptions: args.queries.bucketOptions,
		bucketsQuery: args.queries.bucketsQuery,
		clearSearch: args.view.clearSearch,
		deferredGlobalSearch: args.view.deferredGlobalSearch,
		deferredSearch: args.view.deferredSearch,
		emptyKind: args.search.emptyKind,
		extFilter: args.view.extFilter,
		extOptions: args.search.extOptions,
		favoriteItems: args.queries.favoriteItems,
		favoriteKeys: args.queries.favoriteKeys,
		favoritePendingKeys: args.queries.favoritePendingKeys,
		favoritesFirst: args.view.favoritesFirst,
		favoritesOnly: args.view.favoritesOnly,
		favoritesQuery: args.queries.favoritesQuery,
		globalSearchQueryText: args.search.globalSearchQueryText,
		highlightText: args.search.highlightText,
		indexedSearchErrorMessage: args.search.indexedSearchErrorMessage,
		indexedSearchItems: args.search.indexedSearchItems,
		indexedSearchNotIndexed: args.search.indexedSearchNotIndexed,
		indexedSearchQuery: args.search.indexedSearchQuery,
		isAdvanced: args.view.isAdvanced,
		isCompactList: args.view.isCompactList,
		maxModifiedMs: args.view.maxModifiedMs,
		maxSize: args.view.maxSize,
		minModifiedMs: args.view.minModifiedMs,
		minSize: args.view.minSize,
		objectsQuery: args.queries.objectsQuery,
		orderedVisibleObjectKeys: args.search.orderedVisibleObjectKeys,
		rawTotalCount: args.search.rawTotalCount,
		rowIndexByObjectKey: args.search.rowIndexByObjectKey,
		rows: args.search.rows,
		search: args.view.search,
		searchDraft: args.view.searchDraft,
		setExtFilter: args.view.setExtFilter,
		setFavoritesFirst: args.view.setFavoritesFirst,
		setFavoritesOnly: args.view.setFavoritesOnly,
		setMaxModifiedMs: args.view.setMaxModifiedMs,
		setMaxSize: args.view.setMaxSize,
		setMinModifiedMs: args.view.setMinModifiedMs,
		setMinSize: args.view.setMinSize,
		setSearchDraft: args.view.setSearchDraft,
		setSort: args.view.setSort,
		setTypeFilter: args.view.setTypeFilter,
		setViewMode: args.view.setViewMode,
		showThumbnails: args.view.showThumbnails,
		someLoadedSelected: args.search.someLoadedSelected,
		sort: args.view.sort,
		typeFilter: args.view.typeFilter,
		visibleFileCount: args.search.visibleFileCount,
		visibleObjectKeys: args.search.visibleObjectKeys,
		visiblePrefixCount: args.search.visiblePrefixCount,
		viewMode: args.view.viewMode,
	}

	const selectionVm: ObjectsSelectionVm = {
		clearSelection: args.selection.clearSelection,
		ensureObjectSelectedForContextMenu: args.selection.ensureObjectSelectedForContextMenu,
		handleToggleSelectAll: args.selection.handleToggleSelectAll,
		lastSelectedObjectKey: args.selection.lastSelectedObjectKey,
		selectAllLoaded: args.selection.selectAllLoaded,
		selectObjectFromCheckboxEvent: args.selection.selectObjectFromCheckboxEvent,
		selectObjectFromPointerEvent: args.selection.selectObjectFromPointerEvent,
		selectRange: args.selection.selectRange,
		selectedCount: args.selection.selectedCount,
		selectedKeys: args.selection.selectedKeys,
		setLastSelectedObjectKey: args.selection.setLastSelectedObjectKey,
		setSelectedKeys: args.selection.setSelectedKeys,
	}

	const operationVm: ObjectsOperationVm = {
		api: args.environment.api,
		commandPaletteOpener: args.environment.commandPaletteOpener,
		createJobWithRetry: args.environment.createJobWithRetry,
		debugContextMenu: args.environment.debugContextMenu,
		downloadLinkProxyEnabled: args.view.downloadLinkProxyEnabled,
		indexObjectsJobMutation: args.jobs.indexObjectsJobMutation,
		isOffline: args.environment.isOffline,
		objectCrudSupported: args.queries.objectCrudSupported,
		profileCapabilities: args.queries.profileCapabilities,
		queryClient: args.environment.queryClient,
		selectedProfileProvider: args.queries.selectedProfile?.provider ?? null,
		thumbnailCache: args.view.thumbnailCache,
		toggleFavorite: args.queries.toggleFavorite,
		transfers: args.environment.transfers,
		uploadDisabledReason: args.queries.uploadDisabledReason,
		uploadSupported: args.queries.uploadSupported,
		zipObjectsJobMutation: args.jobs.zipObjectsJobMutation,
		zipPrefixJobMutation: args.jobs.zipPrefixJobMutation,
		debugObjectsList: args.environment.debugObjectsList,
	}

	const paneVm: ObjectsPaneVm = {
		autoScanReady: args.view.autoScanReady,
		canDragDrop: args.view.canDragDrop,
		closeGlobalSearch: args.view.closeGlobalSearch,
		detailsDrawerOpen: args.view.detailsDrawerOpen,
		detailsOpen: args.view.detailsOpen,
		detailsResizeHandleWidth: args.view.detailsResizeHandleWidth,
		detailsVisible: args.view.detailsVisible,
		detailsWidthUsed: args.view.detailsWidthUsed,
		dockDetails: args.view.dockDetails,
		dockTree: args.view.dockTree,
		favoriteCount: args.queries.favoriteCount,
		favoritePendingKeys: args.queries.favoritePendingKeys,
		favoritesOpenDetails: args.view.favoritesOpenDetails,
		favoritesPaneExpanded: args.view.favoritesPaneExpanded,
		favoritesSearch: args.view.favoritesSearch,
		filtersDrawerOpen: args.view.filtersDrawerOpen,
		globalSearch: args.view.globalSearch,
		globalSearchDraft: args.view.globalSearchDraft,
		globalSearchExt: args.view.globalSearchExt,
		globalSearchLimit: args.view.globalSearchLimit,
		globalSearchLimitClamped: args.search.globalSearchLimitClamped,
		globalSearchMaxModifiedMs: args.view.globalSearchMaxModifiedMs,
		globalSearchMaxSize: args.view.globalSearchMaxSize,
		globalSearchMinModifiedMs: args.view.globalSearchMinModifiedMs,
		globalSearchMinSize: args.view.globalSearchMinSize,
		globalSearchOpen: args.view.globalSearchOpen,
		globalSearchPrefix: args.view.globalSearchPrefix,
		globalSearchPrefixNormalized: args.search.globalSearchPrefixNormalized,
		handleBucketDropdownVisibleChange: args.prefetch.handleBucketDropdownVisibleChange,
		handleToggleUiMode: args.view.handleToggleUiMode,
		handleTreeSelect: args.handleTreeSelect,
		indexFullReindex: args.view.indexFullReindex,
		indexPrefix: args.view.indexPrefix,
		isDesktop: args.view.isDesktop,
		layoutRef: args.view.layoutRef,
		onDetailsResizePointerDown: args.view.onDetailsResizePointerDown,
		onDetailsResizePointerMove: args.view.onDetailsResizePointerMove,
		onDetailsResizePointerUp: args.view.onDetailsResizePointerUp,
		onTreeLoadData: args.tree.onTreeLoadData,
		onTreeResizePointerDown: args.view.onTreeResizePointerDown,
		onTreeResizePointerMove: args.view.onTreeResizePointerMove,
		onTreeResizePointerUp: args.view.onTreeResizePointerUp,
		openGlobalSearch: args.view.openGlobalSearch,
		refreshTreeNode: args.tree.refreshTreeNode,
		resetGlobalSearch: args.view.resetGlobalSearch,
		screens: args.environment.screens,
		setAutoScanReadyKey: args.view.setAutoScanReadyKey,
		setDetailsDrawerOpen: args.view.setDetailsDrawerOpen,
		setDetailsOpen: args.view.setDetailsOpen,
		setFavoritesOpenDetails: args.view.setFavoritesOpenDetails,
		setFavoritesPaneExpanded: args.view.setFavoritesPaneExpanded,
		setFavoritesSearch: args.view.setFavoritesSearch,
		setFiltersDrawerOpen: args.view.setFiltersDrawerOpen,
		setGlobalSearch: args.view.setGlobalSearch,
		setGlobalSearchDraft: args.view.setGlobalSearchDraft,
		setGlobalSearchExt: args.view.setGlobalSearchExt,
		setGlobalSearchLimit: args.view.setGlobalSearchLimit,
		setGlobalSearchMaxModifiedMs: args.view.setGlobalSearchMaxModifiedMs,
		setGlobalSearchMaxSize: args.view.setGlobalSearchMaxSize,
		setGlobalSearchMinModifiedMs: args.view.setGlobalSearchMinModifiedMs,
		setGlobalSearchMinSize: args.view.setGlobalSearchMinSize,
		setGlobalSearchPrefix: args.view.setGlobalSearchPrefix,
		setIndexFullReindex: args.view.setIndexFullReindex,
		setIndexPrefix: args.view.setIndexPrefix,
		setTreeDrawerOpen: args.tree.setTreeDrawerOpen,
		setTreeExpandedKeys: args.tree.setTreeExpandedKeys,
		setTreeSelectedKeys: args.tree.setTreeSelectedKeys,
		setUiMode: args.view.setUiMode,
		treeData: args.tree.treeData,
		treeDrawerOpen: args.tree.treeDrawerOpen,
		treeErrorMessage: args.tree.treeErrorMessage,
		treeExpandedKeys: args.tree.treeExpandedKeys,
		treeLoadingKeys: args.tree.treeLoadingKeys,
		treeResizeHandleWidth: args.view.treeResizeHandleWidth,
		treeSelectedKeys: args.tree.treeSelectedKeys,
		treeWidthUsed: args.view.treeWidthUsed,
	}

	return {
		locationVm,
		listVm,
		selectionVm,
		operationVm,
		paneVm,
	}
}
