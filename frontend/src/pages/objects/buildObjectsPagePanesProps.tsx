import type { ObjectSort } from './objectsTypes'
import type { ObjectPreview, ObjectsViewMode } from './objectsTypes'
import type { ObjectsPagePanesProps } from './ObjectsPagePanes'

type TreeProps = ObjectsPagePanesProps['treeProps']
type ListProps = ObjectsPagePanesProps['listProps']
type ControlsProps = ListProps['controlsProps']
type SelectionBarProps = ListProps['selectionBarProps']
type ListHeaderProps = ListProps['listHeaderProps']
type ContentProps = ListProps['contentProps']
type DetailsProps = ObjectsPagePanesProps['detailsProps']

const SORT_OPTIONS: ControlsProps['sortOptions'] = [
	{ label: 'Name (A -> Z)', value: 'name_asc' },
	{ label: 'Name (Z -> A)', value: 'name_desc' },
	{ label: 'Size (smallest)', value: 'size_asc' },
	{ label: 'Size (largest)', value: 'size_desc' },
	{ label: 'Last modified (oldest)', value: 'time_asc' },
	{ label: 'Last modified (newest)', value: 'time_desc' },
]

type BuildObjectsPagePanesPropsArgs = {
	profileId: string | null
	bucket: string
	prefix: string
	layoutProps: ObjectsPagePanesProps['layoutProps']
	contextMenuPortalProps: ObjectsPagePanesProps['contextMenuPortalProps']

	treeDrawerOpen: boolean
	dockTree: boolean
	favoriteItems: TreeProps['favorites']
	favoritesSearch: string
	setFavoritesSearch: (value: string) => void
	favoritesOnly: boolean
	setFavoritesOnly: (value: boolean) => void
	favoritesOpenDetails: boolean
	setFavoritesOpenDetails: (value: boolean) => void
	handleFavoriteSelect: (key: string, closeDrawer: boolean) => void
	favoritesLoading: boolean
	favoritesErrorMessage: string | null
	treeData: TreeProps['treeData']
	treeLoadingKeys: TreeProps['loadingKeys']
	onTreeLoadData: TreeProps['onLoadData']
	treeSelectedKeys: TreeProps['selectedKeys']
	treeExpandedKeys: TreeProps['expandedKeys']
	setTreeExpandedKeys: TreeProps['onExpandedKeysChange']
	handleTreeSelect: (key: string, closeDrawer: boolean) => void
	normalizeDropTargetPrefix: TreeProps['getDropTargetPrefix']
	canDragDrop: boolean
	dndHoverPrefix: string | null
	onDndTargetDragOver: TreeProps['onDndTargetDragOver']
	onDndTargetDragLeave: TreeProps['onDndTargetDragLeave']
	onDndTargetDrop: TreeProps['onDndTargetDrop']
	onTreeResizePointerDown: TreeProps['onResizePointerDown']
	onTreeResizePointerMove: TreeProps['onResizePointerMove']
	onTreeResizePointerUp: TreeProps['onResizePointerUp']
	canCreateFolder: boolean
	createFolderTooltipText: string
	openNewFolder: (parentPrefixOverride?: string) => void
	handleTreePrefixContextMenu: TreeProps['onPrefixContextMenu']
	setTreeDrawerOpen: (value: boolean) => void

	isBookmarked: boolean
	toggleBookmark: () => void
	openPathModal: () => void
	breadcrumbItems: ControlsProps['breadcrumbItems']
	isCompactList: boolean
	searchDraft: string
	setSearchDraft: (value: string) => void
	hasActiveView: boolean
	setFiltersDrawerOpen: (value: boolean) => void
	isAdvanced: boolean
	visiblePrefixCount: number
	visibleFileCount: number
	search: string
	objectsHasNextPage: boolean
	objectsIsFetchingNextPage: boolean
	rawTotalCount: number
	searchAutoScanCap: number
	openGlobalSearch: () => void
	setUiMode: (next: 'simple' | 'advanced') => void
	canInteract: boolean
	sort: ObjectSort
	setSort: (value: ObjectSort) => void
	favoritesFirst: boolean
	setFavoritesFirst: (value: boolean) => void
	viewMode: ObjectsViewMode
	setViewMode: (value: ObjectsViewMode) => void
	isOffline: boolean
	objectsErrorMessage: string | null
	uploadDropActive: boolean
	uploadDropLabel: string
	onUploadDragEnter: ListProps['onUploadDragEnter']
	onUploadDragLeave: ListProps['onUploadDragLeave']
	onUploadDragOver: ListProps['onUploadDragOver']
	onUploadDrop: ListProps['onUploadDrop']
	selectedCount: number
	singleSelectedKey: string | null
	singleSelectedSize?: number
	clearSelectionAction: SelectionBarProps['clearAction']
	deleteSelectionAction: SelectionBarProps['deleteAction']
	downloadSelectionAction: SelectionBarProps['downloadAction']
	selectionMenuActions: SelectionBarProps['selectionMenuActions']
	getObjectActions: SelectionBarProps['getObjectActions']
	isDownloadLoading: boolean
	isDeleteLoading: boolean
	listGridClassName: string
	allLoadedSelected: boolean
	someLoadedSelected: boolean
	visibleObjectKeys: string[]
	handleToggleSelectAll: ListHeaderProps['onToggleSelectAll']
	sortDirForColumn: ListHeaderProps['sortDirForColumn']
	toggleSortColumn: ListHeaderProps['onToggleSort']
	listScrollerRef: ListProps['listScrollerRef']
	getListScrollerElement: () => HTMLDivElement | null
	listKeydownHandler: ListProps['onListScrollerKeyDown']
	handleListScrollerScroll: ListProps['onListScrollerScroll']
	handleListScrollerWheel: ListProps['onListScrollerWheel']
	handleListScrollerContextMenu: ListProps['onListScrollerContextMenu']
	rows: ContentProps['rows']
	virtualItemsForRender: ContentProps['virtualItems']
	totalSize: number
	listIsFetching: boolean
	listIsFetchingNextPage: boolean
	emptyKind: ContentProps['emptyKind']
	canClearSearch: boolean
	handleClearSearch: () => void
	renderPrefixRow: ContentProps['renderPrefixRow']
	renderObjectRow: ContentProps['renderObjectRow']
	renderPrefixGridItem: ContentProps['renderPrefixGridItem']
	renderObjectGridItem: ContentProps['renderObjectGridItem']
	showLoadMore: boolean
	loadMoreLabel: string
	loadMoreDisabled: boolean
	handleLoadMore: () => void

	detailsKey: string | null
	detailsMeta: DetailsProps['detailsMeta']
	detailsMetaQueryIsFetching: boolean
	detailsMetaQueryIsError: boolean
	detailsMetaErrorMessage: string
	refetchDetailsMeta: () => void
	onCopy: (value: string) => void
	onDownload: (key: string, size?: number) => void
	presignMutate: (key: string) => void
	presignPendingForKey: boolean
	openCopyMove: (mode: 'copy' | 'move', key: string) => void
	confirmDeleteObjects: (keys: string[]) => void
	detailsDeleteLoading: boolean
	detailsThumbnail: DetailsProps['thumbnail']
	preview: ObjectPreview | null
	loadPreview: DetailsProps['onLoadPreview']
	cancelPreview: DetailsProps['onCancelPreview']
	canCancelPreview: boolean
	openLargePreview: () => void
	dockDetails: boolean
	detailsOpen: boolean
	detailsDrawerOpen: boolean
	openDetails: () => void
	setDetailsOpen: (value: boolean) => void
	setDetailsDrawerOpen: (value: boolean) => void
	onDetailsResizePointerDown: DetailsProps['onResizePointerDown']
	onDetailsResizePointerMove: DetailsProps['onResizePointerMove']
	onDetailsResizePointerUp: DetailsProps['onResizePointerUp']
}

export function buildObjectsPagePanesProps(args: BuildObjectsPagePanesPropsArgs): Omit<ObjectsPagePanesProps, 'layoutRef'> {
	const hasProfile = !!args.profileId
	const hasBucket = !!args.bucket

	return {
		layoutProps: args.layoutProps,
		contextMenuPortalProps: args.contextMenuPortalProps,
		treeProps: {
			dockTree: args.dockTree,
			treeDrawerOpen: args.treeDrawerOpen,
			hasProfile,
			hasBucket,
			favorites: args.favoriteItems,
			favoritesSearch: args.favoritesSearch,
			onFavoritesSearchChange: args.setFavoritesSearch,
			favoritesOnly: args.favoritesOnly,
			onFavoritesOnlyChange: args.setFavoritesOnly,
			favoritesOpenDetails: args.favoritesOpenDetails,
			onFavoritesOpenDetailsChange: args.setFavoritesOpenDetails,
			onSelectFavorite: (key) => args.handleFavoriteSelect(key, false),
			onSelectFavoriteFromDrawer: (key) => args.handleFavoriteSelect(key, true),
			favoritesLoading: args.favoritesLoading,
			favoritesError: args.favoritesErrorMessage,
			treeData: args.treeData,
			loadingKeys: args.treeLoadingKeys,
			onLoadData: args.onTreeLoadData,
			selectedKeys: args.treeSelectedKeys,
			expandedKeys: args.treeExpandedKeys,
			onExpandedKeysChange: args.setTreeExpandedKeys,
			onSelectKey: (key) => args.handleTreeSelect(key, false),
			onSelectKeyFromDrawer: (key) => args.handleTreeSelect(key, true),
			getDropTargetPrefix: args.normalizeDropTargetPrefix,
			canDragDrop: args.canDragDrop,
			dndHoverPrefix: args.dndHoverPrefix,
			onDndTargetDragOver: args.onDndTargetDragOver,
			onDndTargetDragLeave: args.onDndTargetDragLeave,
			onDndTargetDrop: args.onDndTargetDrop,
			onResizePointerDown: args.onTreeResizePointerDown,
			onResizePointerMove: args.onTreeResizePointerMove,
			onResizePointerUp: args.onTreeResizePointerUp,
			canCreateFolder: args.canCreateFolder,
			createFolderTooltipText: args.createFolderTooltipText,
			onNewFolderAtPrefix: args.openNewFolder,
			onPrefixContextMenu: args.handleTreePrefixContextMenu,
			onCloseDrawer: () => args.setTreeDrawerOpen(false),
		},
		listProps: {
			controlsProps: {
				bucket: args.bucket,
				prefix: args.prefix,
				breadcrumbItems: args.breadcrumbItems,
				isBookmarked: args.isBookmarked,
				onToggleBookmark: args.toggleBookmark,
				onOpenPath: args.openPathModal,
				isCompact: args.isCompactList,
				searchDraft: args.searchDraft,
				onSearchDraftChange: args.setSearchDraft,
				hasActiveView: args.hasActiveView,
				onOpenFilters: () => args.setFiltersDrawerOpen(true),
				isAdvanced: args.isAdvanced,
				visiblePrefixCount: args.visiblePrefixCount,
				visibleFileCount: args.visibleFileCount,
				search: args.search,
				hasNextPage: args.favoritesOnly ? false : args.objectsHasNextPage,
				isFetchingNextPage: args.favoritesOnly ? false : args.objectsIsFetchingNextPage,
				rawTotalCount: args.rawTotalCount,
				searchAutoScanCap: args.searchAutoScanCap,
				onOpenGlobalSearch: () => {
					if (!args.isAdvanced) args.setUiMode('advanced')
					args.openGlobalSearch()
				},
				canInteract: args.canInteract,
				favoritesOnly: args.favoritesOnly,
				sort: args.sort,
				sortOptions: SORT_OPTIONS,
				onSortChange: args.setSort,
				favoritesFirst: args.favoritesFirst,
				onFavoritesFirstChange: args.setFavoritesFirst,
				viewMode: args.viewMode,
				onViewModeChange: args.setViewMode,
			},
			isOffline: args.isOffline,
			favoritesOnly: args.favoritesOnly,
			favoritesErrorMessage: args.favoritesErrorMessage,
			objectsErrorMessage: args.objectsErrorMessage,
			hasBucket,
			uploadDropActive: args.uploadDropActive,
			uploadDropLabel: args.uploadDropLabel,
			onUploadDragEnter: args.onUploadDragEnter,
			onUploadDragLeave: args.onUploadDragLeave,
			onUploadDragOver: args.onUploadDragOver,
			onUploadDrop: args.onUploadDrop,
			selectionBarProps: {
				selectedCount: args.selectedCount,
				singleSelectedKey: args.singleSelectedKey,
				singleSelectedSize: args.singleSelectedSize,
				isAdvanced: args.isAdvanced,
				clearAction: args.clearSelectionAction,
				deleteAction: args.deleteSelectionAction,
				downloadAction: args.downloadSelectionAction,
				selectionMenuActions: args.selectionMenuActions,
				getObjectActions: args.getObjectActions,
				isDownloadLoading: args.isDownloadLoading,
				isDeleteLoading: args.isDeleteLoading,
			},
			listHeaderProps: {
				isCompact: args.isCompactList,
				listGridClassName: args.listGridClassName,
				allLoadedSelected: args.allLoadedSelected,
				someLoadedSelected: args.someLoadedSelected,
				hasRows: args.visibleObjectKeys.length > 0,
				onToggleSelectAll: args.handleToggleSelectAll,
				sortDirForColumn: args.sortDirForColumn,
				onToggleSort: args.toggleSortColumn,
			},
			listScrollerRef: args.listScrollerRef,
			listScrollerTabIndex: 0,
			onListScrollerClick: () => args.getListScrollerElement()?.focus(),
			onListScrollerKeyDown: args.listKeydownHandler,
			onListScrollerScroll: args.handleListScrollerScroll,
			onListScrollerWheel: args.handleListScrollerWheel,
			onListScrollerContextMenu: args.handleListScrollerContextMenu,
			contentProps: {
				rows: args.rows,
				virtualItems: args.virtualItemsForRender,
				totalSize: args.totalSize,
				hasProfile,
				hasBucket,
				isFetching: args.listIsFetching,
				isFetchingNextPage: args.listIsFetchingNextPage,
				emptyKind: args.emptyKind,
				canClearSearch: args.canClearSearch,
				onClearSearch: args.handleClearSearch,
				viewMode: args.viewMode,
				renderPrefixRow: args.renderPrefixRow,
				renderObjectRow: args.renderObjectRow,
				renderPrefixGridItem: args.renderPrefixGridItem,
				renderObjectGridItem: args.renderObjectGridItem,
				showLoadMore: args.showLoadMore,
				loadMoreLabel: args.loadMoreLabel,
				loadMoreDisabled: args.loadMoreDisabled,
				onLoadMore: args.handleLoadMore,
			},
		},
		detailsProps: {
			profileId: args.profileId,
			bucket: args.bucket,
			isAdvanced: args.isAdvanced,
			selectedCount: args.selectedCount,
			detailsKey: args.detailsKey,
			detailsMeta: args.detailsMeta,
			isMetaFetching: args.detailsMetaQueryIsFetching,
			isMetaError: args.detailsMetaQueryIsError,
			metaErrorMessage: args.detailsMetaErrorMessage,
			onRetryMeta: args.refetchDetailsMeta,
			onCopyKey: () => {
				if (!args.detailsKey) return
				args.onCopy(args.detailsKey)
			},
			onDownload: () => {
				if (!args.detailsKey) return
				args.onDownload(args.detailsKey, args.detailsMeta?.size ?? args.singleSelectedSize)
			},
			onPresign: () => {
				if (!args.detailsKey) return
				args.presignMutate(args.detailsKey)
			},
			isPresignLoading: args.presignPendingForKey,
			onCopyMove: (mode) => {
				if (!args.detailsKey) return
				args.openCopyMove(mode, args.detailsKey)
			},
			onDelete: () => {
				if (!args.detailsKey) return
				args.confirmDeleteObjects([args.detailsKey])
			},
			isDeleteLoading: args.detailsDeleteLoading,
			thumbnail: args.detailsThumbnail,
			preview: args.preview,
			onLoadPreview: args.loadPreview,
			onCancelPreview: args.cancelPreview,
			canCancelPreview: args.canCancelPreview,
			onOpenLargePreview: args.openLargePreview,
			dockDetails: args.dockDetails,
			detailsOpen: args.detailsOpen,
			detailsDrawerOpen: args.detailsDrawerOpen,
			onOpenDetails: args.openDetails,
			onCloseDetails: () => args.setDetailsOpen(false),
			onCloseDrawer: () => args.setDetailsDrawerOpen(false),
			onResizePointerDown: args.onDetailsResizePointerDown,
			onResizePointerMove: args.onDetailsResizePointerMove,
			onResizePointerUp: args.onDetailsResizePointerUp,
		},
	}
}
