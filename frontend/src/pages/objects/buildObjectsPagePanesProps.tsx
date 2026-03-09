import type { ObjectSort } from './objectsTypes'
import type { ObjectPreview, ObjectsViewMode } from './objectsTypes'
import type { ObjectsPagePanesProps } from './ObjectsPagePanes'
import { buildObjectsDetailsPaneProps } from './buildObjectsDetailsPaneProps'
import { buildObjectsListPaneProps } from './buildObjectsListPaneProps'
import { buildObjectsTreePaneProps } from './buildObjectsTreePaneProps'

type TreeProps = ObjectsPagePanesProps['treeProps']
type ListProps = ObjectsPagePanesProps['listProps']
type ControlsProps = ListProps['controlsProps']
type SelectionBarProps = ListProps['selectionBarProps']
type ListHeaderProps = ListProps['listHeaderProps']
type ContentProps = ListProps['contentProps']
type DetailsProps = ObjectsPagePanesProps['detailsProps']

export type BuildObjectsPagePanesPropsArgs = {
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
	detailsPreviewThumbnail: DetailsProps['previewThumbnail']
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
	return {
		layoutProps: args.layoutProps,
		contextMenuPortalProps: args.contextMenuPortalProps,
		treeProps: buildObjectsTreePaneProps(args),
		listProps: buildObjectsListPaneProps(args),
		detailsProps: buildObjectsDetailsPaneProps(args),
	}
}
