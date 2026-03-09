import type { ObjectsPagePanesProps } from './ObjectsPagePanes'
import type { BuildObjectsPagePanesPropsArgs } from './buildObjectsPagePanesProps'
import type { UIAction } from './objectsActions'

type ListProps = ObjectsPagePanesProps['listProps']
type ControlsProps = ListProps['controlsProps']

const SORT_OPTIONS: ControlsProps['sortOptions'] = [
	{ label: 'Name (A -> Z)', value: 'name_asc' },
	{ label: 'Name (Z -> A)', value: 'name_desc' },
	{ label: 'Size (smallest)', value: 'size_asc' },
	{ label: 'Size (largest)', value: 'size_desc' },
	{ label: 'Last modified (oldest)', value: 'time_asc' },
	{ label: 'Last modified (newest)', value: 'time_desc' },
]

export function buildObjectsListPaneProps(args: BuildObjectsPagePanesPropsArgs): ListProps {
	const hasProfile = !!args.profileId
	const hasBucket = !!args.bucket
	const moveSelectionAction: UIAction | undefined =
		args.moveSelectionAction ??
		(args.selectedCount > 0
			? {
					id: 'move_selected_to',
					label: args.selectedCount > 1 ? 'Move selection to…' : 'Move to…',
					shortLabel: 'Move to…',
					enabled: hasProfile && hasBucket && args.canInteract,
					run: args.openMoveSelection,
				}
			: undefined)

	return {
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
			moveAction: moveSelectionAction,
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
	}
}
