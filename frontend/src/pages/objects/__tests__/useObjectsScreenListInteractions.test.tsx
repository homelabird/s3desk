import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useObjectsScreenListInteractions } from '../useObjectsScreenListInteractions'

type UseObjectsScreenListInteractionsArgs = Parameters<
	typeof import('../useObjectsScreenListInteractions').useObjectsScreenListInteractions
>[0]
type UseObjectDownloadsArgs = Parameters<typeof import('../useObjectDownloads').useObjectDownloads>[0]
type UseObjectsClipboardArgs = Parameters<typeof import('../useObjectsClipboard').useObjectsClipboard>[0]
type UseObjectsDndArgs = Parameters<typeof import('../useObjectsDnd').useObjectsDnd>[0]
type UseObjectsPageListInteractionsArgs = Parameters<
	typeof import('../useObjectsPageListInteractions').useObjectsPageListInteractions
>[0]
type UseObjectsGridRenderersArgs = Parameters<typeof import('../useObjectsGridRenderers').useObjectsGridRenderers>[0]
type UseObjectsBreadcrumbItemsArgs = Parameters<
	typeof import('../useObjectsBreadcrumbItems').useObjectsBreadcrumbItems
>[0]
type RefCell = {
	current: unknown | null
}

function readRef<T>(ref: RefCell): T {
	return ref.current as T
}

const {
	downloadsArgsRef,
	clipboardArgsRef,
	dndArgsRef,
	pageListArgsRef,
	gridArgsRef,
	breadcrumbArgsRef,
} = vi.hoisted(
	(): Record<string, RefCell> => ({
		downloadsArgsRef: { current: null },
		clipboardArgsRef: { current: null },
		dndArgsRef: { current: null },
		pageListArgsRef: { current: null },
		gridArgsRef: { current: null },
		breadcrumbArgsRef: { current: null },
	}),
)

const {
	onDownload,
	onDownloadToDevice,
	handleDownloadSelected,
	onCopy,
	copySelectionToClipboard,
	pasteClipboardObjects,
	onDndTargetDragOver,
	onDndTargetDragLeave,
	onDndTargetDrop,
	onRowDragStartObjects,
	onRowDragStartPrefix,
	clearDndHover,
	getObjectActions,
	getPrefixActions,
	closeContextMenu,
	renderPrefixRow,
	renderObjectRow,
	renderPrefixGridItem,
	renderObjectGridItem,
	handleTreePrefixContextMenu,
} = vi.hoisted(() => ({
	onDownload: vi.fn(),
	onDownloadToDevice: vi.fn(),
	handleDownloadSelected: vi.fn(),
	onCopy: vi.fn(),
	copySelectionToClipboard: vi.fn(),
	pasteClipboardObjects: vi.fn(),
	onDndTargetDragOver: vi.fn(),
	onDndTargetDragLeave: vi.fn(),
	onDndTargetDrop: vi.fn(),
	onRowDragStartObjects: vi.fn(),
	onRowDragStartPrefix: vi.fn(),
	clearDndHover: vi.fn(),
	getObjectActions: vi.fn(),
	getPrefixActions: vi.fn(),
	closeContextMenu: vi.fn(),
	renderPrefixRow: vi.fn(),
	renderObjectRow: vi.fn(),
	renderPrefixGridItem: vi.fn(),
	renderObjectGridItem: vi.fn(),
	handleTreePrefixContextMenu: vi.fn(),
}))

vi.mock('../useObjectDownloads', () => ({
	useObjectDownloads: (args: UseObjectDownloadsArgs) => {
		downloadsArgsRef.current = args
		return { onDownload, onDownloadToDevice, handleDownloadSelected }
	},
}))

vi.mock('../useObjectsClipboard', () => ({
	useObjectsClipboard: (args: UseObjectsClipboardArgs) => {
		clipboardArgsRef.current = args
		return {
			clipboardObjects: [{ key: 'copied.txt' }],
			onCopy,
			copySelectionToClipboard,
			pasteClipboardObjects,
		}
	},
}))

vi.mock('../useObjectsDnd', () => ({
	useObjectsDnd: (args: UseObjectsDndArgs) => {
		dndArgsRef.current = args
		return {
			dndHoverPrefix: 'docs/',
			normalizeDropTargetPrefix: vi.fn((prefix: string) => prefix),
			onDndTargetDragOver,
			onDndTargetDragLeave,
			onDndTargetDrop,
			onRowDragStartObjects,
			onRowDragStartPrefix,
			clearDndHover,
		}
	},
}))

vi.mock('../useObjectsPageListInteractions', () => ({
	useObjectsPageListInteractions: (args: UseObjectsPageListInteractionsArgs) => {
		pageListArgsRef.current = args
		return {
			getObjectActions,
			getPrefixActions,
			currentPrefixActionMap: { mkdir: { key: 'mkdir' } },
			selectionActionMap: { delete: { key: 'delete' } },
			selectionContextMenuActions: [{ key: 'delete' }],
			selectionMenuActions: [{ key: 'download' }],
			globalActionMap: { refresh: { key: 'refresh' } },
			commandItems: [{ id: 'open' }],
			closeContextMenu,
			contextMenuClassName: 'menu',
			contextMenuState: { open: true },
			contextMenuRef: { current: null },
			contextMenuVisible: true,
			contextMenuProps: { items: [] },
			contextMenuStyle: { top: 12, left: 24 },
			getListScrollerElement: vi.fn(),
			recordContextMenuPoint: vi.fn(),
			openPrefixContextMenu: vi.fn(),
			openObjectContextMenu: vi.fn(),
			withContextMenuClassName: vi.fn(),
			handleListScrollerContextMenu: vi.fn(),
			handleListScrollerScroll: vi.fn(),
			handleListScrollerWheel: vi.fn(),
			renderPrefixRow,
			renderObjectRow,
			handleTreePrefixContextMenu,
		}
	},
}))

vi.mock('../useObjectsGridRenderers', () => ({
	useObjectsGridRenderers: (args: UseObjectsGridRenderersArgs) => {
		gridArgsRef.current = args
		return { renderPrefixGridItem, renderObjectGridItem }
	},
}))

vi.mock('../useObjectsBreadcrumbItems', () => ({
	useObjectsBreadcrumbItems: (args: UseObjectsBreadcrumbItemsArgs) => {
		breadcrumbArgsRef.current = args
		return { breadcrumbItems: [{ title: 'bucket-a' }] }
	},
}))

function seedInteractionsState() {
	const refresh = vi.fn().mockResolvedValue(undefined)
	const objectByKey = new Map([['docs/report.pdf', { key: 'docs/report.pdf', size: 512, lastModified: '2026-01-01' }]])
	const selectedKeys = new Set(['docs/report.pdf'])
	const favoriteKeys = new Set(['docs/report.pdf'])
	const favoritePendingKeys = new Set(['docs/pending.pdf'])
	const goBack = vi.fn()
	const goForward = vi.fn()
	const onUp = vi.fn()
	const addTab = vi.fn()
	const closeTab = vi.fn()
	const clearSelection = vi.fn()
	const setTreeDrawerOpen = vi.fn()
	const openTransfers = vi.fn()
	const handleToggleUiMode = vi.fn()
	const zipObjectsMutate = vi.fn()
	const zipPrefixMutate = vi.fn()
	const presignMutate = vi.fn()

	const args = {
		props: {
			apiToken: 'token-a',
			profileId: 'profile-1',
		},
		locationVm: {
			activeTabId: 'tab-1',
			addTab,
			bucket: 'bucket-a',
			canGoBack: true,
			canGoForward: false,
			canGoUp: true,
			closeTab,
			goBack,
			goForward,
			navigateToLocation: vi.fn(),
			onOpenPrefix: vi.fn(),
			onUp,
			openPathModal: vi.fn(),
			prefix: 'docs/',
			tabs: [{ id: 'tab-1' }],
		},
		listVm: {
			favoriteKeys,
			favoritePendingKeys,
			highlightText: vi.fn(),
			isAdvanced: true,
			isCompactList: false,
			showThumbnails: true,
		},
		selectionVm: {
			clearSelection,
			ensureObjectSelectedForContextMenu: vi.fn(),
			selectObjectFromCheckboxEvent: vi.fn(),
			selectObjectFromPointerEvent: vi.fn(),
			selectedCount: 1,
			selectedKeys,
			setLastSelectedObjectKey: vi.fn(),
			setSelectedKeys: vi.fn(),
		},
		operationVm: {
			api: { tag: 'api' },
			commandPaletteOpener: { open: vi.fn() },
			createJobWithRetry: vi.fn(),
			debugContextMenu: true,
			isOffline: false,
			objectCrudSupported: true,
			profileCapabilities: { presignedUpload: true },
			queryClient: { tag: 'query-client' },
			selectedProfileProvider: 'aws_s3',
			thumbnailCache: { tag: 'thumbnail-cache' },
			toggleFavorite: vi.fn(),
			transfers: {
				openTransfers,
			},
			uploadSupported: true,
			zipObjectsJobMutation: { mutate: zipObjectsMutate },
			zipPrefixJobMutation: { mutate: zipPrefixMutate },
		},
		paneVm: {
			canDragDrop: true,
			detailsVisible: true,
			handleToggleUiMode,
			isDesktop: true,
			openGlobalSearch: vi.fn(),
			screens: { md: true },
			setTreeDrawerOpen,
		},
		actions: {
			openDetailsForKey: vi.fn(),
			openRenameObject: vi.fn(),
			openRenamePrefix: vi.fn(),
			presignMutation: { mutate: presignMutate },
			openCopyMove: vi.fn(),
			openCopyPrefix: vi.fn(),
			openNewFolder: vi.fn(),
			openDownloadPrefix: vi.fn(),
			uploadDropActive: true,
			onUploadDragEnter: vi.fn(),
			onUploadDragLeave: vi.fn(),
			onUploadDragOver: vi.fn(),
			onUploadDrop: vi.fn(),
			confirmDeleteObjects: vi.fn(),
			confirmDeleteSelected: vi.fn(),
			confirmDeletePrefixAsJob: vi.fn(),
			openUploadPicker: vi.fn(),
			toggleDetails: vi.fn(),
			openMoveSelection: vi.fn(),
		},
		previewState: {
			objectByKey,
			singleSelectedKey: 'docs/report.pdf',
			singleSelectedItem: { size: 512 },
			openLargePreviewForKey: vi.fn(),
		},
		viewportState: {
			listScrollerEl: document.createElement('div'),
			scrollContainerRef: { current: null },
			measureElement: vi.fn(),
		},
		refresh,
	} as unknown as UseObjectsScreenListInteractionsArgs

	return {
		args,
		refs: {
			goBack,
			goForward,
			onUp,
			addTab,
			closeTab,
			clearSelection,
			setTreeDrawerOpen,
			openTransfers,
			handleToggleUiMode,
			zipObjectsMutate,
			zipPrefixMutate,
			presignMutate,
			refresh,
		},
	}
}

describe('useObjectsScreenListInteractions', () => {
	beforeEach(() => {
		for (const ref of [downloadsArgsRef, clipboardArgsRef, dndArgsRef, pageListArgsRef, gridArgsRef, breadcrumbArgsRef]) {
			ref.current = null
		}
		vi.clearAllMocks()
	})

	it('maps slice view-models into download, clipboard, dnd, action, row, grid, and breadcrumb hooks', () => {
		const { args, refs } = seedInteractionsState()

		const { result } = renderHook(() => useObjectsScreenListInteractions(args))

		expect(readRef<UseObjectDownloadsArgs>(downloadsArgsRef)).toMatchObject({
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'docs/',
			selectedKeys: new Set(['docs/report.pdf']),
			selectedCount: 1,
			objectByKey: args.previewState.objectByKey,
			transfers: args.operationVm.transfers,
		})
		readRef<UseObjectDownloadsArgs>(downloadsArgsRef).onZipObjects(['docs/report.pdf'])
		expect(refs.zipObjectsMutate).toHaveBeenCalledWith({ keys: ['docs/report.pdf'] })

		expect(readRef<UseObjectsClipboardArgs>(clipboardArgsRef)).toMatchObject({
			profileId: 'profile-1',
			apiToken: 'token-a',
			bucket: 'bucket-a',
			prefix: 'docs/',
			selectedKeys: new Set(['docs/report.pdf']),
			createJobWithRetry: args.operationVm.createJobWithRetry,
			queryClient: args.operationVm.queryClient,
		})

		expect(readRef<UseObjectsDndArgs>(dndArgsRef)).toMatchObject({
			profileId: 'profile-1',
			apiToken: 'token-a',
			bucket: 'bucket-a',
			prefix: 'docs/',
			canDragDrop: true,
			isDesktop: true,
			selectedKeys: new Set(['docs/report.pdf']),
			createJobWithRetry: args.operationVm.createJobWithRetry,
			queryClient: args.operationVm.queryClient,
		})

		const pageListArgs = readRef<UseObjectsPageListInteractionsArgs>(pageListArgsRef)
		expect(pageListArgs.actionCatalog).toMatchObject({
			isAdvanced: true,
			isOffline: false,
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'docs/',
			objectCrudSupported: true,
			presignedDownloadSupported: true,
			uploadSupported: true,
			selectedCount: 1,
			singleSelectedKey: 'docs/report.pdf',
			singleSelectedItemSize: 512,
			canGoBack: true,
			canGoForward: false,
			canGoUp: true,
			detailsVisible: true,
			activeTabId: 'tab-1',
			tabsCount: 1,
		})
		pageListArgs.actionCatalog.onGoBack()
		pageListArgs.actionCatalog.onGoForward()
		pageListArgs.actionCatalog.onGoUp()
		pageListArgs.actionCatalog.onZipPrefix('docs/nested/')
		pageListArgs.actionCatalog.onClearSelection()
		pageListArgs.actionCatalog.onOpenTreeDrawer()
		pageListArgs.actionCatalog.onRefresh()
		pageListArgs.actionCatalog.onOpenTransfers()
		pageListArgs.actionCatalog.onAddTab()
		pageListArgs.actionCatalog.onCloseTab('tab-1')
		pageListArgs.actionCatalog.onToggleUiMode()
		expect(refs.goBack).toHaveBeenCalledTimes(1)
		expect(refs.goForward).toHaveBeenCalledTimes(1)
		expect(refs.onUp).toHaveBeenCalledTimes(1)
		expect(refs.zipPrefixMutate).toHaveBeenCalledWith({ prefix: 'docs/nested/' })
		expect(refs.clearSelection).toHaveBeenCalledTimes(1)
		expect(refs.setTreeDrawerOpen).toHaveBeenCalledWith(true)
		expect(refs.refresh).toHaveBeenCalledTimes(1)
		expect(refs.openTransfers).toHaveBeenCalledTimes(1)
		expect(refs.addTab).toHaveBeenCalledTimes(1)
		expect(refs.closeTab).toHaveBeenCalledWith('tab-1')
		expect(refs.handleToggleUiMode).toHaveBeenCalledTimes(1)

		expect(pageListArgs.contextMenu).toMatchObject({
			scopeKey: 'token-a:profile-1:bucket-a:docs/',
			debugEnabled: true,
			selectedCount: 1,
			objectByKey: args.previewState.objectByKey,
			selectedKeys: new Set(['docs/report.pdf']),
			isAdvanced: true,
			ensureObjectSelected: args.selectionVm.ensureObjectSelectedForContextMenu,
		})
		expect(pageListArgs.rowRenderers).toMatchObject({
			api: args.operationVm.api,
			apiToken: 'token-a',
			profileId: 'profile-1',
			profileProvider: 'aws_s3',
			bucket: 'bucket-a',
			prefix: 'docs/',
			canDragDrop: true,
			isCompactList: false,
			isAdvanced: true,
			isOffline: false,
			objectCrudSupported: true,
			showThumbnails: true,
			thumbnailCache: args.operationVm.thumbnailCache,
			favoriteKeys: args.listVm.favoriteKeys,
			favoritePendingKeys: args.listVm.favoritePendingKeys,
			toggleFavorite: args.operationVm.toggleFavorite,
		})

		expect(readRef<UseObjectsGridRenderersArgs>(gridArgsRef)).toMatchObject({
			api: args.operationVm.api,
			profileProvider: 'aws_s3',
			bucket: 'bucket-a',
			prefix: 'docs/',
			canDragDrop: true,
			isAdvanced: true,
			isOffline: false,
			objectCrudSupported: true,
			showThumbnails: true,
			thumbnailCache: args.operationVm.thumbnailCache,
			selectedCount: 1,
			selectedKeys: new Set(['docs/report.pdf']),
			favoriteKeys: args.listVm.favoriteKeys,
			favoritePendingKeys: args.listVm.favoritePendingKeys,
			toggleFavorite: args.operationVm.toggleFavorite,
		})

		expect(readRef<UseObjectsBreadcrumbItemsArgs>(breadcrumbArgsRef)).toMatchObject({
			scopeKey: 'token-a:profile-1:bucket-a:docs/',
			bucket: 'bucket-a',
			prefix: 'docs/',
			isMd: true,
			canDragDrop: true,
			navigateToLocation: args.locationVm.navigateToLocation,
		})

		result.current.onPresign('docs/report.pdf')
		expect(refs.presignMutate).toHaveBeenCalledWith({
			key: 'docs/report.pdf',
			size: 512,
			lastModified: '2026-01-01',
		})
		expect(result.current).toMatchObject({
			breadcrumbItems: [{ title: 'bucket-a' }],
			commandItems: [{ id: 'open' }],
			currentPrefixActionMap: { mkdir: { key: 'mkdir' } },
			globalActionMap: { refresh: { key: 'refresh' } },
			listGridClassName: expect.any(String),
			onCopy,
			onDownload,
			renderObjectGridItem,
			renderObjectRow,
			renderPrefixGridItem,
			renderPrefixRow,
			selectionActionMap: { delete: { key: 'delete' } },
			selectionMenuActions: [{ key: 'download' }],
			showUploadDropOverlay: true,
		})
	})
})
