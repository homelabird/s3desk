import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useObjectsScreenList } from '../useObjectsScreenList'

type UseObjectsScreenListArgs = Parameters<
	typeof import('../useObjectsScreenList').useObjectsScreenList
>[0]
type UseObjectsScreenListTestData =
	& UseObjectsScreenListArgs['locationVm']
	& UseObjectsScreenListArgs['listVm']
	& UseObjectsScreenListArgs['selectionVm']
	& UseObjectsScreenListArgs['operationVm']
	& UseObjectsScreenListArgs['paneVm']
	& {
		locationVm: UseObjectsScreenListArgs['locationVm']
		listVm: UseObjectsScreenListArgs['listVm']
		selectionVm: UseObjectsScreenListArgs['selectionVm']
		operationVm: UseObjectsScreenListArgs['operationVm']
		paneVm: UseObjectsScreenListArgs['paneVm']
	}
type UseObjectsScreenListTestArgs = UseObjectsScreenListArgs & { data: UseObjectsScreenListTestData }
type UseObjectsScreenListInteractionsArgs = Parameters<
	typeof import('../useObjectsScreenListInteractions').useObjectsScreenListInteractions
>[0]
type UseObjectsScreenListInteractionsResult = ReturnType<
	typeof import('../useObjectsScreenListInteractions').useObjectsScreenListInteractions
>
type BuildObjectsScreenListViewStateArgs = Parameters<
	typeof import('../buildObjectsScreenListViewState').buildObjectsScreenListViewState
>[0]
type BuildObjectsScreenListViewStateResult = ReturnType<
	typeof import('../buildObjectsScreenListViewState').buildObjectsScreenListViewState
>
type UseObjectsAutoScanArgs = Parameters<
	typeof import('../useObjectsAutoScan').useObjectsAutoScan
>[0]
type UseObjectsAutoScanResult = ReturnType<
	typeof import('../useObjectsAutoScan').useObjectsAutoScan
>
type UseObjectsScreenCommandPaletteArgs = Parameters<
	typeof import('../useObjectsScreenCommandPalette').useObjectsScreenCommandPalette
>[0]
type UseObjectsScreenCommandPaletteResult = ReturnType<
	typeof import('../useObjectsScreenCommandPalette').useObjectsScreenCommandPalette
>
type UseObjectsSelectionBarActionsArgs = Parameters<
	typeof import('../useObjectsSelectionBarActions').useObjectsSelectionBarActions
>[0]
type UseObjectsSelectionBarActionsResult = ReturnType<
	typeof import('../useObjectsSelectionBarActions').useObjectsSelectionBarActions
>
type UseObjectsListKeydownHandlerArgs = Parameters<
	typeof import('../useObjectsListKeydownHandler').useObjectsListKeydownHandler
>[0]
type UseObjectsListKeydownHandlerResult = ReturnType<
	typeof import('../useObjectsListKeydownHandler').useObjectsListKeydownHandler
>
type RefCell = {
	current: unknown | null
}

function readRef<T>(ref: RefCell): T {
	return ref.current as T
}

const {
	interactionsArgsRef,
	interactionsResultRef,
	viewStateArgsRef,
	viewStateResultRef,
	autoScanArgsRef,
	autoScanResultRef,
	commandPaletteArgsRef,
	commandPaletteResultRef,
	selectionBarArgsRef,
	selectionBarResultRef,
	keydownArgsRef,
	keydownResultRef,
} = vi.hoisted(
	(): Record<string, RefCell> => ({
		interactionsArgsRef: { current: null },
		interactionsResultRef: { current: null },
		viewStateArgsRef: { current: null },
		viewStateResultRef: { current: null },
		autoScanArgsRef: { current: null },
		autoScanResultRef: { current: null },
		commandPaletteArgsRef: { current: null },
		commandPaletteResultRef: { current: null },
		selectionBarArgsRef: { current: null },
		selectionBarResultRef: { current: null },
		keydownArgsRef: { current: null },
		keydownResultRef: { current: null },
	}),
)

vi.mock('../useObjectsScreenListInteractions', () => ({
	useObjectsScreenListInteractions: (args: UseObjectsScreenListInteractionsArgs) => {
		interactionsArgsRef.current = args
		return readRef<UseObjectsScreenListInteractionsResult>(interactionsResultRef)
	},
}))

vi.mock('../buildObjectsScreenListViewState', () => ({
	buildObjectsScreenListViewState: (args: BuildObjectsScreenListViewStateArgs) => {
		viewStateArgsRef.current = args
		return readRef<BuildObjectsScreenListViewStateResult>(viewStateResultRef)
	},
}))

vi.mock('../useObjectsAutoScan', () => ({
	useObjectsAutoScan: (args: UseObjectsAutoScanArgs) => {
		autoScanArgsRef.current = args
		return readRef<UseObjectsAutoScanResult>(autoScanResultRef)
	},
}))

vi.mock('../useObjectsScreenCommandPalette', () => ({
	useObjectsScreenCommandPalette: (args: UseObjectsScreenCommandPaletteArgs) => {
		commandPaletteArgsRef.current = args
		return readRef<UseObjectsScreenCommandPaletteResult>(commandPaletteResultRef)
	},
}))

vi.mock('../useObjectsSelectionBarActions', () => ({
	useObjectsSelectionBarActions: (args: UseObjectsSelectionBarActionsArgs) => {
		selectionBarArgsRef.current = args
		return readRef<UseObjectsSelectionBarActionsResult>(selectionBarResultRef)
	},
}))

vi.mock('../useObjectsListKeydownHandler', () => ({
	useObjectsListKeydownHandler: (args: UseObjectsListKeydownHandlerArgs) => {
		keydownArgsRef.current = args
		return readRef<UseObjectsListKeydownHandlerResult>(keydownResultRef)
	},
}))

function seedScreenListState(overrides?: { bucket?: string; objectsFetching?: boolean }) {
	const fetchNextPage = vi.fn().mockResolvedValue(undefined)
	const setAutoScanReadyKey = vi.fn()
	const setSelectedKeys = vi.fn()
	const setLastSelectedObjectKey = vi.fn()
	const closeContextMenu = vi.fn()
	const getListScrollerElement = vi.fn()
	const openObjectContextMenu = vi.fn()
	const rowVirtualizerScrollToIndex = vi.fn()

	const args = {
		props: {
			apiToken: 'token-a',
			profileId: 'profile-1',
		},
		data: {
			autoScanReady: true,
			bucket: overrides?.bucket ?? 'bucket-a',
			canGoUp: true,
			clearSelection: vi.fn(),
			commandPaletteOpener: vi.fn(),
			debugObjectsList: true,
			extFilter: 'pdf',
			favoritesOnly: false,
			isAdvanced: true,
			lastSelectedObjectKey: 'docs/report.pdf',
			maxModifiedMs: 200,
			maxSize: 1000,
			minModifiedMs: 100,
			minSize: 10,
			objectsQuery: {
				hasNextPage: true,
				isFetchingNextPage: false,
				fetchNextPage,
				data: { pages: [{ items: [] }] },
				isFetching: overrides?.objectsFetching ?? false,
			},
			prefix: 'docs/',
			rawTotalCount: 42,
			rows: [{ key: 'docs/report.pdf' }],
			rowIndexByObjectKey: new Map([['docs/report.pdf', 0]]),
			search: 'report',
			selectAllLoaded: vi.fn(),
			selectedCount: 1,
			selectRange: vi.fn(),
			setAutoScanReadyKey,
			setLastSelectedObjectKey,
			setSelectedKeys,
			typeFilter: 'all',
			visibleObjectKeys: ['docs/report.pdf'],
			orderedVisibleObjectKeys: ['docs/report.pdf'],
			onUp: vi.fn(),
		},
		actions: {
			openRenameObject: vi.fn(),
			openNewFolder: vi.fn(),
			openDetailsForKey: vi.fn(),
			confirmDeleteSelected: vi.fn(),
			openDetails: vi.fn(),
			openCopyMove: vi.fn(),
			confirmDeleteObjects: vi.fn(),
			deleteMutation: { isPending: true },
			deletingKey: 'docs/report.pdf',
			presignMutation: { isPending: true },
			presignKey: 'docs/report.pdf',
		},
		previewState: {
			detailsKey: 'docs/report.pdf',
			detailsMeta: { key: 'docs/report.pdf' },
			detailsMetaQuery: {
				refetch: vi.fn(),
				isFetching: false,
				isError: false,
				error: null,
			},
			preview: { kind: 'image' },
			loadPreview: vi.fn(),
			cancelPreview: vi.fn(),
			canCancelPreview: true,
			singleSelectedKey: 'docs/report.pdf',
			detailsThumbnail: { tag: 'thumb' },
			detailsPreviewThumbnail: { tag: 'preview-thumb' },
		},
		viewportState: {
			rowVirtualizer: {
				scrollToIndex: rowVirtualizerScrollToIndex,
			},
			listScrollerRef: { current: null },
			virtualItems: [{ index: 0 }],
		},
	} as unknown as UseObjectsScreenListTestArgs
	Object.assign(args.data, {
		locationVm: args.data,
		listVm: args.data,
		selectionVm: args.data,
		operationVm: args.data,
		paneVm: args.data,
	})
	Object.assign(args, {
		locationVm: args.data,
		listVm: args.data,
		selectionVm: args.data,
		operationVm: args.data,
		paneVm: args.data,
	})

	interactionsResultRef.current = {
		commandItems: [{ id: 'open' }],
		selectionActionMap: { delete: { key: 'delete' } },
		contextMenuState: { open: true },
		closeContextMenu,
		copySelectionToClipboard: vi.fn(),
		pasteClipboardObjects: vi.fn(),
		breadcrumbItems: [{ title: 'bucket-a' }],
		contextMenuClassName: 'menu',
		contextMenuProps: { items: [] },
		contextMenuRef: { current: null },
		contextMenuStyle: { top: 10, left: 20 },
		contextMenuVisible: true,
		currentPrefixActionMap: { mkdir: { key: 'mkdir' } },
		dndHoverPrefix: 'docs/',
		getListScrollerElement,
		getObjectActions: vi.fn(),
		globalActionMap: { refresh: { key: 'refresh' } },
		handleListScrollerContextMenu: vi.fn(),
		handleListScrollerScroll: vi.fn(),
		handleListScrollerWheel: vi.fn(),
		handleTreePrefixContextMenu: vi.fn(),
		listGridClassName: 'grid',
		normalizeDropTargetPrefix: vi.fn(),
		openObjectContextMenu,
		onCopy: vi.fn(),
		onDownload: vi.fn(),
		onPresign: vi.fn(),
		onDndTargetDragLeave: vi.fn(),
		onDndTargetDragOver: vi.fn(),
		onDndTargetDrop: vi.fn(),
		onUploadDragEnter: vi.fn(),
		onUploadDragLeave: vi.fn(),
		onUploadDragOver: vi.fn(),
		onUploadDrop: vi.fn(),
		renderObjectGridItem: vi.fn(),
		renderObjectRow: vi.fn(),
		renderPrefixGridItem: vi.fn(),
		renderPrefixRow: vi.fn(),
		selectionMenuActions: [{ key: 'rename' }],
		showUploadDropOverlay: true,
	} as unknown as UseObjectsScreenListInteractionsResult

	viewStateResultRef.current = {
		canClearSearch: true,
		canInteract: true,
		handleClearSearch: vi.fn(),
		hasActiveView: true,
		listIsFetching: false,
		listIsFetchingNextPage: false,
		loadMoreDisabled: false,
		openGlobalSearchDetails: vi.fn(),
		openGlobalSearchPrefix: vi.fn(),
		resetFilters: vi.fn(),
		sortDirForColumn: vi.fn(),
		toggleSortColumn: vi.fn(),
		uploadDropLabel: 's3://bucket-a/docs/',
	} as unknown as BuildObjectsScreenListViewStateResult

	autoScanResultRef.current = {
		showLoadMore: true,
		loadMoreLabel: 'Load more results',
		handleLoadMore: vi.fn(),
		searchAutoScanCap: 3000,
	} as UseObjectsAutoScanResult

	commandPaletteResultRef.current = {
		commandPaletteOpen: true,
		closeCommandPalette: vi.fn(),
		commandPaletteQuery: 'rep',
		commandPaletteActiveIndex: 0,
		setCommandPaletteActiveIndex: vi.fn(),
		commandPaletteItems: [{ id: 'open' }],
		runCommandPaletteItem: vi.fn(),
		onCommandPaletteQueryChange: vi.fn(),
		onCommandPaletteKeyDown: vi.fn(),
	} as unknown as UseObjectsScreenCommandPaletteResult

	selectionBarResultRef.current = {
		clearSelectionAction: { key: 'clear' },
		deleteSelectionAction: { key: 'delete' },
		downloadSelectionAction: { key: 'download' },
		moveSelectionAction: { key: 'move' },
	} as unknown as UseObjectsSelectionBarActionsResult

	keydownResultRef.current = vi.fn() as unknown as UseObjectsListKeydownHandlerResult

	return {
		args,
		setAutoScanReadyKey,
		closeContextMenu,
		getListScrollerElement,
		openObjectContextMenu,
		rowVirtualizerScrollToIndex,
	}
}

describe('useObjectsScreenList', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		for (const ref of [
			interactionsArgsRef,
			interactionsResultRef,
			viewStateArgsRef,
			viewStateResultRef,
			autoScanArgsRef,
			autoScanResultRef,
			commandPaletteArgsRef,
			commandPaletteResultRef,
			selectionBarArgsRef,
			selectionBarResultRef,
			keydownArgsRef,
			keydownResultRef,
		]) {
			ref.current = null
		}
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('composes interaction, auto-scan, command palette, selection bar, and keydown state', () => {
		const { args, closeContextMenu, getListScrollerElement, openObjectContextMenu, rowVirtualizerScrollToIndex } =
			seedScreenListState()

		const { result } = renderHook(() => useObjectsScreenList(args))

		expect(readRef<UseObjectsScreenListInteractionsArgs>(interactionsArgsRef)).toEqual({
			props: args.props,
			locationVm: args.data.locationVm,
			listVm: args.data.listVm,
			selectionVm: args.data.selectionVm,
			operationVm: args.data.operationVm,
			paneVm: args.data.paneVm,
			actions: args.actions,
			previewState: args.previewState,
			viewportState: args.viewportState,
			refresh: args.refresh,
		})
		expect(
			readRef<BuildObjectsScreenListViewStateArgs>(viewStateArgsRef),
		).toEqual({
			props: args.props,
			locationVm: args.data.locationVm,
			listVm: args.data.listVm,
			operationVm: args.data.operationVm,
			paneVm: args.data.paneVm,
			actions: args.actions,
		})
		expect(readRef<UseObjectsAutoScanArgs>(autoScanArgsRef)).toMatchObject({
			favoritesOnly: false,
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'docs/',
			search: 'report',
			isAdvanced: true,
			extFilter: 'pdf',
			minSize: 10,
			maxSize: 1000,
			minModifiedMs: 100,
			maxModifiedMs: 200,
			typeFilter: 'all',
			rawTotalCount: 42,
			rowsLength: 1,
			virtualItems: [{ index: 0 }],
			autoScanReady: true,
			hasNextPage: true,
			isFetchingNextPage: false,
			fetchNextPage: args.data.objectsQuery.fetchNextPage,
			debugEnabled: true,
		})
		expect(
			readRef<UseObjectsScreenCommandPaletteArgs>(commandPaletteArgsRef),
		).toEqual({
			scopeKey: 'token-a:profile-1:bucket-a:docs/',
			commandItems: [{ id: 'open' }],
			commandPaletteOpener: args.data.commandPaletteOpener,
		})
		expect(
			readRef<UseObjectsSelectionBarActionsArgs>(selectionBarArgsRef),
		).toEqual({
			selectionActionMap: { delete: { key: 'delete' } },
		})

		const keydownArgs = readRef<UseObjectsListKeydownHandlerArgs>(keydownArgsRef)
		expect(keydownArgs).toMatchObject({
			contextMenuOpen: true,
			selectedCount: 1,
			singleSelectedKey: 'docs/report.pdf',
			lastSelectedObjectKey: 'docs/report.pdf',
			orderedVisibleObjectKeys: ['docs/report.pdf'],
			visibleObjectKeys: ['docs/report.pdf'],
			rowIndexByObjectKey: new Map([['docs/report.pdf', 0]]),
			canGoUp: true,
			clearSelection: args.data.clearSelection,
			openRenameObject: args.actions.openRenameObject,
			openNewFolder: args.actions.openNewFolder,
			openDetailsForKey: args.actions.openDetailsForKey,
			onUp: args.data.onUp,
			confirmDeleteSelected: args.actions.confirmDeleteSelected,
			setSelectedKeys: args.data.setSelectedKeys,
			setLastSelectedObjectKey: args.data.setLastSelectedObjectKey,
			selectRange: args.data.selectRange,
			selectAllLoaded: args.data.selectAllLoaded,
			openContextMenuForKey: expect.any(Function),
		})

		const scroller = document.createElement('div')
		const shell = document.createElement('div')
		shell.dataset.index = '0'
		const row = document.createElement('div')
		row.dataset.objectsRow = 'true'
		shell.appendChild(row)
		scroller.appendChild(shell)
		vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
			x: 100,
			y: 40,
			left: 100,
			top: 40,
			right: 300,
			bottom: 72,
			width: 200,
			height: 32,
			toJSON: () => ({}),
		} as DOMRect)
		getListScrollerElement.mockReturnValue(scroller)

		act(() => {
			keydownArgs.openContextMenuForKey?.('docs/report.pdf')
			keydownArgs.closeContextMenu!()
			keydownArgs.scrollToIndex!(7)
		})
		expect(openObjectContextMenu).toHaveBeenCalledWith(
			'docs/report.pdf',
			'context',
			{ x: 200, y: 56 },
		)
		expect(closeContextMenu).toHaveBeenCalledWith(undefined, 'escape_keydown')
		expect(rowVirtualizerScrollToIndex).toHaveBeenCalledWith(7)

		act(() => {
			vi.advanceTimersByTime(0)
		})
		expect(args.data.setAutoScanReadyKey).toHaveBeenCalledWith(
			'token-a:profile-1:bucket-a|docs/',
		)

		act(() => {
			vi.advanceTimersByTime(400)
		})
		expect(args.data.setAutoScanReadyKey).toHaveBeenCalledTimes(2)

		expect(result.current).toMatchObject({
			breadcrumbItems: [{ title: 'bucket-a' }],
			canClearSearch: true,
			canInteract: true,
			clearSelectionAction: { key: 'clear' },
			commandPaletteActiveIndex: 0,
			commandPaletteItems: [{ id: 'open' }],
			commandPaletteOpen: true,
			commandPaletteQuery: 'rep',
			contextMenuClassName: 'menu',
			contextMenuProps: { items: [] },
			contextMenuVisible: true,
			currentPrefixActionMap: { mkdir: { key: 'mkdir' } },
			deleteSelectionAction: { key: 'delete' },
			downloadSelectionAction: { key: 'download' },
			moveSelectionAction: { key: 'move' },
			handleLoadMore: readRef<UseObjectsAutoScanResult>(autoScanResultRef).handleLoadMore,
			hasActiveView: true,
			listGridClassName: 'grid',
			listIsFetching: false,
			listIsFetchingNextPage: false,
			loadMoreDisabled: false,
			loadMoreLabel: 'Load more results',
			searchAutoScanCap: 3000,
			showLoadMore: true,
			uploadDropLabel: 's3://bucket-a/docs/',
			detailsKey: 'docs/report.pdf',
			detailsDeleteLoading: true,
			presignPendingForKey: true,
			detailsThumbnail: { tag: 'thumb' },
			detailsPreviewThumbnail: { tag: 'preview-thumb' },
		})
	})

	it('skips auto-scan readiness timers when there is no active bucket', () => {
		const { args } = seedScreenListState({ bucket: '' })

		renderHook(() => useObjectsScreenList(args))

		act(() => {
			vi.runAllTimers()
		})

		expect(args.data.setAutoScanReadyKey).not.toHaveBeenCalled()
	})
})
