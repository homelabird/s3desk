import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useObjectsScreenComposition } from '../useObjectsScreenComposition'

type UseObjectsScreenCompositionArgs = Parameters<
	typeof import('../useObjectsScreenComposition').useObjectsScreenComposition
>[0]
type UseObjectsScreenCompositionTestData =
	& UseObjectsScreenCompositionArgs['locationVm']
	& UseObjectsScreenCompositionArgs['listVm']
	& UseObjectsScreenCompositionArgs['selectionVm']
	& UseObjectsScreenCompositionArgs['operationVm']
	& UseObjectsScreenCompositionArgs['paneVm']
	& {
		locationVm: UseObjectsScreenCompositionArgs['locationVm']
		listVm: UseObjectsScreenCompositionArgs['listVm']
		selectionVm: UseObjectsScreenCompositionArgs['selectionVm']
		operationVm: UseObjectsScreenCompositionArgs['operationVm']
		paneVm: UseObjectsScreenCompositionArgs['paneVm']
	}
type UseObjectsScreenCompositionTestArgs = UseObjectsScreenCompositionArgs & {
	data: UseObjectsScreenCompositionTestData
}
type UseObjectsScreenListArgs = Parameters<
	typeof import('../useObjectsScreenList').useObjectsScreenList
>[0]
type UseObjectsScreenListResult = ReturnType<
	typeof import('../useObjectsScreenList').useObjectsScreenList
>
type UseObjectsScreenToolbarArgs = Parameters<
	typeof import('../useObjectsScreenToolbar').useObjectsScreenToolbar
>[0]
type UseObjectsScreenToolbarResult = ReturnType<
	typeof import('../useObjectsScreenToolbar').useObjectsScreenToolbar
>
type UseObjectsScreenOverlaysArgs = Parameters<
	typeof import('../useObjectsScreenOverlays').useObjectsScreenOverlays
>[0]
type UseObjectsScreenOverlaysResult = ReturnType<
	typeof import('../useObjectsScreenOverlays').useObjectsScreenOverlays
>
type BuildObjectsPagePanesPropsArgs = Parameters<
	typeof import('../buildObjectsPagePanesProps').buildObjectsPagePanesProps
>[0]
type BuildObjectsPagePanesPropsResult = ReturnType<
	typeof import('../buildObjectsPagePanesProps').buildObjectsPagePanesProps
>
type RefCell = {
	current: unknown | null
}

function readRef<T>(ref: RefCell): T {
	return ref.current as T
}

const {
	listArgsRef,
	listStateRef,
	toolbarArgsRef,
	toolbarResultRef,
	overlaysArgsRef,
	overlaysResultRef,
	panesArgsRef,
	panesResultRef,
} = vi.hoisted(
	(): Record<string, RefCell> => ({
		listArgsRef: { current: null },
		listStateRef: { current: null },
		toolbarArgsRef: { current: null },
		toolbarResultRef: { current: null },
		overlaysArgsRef: { current: null },
		overlaysResultRef: { current: null },
		panesArgsRef: { current: null },
		panesResultRef: { current: null },
	}),
)

vi.mock('../useObjectsScreenList', () => ({
	useObjectsScreenList: (args: UseObjectsScreenListArgs) => {
		listArgsRef.current = args
		return readRef<UseObjectsScreenListResult>(listStateRef)
	},
}))

vi.mock('../useObjectsScreenToolbar', () => ({
	useObjectsScreenToolbar: (args: UseObjectsScreenToolbarArgs) => {
		toolbarArgsRef.current = args
		return readRef<UseObjectsScreenToolbarResult>(toolbarResultRef)
	},
}))

vi.mock('../useObjectsScreenOverlays', () => ({
	useObjectsScreenOverlays: (args: UseObjectsScreenOverlaysArgs) => {
		overlaysArgsRef.current = args
		return readRef<UseObjectsScreenOverlaysResult>(overlaysResultRef)
	},
}))

vi.mock('../buildObjectsPagePanesProps', () => ({
	buildObjectsPagePanesProps: (args: BuildObjectsPagePanesPropsArgs) => {
		panesArgsRef.current = args
		return readRef<BuildObjectsPagePanesPropsResult>(panesResultRef)
	},
}))

function seedCompositionState(overrides?: { detailsKey?: string | null }) {
	const refresh = vi.fn().mockResolvedValue(undefined)
	const openLargePreviewForKey = vi.fn()
	const download = vi.fn()
	const presign = vi.fn()

	const props = {
		apiToken: 'token-a',
		profileId: 'profile-1',
	}
	const data = {
		bucket: 'bucket-a',
		prefix: 'docs/',
		dockTree: true,
		treeWidthUsed: 280,
		treeResizeHandleWidth: 12,
		dockDetails: true,
		detailsWidthUsed: 360,
		detailsOpen: true,
		detailsResizeHandleWidth: 10,
		treeDrawerOpen: false,
		favoriteItems: [{ key: 'docs/report.pdf' }],
		favoriteCount: 1,
		favoritesSearch: 'report',
		setFavoritesSearch: vi.fn(),
		favoritesOnly: false,
		setFavoritesOnly: vi.fn(),
		favoritesOpenDetails: true,
		setFavoritesOpenDetails: vi.fn(),
		favoritesPaneExpanded: true,
		setFavoritesPaneExpanded: vi.fn(),
		favoritesQuery: {
			isFetching: false,
			isError: true,
			error: new Error('favorites failed'),
		},
		treeData: [{ key: '/', title: '/' }],
		treeLoadingKeys: ['/'],
		onTreeLoadData: vi.fn(),
		treeSelectedKeys: ['/'],
		treeExpandedKeys: ['/'],
		setTreeExpandedKeys: vi.fn(),
		handleTreeSelect: vi.fn(),
		canDragDrop: true,
		onTreeResizePointerDown: vi.fn(),
		onTreeResizePointerMove: vi.fn(),
		onTreeResizePointerUp: vi.fn(),
		isBookmarked: true,
		toggleBookmark: vi.fn(),
		openPathModal: vi.fn(),
		isCompactList: false,
		searchDraft: 'report',
		setSearchDraft: vi.fn(),
		setFiltersDrawerOpen: vi.fn(),
		isAdvanced: true,
		visiblePrefixCount: 2,
		visibleFileCount: 3,
		search: 'report',
		objectsQuery: {
			hasNextPage: true,
			isFetchingNextPage: false,
			isError: true,
			error: new Error('objects failed'),
		},
		rawTotalCount: 5,
		openGlobalSearch: vi.fn(),
		setUiMode: vi.fn(),
		sort: 'name_asc',
		setSort: vi.fn(),
		favoritesFirst: true,
		setFavoritesFirst: vi.fn(),
		viewMode: 'list',
		setViewMode: vi.fn(),
		isOffline: false,
		selectedCount: 1,
		allLoadedSelected: false,
		someLoadedSelected: true,
		visibleObjectKeys: ['docs/report.pdf'],
		handleToggleSelectAll: vi.fn(),
		rows: [{ key: 'docs/report.pdf', kind: 'object' }],
		emptyKind: 'results',
		profileCapabilities: { presignedUpload: true },
		detailsDrawerOpen: false,
		setDetailsOpen: vi.fn(),
		setDetailsDrawerOpen: vi.fn(),
		onDetailsResizePointerDown: vi.fn(),
		onDetailsResizePointerMove: vi.fn(),
		onDetailsResizePointerUp: vi.fn(),
		bucketOptions: [{ label: 'bucket-a', value: 'bucket-a' }],
		bucketsQuery: {
			isFetching: true,
			isError: false,
			error: null,
		},
		screens: { md: true, sm: true },
		isDesktop: true,
		recentBuckets: ['bucket-a'],
		canGoBack: true,
		canGoForward: false,
		canGoUp: true,
		goBack: vi.fn(),
		goForward: vi.fn(),
		onUp: vi.fn(),
		uploadSupported: true,
		uploadDisabledReason: null,
		objectCrudSupported: true,
		transfers: {
			activeTransferCount: 2,
			openTransfers: vi.fn(),
		},
		setTreeDrawerOpen: vi.fn(),
		tabs: [{ id: 'tab-1', bucket: 'bucket-a', prefix: 'docs/' }],
		activeTabId: 'tab-1',
		setActiveTabId: vi.fn(),
		addTab: vi.fn(),
		closeTab: vi.fn(),
		prefixByBucketRef: { current: { 'bucket-a': 'docs/' } },
		navigateToLocation: vi.fn(),
		filtersDrawerOpen: true,
		typeFilter: 'all',
		setTypeFilter: vi.fn(),
		extFilter: 'pdf',
		extOptions: ['pdf'],
		setExtFilter: vi.fn(),
		minSize: 10,
		maxSize: 1000,
		setMinSize: vi.fn(),
		setMaxSize: vi.fn(),
		minModifiedMs: 100,
		maxModifiedMs: 200,
		setMinModifiedMs: vi.fn(),
		setMaxModifiedMs: vi.fn(),
		pathModalOpen: false,
		pathDraft: 'docs/',
		pathOptions: [{ value: 'docs/' }],
		pathInputRef: { current: null },
		setPathDraft: vi.fn(),
		commitPathDraft: vi.fn(),
		setPathModalOpen: vi.fn(),
		globalSearchOpen: true,
		closeGlobalSearch: vi.fn(),
		globalSearchDraft: 'report',
		setGlobalSearchDraft: vi.fn(),
		globalSearchPrefix: 'docs',
		setGlobalSearchPrefix: vi.fn(),
		globalSearchLimitClamped: 25,
		setGlobalSearchLimit: vi.fn(),
		globalSearchExt: 'pdf',
		setGlobalSearchExt: vi.fn(),
		globalSearchMinSize: 10,
		setGlobalSearchMinSize: vi.fn(),
		globalSearchMaxSize: 1000,
		setGlobalSearchMaxSize: vi.fn(),
		globalSearchMinModifiedMs: 100,
		setGlobalSearchMinModifiedMs: vi.fn(),
		globalSearchMaxModifiedMs: 200,
		setGlobalSearchMaxModifiedMs: vi.fn(),
		resetGlobalSearch: vi.fn(),
		indexedSearchQuery: 'annual',
		indexedSearchNotIndexed: false,
		indexedSearchErrorMessage: '',
		indexedSearchItems: [{ key: 'docs/report.pdf' }],
		indexObjectsJobMutation: { isPending: false },
		indexPrefix: 'docs/',
		setIndexPrefix: vi.fn(),
		indexFullReindex: false,
		setIndexFullReindex: vi.fn(),
		globalSearchQueryText: 'annual',
		onOpenPrefix: vi.fn(),
		zipObjectsJobMutation: { isPending: false },
	} as unknown as UseObjectsScreenCompositionTestData
	Object.assign(data, {
		locationVm: data,
		listVm: data,
		selectionVm: data,
		operationVm: data,
		paneVm: data,
	})

	const actions = {
		handleFavoriteSelect: vi.fn(),
		openNewFolder: vi.fn(),
		openMoveSelection: vi.fn(),
		deleteMutation: { isPending: true },
		deletingKey: null,
		presignMutation: { isPending: true },
		presignKey: 'docs/report.pdf',
		openUploadPicker: vi.fn(),
		openRenameObject: vi.fn(),
		confirmDeleteSelected: vi.fn(),
		openDetailsForKey: vi.fn(),
		openDetails: vi.fn(),
		openCopyMove: vi.fn(),
		confirmDeleteObjects: vi.fn(),
	} as unknown as UseObjectsScreenCompositionArgs['actions']

	const previewState = {
		singleSelectedKey: 'docs/report.pdf',
		singleSelectedItem: { size: 512 },
		largePreviewOpen: true,
		openLargePreviewForKey,
		detailsThumbnail: { tag: 'thumb' },
		detailsPreviewThumbnail: { tag: 'preview-thumb' },
	} as unknown as UseObjectsScreenCompositionArgs['previewState']

	const viewportState = {
		virtualItemsForRender: [{ index: 0 }],
		totalSize: 480,
	} as unknown as UseObjectsScreenCompositionArgs['viewportState']

	listStateRef.current = {
		contextMenuClassName: 'menu',
		contextMenuRef: { current: null },
		contextMenuVisible: true,
		contextMenuProps: { items: [] },
		contextMenuStyle: { top: 12, left: 24 },
		normalizeDropTargetPrefix: vi.fn(),
		dndHoverPrefix: 'docs/',
		onDndTargetDragOver: vi.fn(),
		onDndTargetDragLeave: vi.fn(),
		onDndTargetDrop: vi.fn(),
		handleTreePrefixContextMenu: vi.fn(),
		breadcrumbItems: [{ title: 'bucket-a' }],
		hasActiveView: true,
		searchAutoScanCap: 2000,
		canInteract: true,
		showUploadDropOverlay: true,
		uploadDropLabel: 's3://bucket-a/docs/',
		onUploadDragEnter: vi.fn(),
		onUploadDragLeave: vi.fn(),
		onUploadDragOver: vi.fn(),
		onUploadDrop: vi.fn(),
		clearSelectionAction: { key: 'clear' },
		deleteSelectionAction: { key: 'delete' },
		downloadSelectionAction: { key: 'download' },
		moveSelectionAction: { key: 'move' },
		selectionMenuActions: [{ key: 'rename' }],
		getObjectActions: vi.fn(),
		listGridClassName: 'grid',
		sortDirForColumn: vi.fn(),
		toggleSortColumn: vi.fn(),
		listScrollerRef: { current: null },
		getListScrollerElement: vi.fn(),
		listKeydownHandler: vi.fn(),
		handleListScrollerScroll: vi.fn(),
		handleListScrollerWheel: vi.fn(),
		handleListScrollerContextMenu: vi.fn(),
		listIsFetching: false,
		listIsFetchingNextPage: false,
		canClearSearch: true,
		handleClearSearch: vi.fn(),
		renderPrefixRow: vi.fn(),
		renderObjectRow: vi.fn(),
		renderPrefixGridItem: vi.fn(),
		renderObjectGridItem: vi.fn(),
		showLoadMore: true,
		loadMoreLabel: 'Load more',
		loadMoreDisabled: false,
		handleLoadMore: vi.fn(),
		detailsKey: overrides?.detailsKey === undefined ? 'docs/report.pdf' : overrides.detailsKey,
		detailsMeta: { key: 'docs/report.pdf' },
		detailsMetaQuery: {
			isFetching: false,
			isError: false,
			error: null,
			refetch: vi.fn(),
		},
		refetchDetailsMeta: vi.fn(),
		onCopy: vi.fn(),
		onDownload: download,
		onPresign: presign,
		openCopyMove: vi.fn(),
		confirmDeleteObjects: vi.fn(),
		detailsDeleteLoading: false,
		preview: { kind: 'image', url: '/preview' },
		loadPreview: vi.fn(),
		cancelPreview: vi.fn(),
		canCancelPreview: true,
		commandPaletteOpen: true,
		commandPaletteQuery: 'rep',
		commandPaletteItems: [{ id: 'open' }],
		commandPaletteActiveIndex: 0,
		onCommandPaletteQueryChange: vi.fn(),
		setCommandPaletteActiveIndex: vi.fn(),
		runCommandPaletteItem: vi.fn(),
		closeCommandPalette: vi.fn(),
		onCommandPaletteKeyDown: vi.fn(),
		openGlobalSearchPrefix: vi.fn(),
		openGlobalSearchDetails: vi.fn(),
		globalActionMap: { refresh: { key: 'refresh' } },
		currentPrefixActionMap: { mkdir: { key: 'mkdir' } },
		closeContextMenu: vi.fn(),
	} as unknown as UseObjectsScreenListResult

	toolbarResultRef.current = {
		toolbarSectionProps: { tag: 'toolbar' },
		canCreateFolder: true,
		createFolderTooltipText: 'Create folder',
	} as unknown as UseObjectsScreenToolbarResult

	overlaysResultRef.current = {
		tag: 'overlays',
	} as unknown as UseObjectsScreenOverlaysResult

	panesResultRef.current = {
		tag: 'panes',
	} as unknown as BuildObjectsPagePanesPropsResult

	return {
		args: {
			props,
			data,
			locationVm: data,
			listVm: data,
			selectionVm: data,
			operationVm: data,
			paneVm: data,
			actions,
			previewState,
			viewportState,
			refresh,
		} as UseObjectsScreenCompositionTestArgs,
		openLargePreviewForKey,
		download,
		presign,
	}
}

describe('useObjectsScreenComposition', () => {
	beforeEach(() => {
		for (const ref of [
			listArgsRef,
			listStateRef,
			toolbarArgsRef,
			toolbarResultRef,
			overlaysArgsRef,
			overlaysResultRef,
			panesArgsRef,
			panesResultRef,
		]) {
			ref.current = null
		}
	})

	it('composes list, toolbar, overlays, and pane builder state', () => {
		const { args, openLargePreviewForKey, download, presign } =
			seedCompositionState()

		const { result } = renderHook(() => useObjectsScreenComposition(args))

		expect(readRef<UseObjectsScreenListArgs>(listArgsRef)).toEqual({
			props: args.props,
			locationVm: args.locationVm,
			listVm: args.listVm,
			selectionVm: args.selectionVm,
			operationVm: args.operationVm,
			paneVm: args.paneVm,
			actions: args.actions,
			previewState: args.previewState,
			viewportState: args.viewportState,
			refresh: args.refresh,
		})
		expect(readRef<UseObjectsScreenToolbarArgs>(toolbarArgsRef)).toEqual({
			props: args.props,
			locationVm: args.data.locationVm,
			listVm: args.data.listVm,
			selectionVm: args.data.selectionVm,
			operationVm: args.data.operationVm,
			paneVm: args.data.paneVm,
			actions: args.actions,
			refresh: args.refresh,
			listState: listStateRef.current,
		})
		expect(readRef<UseObjectsScreenOverlaysArgs>(overlaysArgsRef)).toEqual({
			props: args.props,
			locationVm: args.data.locationVm,
			listVm: args.data.listVm,
			selectionVm: args.data.selectionVm,
			operationVm: args.data.operationVm,
			paneVm: args.data.paneVm,
			actions: args.actions,
			listState: listStateRef.current,
		})

		const panesArgs = readRef<BuildObjectsPagePanesPropsArgs>(panesArgsRef)
		expect(panesArgs.profileId).toBe('profile-1')
		expect(panesArgs.bucket).toBe('bucket-a')
		expect(panesArgs.prefix).toBe('docs/')
		expect(panesArgs.layoutProps).toEqual({
			treeWidthPx: 280,
			treeHandleWidthPx: 12,
			detailsWidthPx: 360,
			detailsHandleWidthPx: 10,
			treeDocked: true,
			detailsDocked: true,
			detailsOpen: true,
		})
		expect(panesArgs.favoritesErrorMessage).toBe('favorites failed')
		expect(panesArgs.objectsErrorMessage).toBe('objects failed')
		expect(panesArgs.canCreateFolder).toBe(true)
		expect(panesArgs.createFolderTooltipText).toBe('Create folder')
		expect(panesArgs.detailsDrawerSuspended).toBe(true)
		expect(panesArgs.onDownload).toBe(download)
		expect(panesArgs.presignMutate).toBe(presign)

		act(() => {
			panesArgs.openLargePreview()
		})
		expect(openLargePreviewForKey).toHaveBeenCalledWith('docs/report.pdf')

		expect(result.current).toEqual({
			toolbarSectionProps: { tag: 'toolbar' },
			onDownload: download,
			onPresign: presign,
			overlaysProps: { tag: 'overlays' },
			panesProps: { tag: 'panes' },
		})
	})

	it('does not open a large preview when the detail key is absent', () => {
		const { args, openLargePreviewForKey } = seedCompositionState({
			detailsKey: null,
		})

		renderHook(() => useObjectsScreenComposition(args))
		const panesArgs = readRef<BuildObjectsPagePanesPropsArgs>(panesArgsRef)

		act(() => {
			panesArgs.openLargePreview()
		})

		expect(openLargePreviewForKey).not.toHaveBeenCalled()
	})
})
