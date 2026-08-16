import { useCallback, useEffect } from 'react'

import { buildObjectsScreenListViewState } from './buildObjectsScreenListViewState'
import { logObjectsDebug } from './objectsPageDebug'
import { useObjectsAutoScan } from './useObjectsAutoScan'
import { useObjectsListKeydownHandler } from './useObjectsListKeydownHandler'
import { useObjectsMarqueeSelection } from './useObjectsMarqueeSelection'
import type { ObjectsScreenArgs } from './objectsScreenTypes'
import { useObjectsScreenCommandPalette } from './useObjectsScreenCommandPalette'
import { useObjectsScreenListInteractions } from './useObjectsScreenListInteractions'
import { useObjectsSelectionBarActions } from './useObjectsSelectionBarActions'

function getKeyboardContextMenuPoint(scroller: HTMLElement | null, rowIndex: number | undefined) {
	const row = typeof rowIndex === 'number'
		? scroller?.querySelector<HTMLElement>(`[data-index="${rowIndex}"] [data-objects-row="true"]`)
		: null
	const anchor = row ?? scroller
	if (anchor) {
		const rect = anchor.getBoundingClientRect()
		const width = Math.max(0, rect.width)
		const height = Math.max(0, rect.height)
		const xOffset = width > 0
			? Math.min(Math.max(width / 2, 8), Math.max(width - 8, 8))
			: 8
		const yOffset = height > 0
			? Math.min(Math.max(height / 2, 8), Math.max(height - 8, 8))
			: 8
		return { x: rect.left + xOffset, y: rect.top + yOffset }
	}
	if (typeof window !== 'undefined') {
		return {
			x: Math.max(8, Math.round(window.innerWidth / 2)),
			y: Math.max(8, Math.round(window.innerHeight / 2)),
		}
	}
	return { x: 8, y: 8 }
}

export function useObjectsScreenList(args: ObjectsScreenArgs) {
	const {
		props,
		locationVm,
		listVm,
		selectionVm,
		operationVm,
		paneVm,
		actions,
		previewState,
		viewportState,
	} = args
	const {
		bucket,
		canGoUp,
		onUp,
		prefix,
	} = locationVm
	const {
		extFilter,
		favoritesOnly,
		isAdvanced,
		maxModifiedMs,
		maxSize,
		minModifiedMs,
		minSize,
		objectsQuery,
		orderedVisibleObjectKeys,
		rawTotalCount,
		rows,
		rowIndexByObjectKey,
		search,
		typeFilter,
		visibleObjectKeys,
	} = listVm
	const {
		clearSelection,
		lastSelectedObjectKey,
		selectAllLoaded,
		selectedCount,
		selectRange,
		setLastSelectedObjectKey,
		setSelectedKeys,
	} = selectionVm
	const {
		commandPaletteOpener,
		debugObjectsList,
	} = operationVm
	const {
		autoScanReady,
		setAutoScanReadyKey,
	} = paneVm
	const { rowVirtualizer, listScrollerEl, listScrollerRef, scrollContainerRef, virtualItems } = viewportState
	const { detailsKey, detailsMeta, detailsMetaQuery, preview, loadPreview, cancelPreview, canCancelPreview } = previewState
	const interactions = useObjectsScreenListInteractions({
		props,
		locationVm,
		listVm,
		selectionVm,
		operationVm,
		paneVm,
		actions,
		previewState,
		viewportState,
		refresh: args.refresh,
	})
	const closeContextMenu = interactions.closeContextMenu
	const handleMarqueeStart = useCallback(
		() => closeContextMenu(undefined, 'marquee_selection'),
		[closeContextMenu],
	)
	useObjectsMarqueeSelection({
		enabled: !!bucket,
		listElement: listScrollerEl,
		scrollContainerRef,
		setSelectedKeys,
		setLastSelectedObjectKey,
		onStart: handleMarqueeStart,
	})
	const viewState = buildObjectsScreenListViewState({
		props,
		locationVm,
		listVm,
		operationVm,
		paneVm,
		actions,
	})

	const { hasNextPage, isFetchingNextPage, fetchNextPage } = objectsQuery
	const { showLoadMore, loadMoreLabel, handleLoadMore, searchAutoScanCap } = useObjectsAutoScan({
		favoritesOnly,
		profileId: props.profileId,
		bucket,
		prefix,
		search,
		isAdvanced,
		extFilter,
		minSize,
		maxSize,
		minModifiedMs,
		maxModifiedMs,
		typeFilter,
		rawTotalCount,
		rowsLength: rows.length,
		virtualItems,
		autoScanReady,
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
		debugEnabled: debugObjectsList,
		log: logObjectsDebug,
	})

	useEffect(() => {
		if (!bucket) return
		const serverScope = props.apiToken || '__no_server__'
		const profileScope = props.profileId?.trim() || '__no_profile__'
		const key = `${serverScope}:${profileScope}:${bucket}|${prefix}`
		const id = window.setTimeout(() => setAutoScanReadyKey(key), 400)
		return () => window.clearTimeout(id)
	}, [bucket, prefix, props.apiToken, props.profileId, setAutoScanReadyKey])

	useEffect(() => {
		if (!bucket) return
		if (!objectsQuery.data) return
		if (objectsQuery.isFetching) return
		const serverScope = props.apiToken || '__no_server__'
		const profileScope = props.profileId?.trim() || '__no_profile__'
		const key = `${serverScope}:${profileScope}:${bucket}|${prefix}`
		const id = window.setTimeout(() => setAutoScanReadyKey(key), 0)
		return () => window.clearTimeout(id)
	}, [bucket, objectsQuery.data, objectsQuery.isFetching, prefix, props.apiToken, props.profileId, setAutoScanReadyKey])

	const {
		commandPaletteOpen,
		closeCommandPalette,
		commandPaletteQuery,
		commandPaletteActiveIndex,
		setCommandPaletteActiveIndex,
		commandPaletteItems,
		runCommandPaletteItem,
		onCommandPaletteQueryChange,
		onCommandPaletteKeyDown,
	} = useObjectsScreenCommandPalette({
		scopeKey: `${props.apiToken || '__no_server__'}:${props.profileId?.trim() || '__no_profile__'}:${bucket}:${prefix}`,
		commandItems: interactions.commandItems,
		commandPaletteOpener,
	})

	const { clearSelectionAction, deleteSelectionAction, downloadSelectionAction, moveSelectionAction } = useObjectsSelectionBarActions({
		selectionActionMap: interactions.selectionActionMap,
	})

	const openKeyboardContextMenu = useCallback(
		(key: string) => {
			const scroller = interactions.getListScrollerElement()
			const point = getKeyboardContextMenuPoint(scroller, rowIndexByObjectKey.get(key))
			interactions.openObjectContextMenu(key, 'context', point)
		},
		[interactions, rowIndexByObjectKey],
	)

	const listKeydownHandler = useObjectsListKeydownHandler({
		contextMenuOpen: interactions.contextMenuState.open,
		selectedCount,
		singleSelectedKey: previewState.singleSelectedKey,
		lastSelectedObjectKey,
		orderedVisibleObjectKeys,
		visibleObjectKeys,
		rowIndexByObjectKey,
		canGoUp,
		closeContextMenu: () => interactions.closeContextMenu(undefined, 'escape_keydown'),
		clearSelection,
		openRenameObject: actions.openRenameObject,
		openNewFolder: actions.openNewFolder,
		copySelectionToClipboard: interactions.copySelectionToClipboard,
		pasteClipboardObjects: interactions.pasteClipboardObjects,
		openDetailsForKey: actions.openDetailsForKey,
		openContextMenuForKey: openKeyboardContextMenu,
		onUp,
		confirmDeleteSelected: actions.confirmDeleteSelected,
		setSelectedKeys,
		setLastSelectedObjectKey,
		selectRange,
		selectAllLoaded,
		scrollToIndex: (index) => rowVirtualizer.scrollToIndex(index),
	})

	return {
		breadcrumbItems: interactions.breadcrumbItems,
		canClearSearch: viewState.canClearSearch,
		canInteract: viewState.canInteract,
		clearSelectionAction,
		commandPaletteActiveIndex,
		commandPaletteItems,
		commandPaletteOpen,
		commandPaletteQuery,
		contextMenuClassName: interactions.contextMenuClassName,
		contextMenuProps: interactions.contextMenuProps,
		contextMenuRef: interactions.contextMenuRef,
		contextMenuStyle: interactions.contextMenuStyle,
		contextMenuVisible: interactions.contextMenuVisible,
		currentPrefixActionMap: interactions.currentPrefixActionMap,
		deleteSelectionAction,
		dndHoverPrefix: interactions.dndHoverPrefix,
		downloadSelectionAction,
		moveSelectionAction,
		getListScrollerElement: interactions.getListScrollerElement,
		getObjectActions: interactions.getObjectActions,
		globalActionMap: interactions.globalActionMap,
		handleClearSearch: viewState.handleClearSearch,
		handleListScrollerContextMenu: interactions.handleListScrollerContextMenu,
		handleListScrollerScroll: interactions.handleListScrollerScroll,
		handleListScrollerWheel: interactions.handleListScrollerWheel,
		handleLoadMore,
		handleTreePrefixContextMenu: interactions.handleTreePrefixContextMenu,
		hasActiveView: viewState.hasActiveView,
		listGridClassName: interactions.listGridClassName,
		listIsFetching: viewState.listIsFetching,
		listIsFetchingNextPage: viewState.listIsFetchingNextPage,
		listKeydownHandler,
		listScrollerRef,
		loadMoreDisabled: viewState.loadMoreDisabled,
		loadMoreLabel,
		normalizeDropTargetPrefix: interactions.normalizeDropTargetPrefix,
		onCommandPaletteKeyDown,
		onCommandPaletteQueryChange,
		onCopy: interactions.onCopy,
		onDownload: interactions.onDownload,
		onPresign: interactions.onPresign,
		onDndTargetDragLeave: interactions.onDndTargetDragLeave,
		onDndTargetDragOver: interactions.onDndTargetDragOver,
		onDndTargetDrop: interactions.onDndTargetDrop,
		onUploadDragEnter: interactions.onUploadDragEnter,
		onUploadDragLeave: interactions.onUploadDragLeave,
		onUploadDragOver: interactions.onUploadDragOver,
		onUploadDrop: interactions.onUploadDrop,
		openGlobalSearchDetails: viewState.openGlobalSearchDetails,
		openGlobalSearchPrefix: viewState.openGlobalSearchPrefix,
		refetchDetailsMeta: detailsMetaQuery.refetch,
		renderObjectGridItem: interactions.renderObjectGridItem,
		renderObjectRow: interactions.renderObjectRow,
		renderParentGridItem: interactions.renderParentGridItem,
		renderParentRow: interactions.renderParentRow,
		renderPrefixGridItem: interactions.renderPrefixGridItem,
		renderPrefixRow: interactions.renderPrefixRow,
		resetFilters: viewState.resetFilters,
		runCommandPaletteItem,
		searchAutoScanCap,
		selectionMenuActions: interactions.selectionMenuActions,
		setCommandPaletteActiveIndex,
		showLoadMore,
		showUploadDropOverlay: interactions.showUploadDropOverlay,
		sortDirForColumn: viewState.sortDirForColumn,
		toggleSortColumn: viewState.toggleSortColumn,
		uploadDropLabel: viewState.uploadDropLabel,
		detailsMeta,
		detailsKey,
		detailsMetaQuery,
		preview,
		loadPreview,
		cancelPreview,
		canCancelPreview,
		closeCommandPalette,
		closeContextMenu: interactions.closeContextMenu,
		openDetails: actions.openDetails,
		openCopyMove: actions.openCopyMove,
		confirmDeleteObjects: actions.confirmDeleteObjects,
		detailsDeleteLoading: actions.deleteMutation.isPending && actions.deletingKey === detailsKey,
		presignPendingForKey: actions.presignMutation.isPending && actions.presignKey === detailsKey,
		detailsThumbnail: previewState.detailsThumbnail,
		detailsPreviewThumbnail: previewState.detailsPreviewThumbnail,
	}
}

export type ObjectsScreenListState = ReturnType<typeof useObjectsScreenList>
