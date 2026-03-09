import { useEffect } from 'react'

import { buildObjectsScreenListViewState } from './buildObjectsScreenListViewState'
import { logObjectsDebug } from './objectsPageDebug'
import { useObjectsAutoScan } from './useObjectsAutoScan'
import { useObjectsListKeydownHandler } from './useObjectsListKeydownHandler'
import type { ObjectsScreenArgs } from './objectsScreenTypes'
import { useObjectsScreenCommandPalette } from './useObjectsScreenCommandPalette'
import { useObjectsScreenListInteractions } from './useObjectsScreenListInteractions'
import { useObjectsSelectionBarActions } from './useObjectsSelectionBarActions'

export function useObjectsScreenList(args: ObjectsScreenArgs) {
	const { props, data, actions, previewState, viewportState } = args
	const {
		autoScanReady,
		bucket,
		canGoUp,
		clearSelection,
		commandPaletteOpener,
		debugObjectsList,
		extFilter,
		favoritesOnly,
		isAdvanced,
		lastSelectedObjectKey,
		maxModifiedMs,
		maxSize,
		minModifiedMs,
		minSize,
		objectsQuery,
		prefix,
		rawTotalCount,
		rows,
		rowIndexByObjectKey,
		search,
		selectAllLoaded,
		selectedCount,
		selectRange,
		setAutoScanReadyKey,
		setLastSelectedObjectKey,
		setSelectedKeys,
		typeFilter,
		visibleObjectKeys,
	} = data
	const { rowVirtualizer, listScrollerRef, virtualItems } = viewportState
	const { detailsKey, detailsMeta, detailsMetaQuery, preview, loadPreview, cancelPreview, canCancelPreview } = previewState
	const interactions = useObjectsScreenListInteractions(args)
	const viewState = buildObjectsScreenListViewState(args)

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
		const key = `${bucket}|${prefix}`
		const id = window.setTimeout(() => setAutoScanReadyKey(key), 400)
		return () => window.clearTimeout(id)
	}, [bucket, prefix, setAutoScanReadyKey])

	useEffect(() => {
		if (!bucket) return
		if (!objectsQuery.data) return
		if (objectsQuery.isFetching) return
		const key = `${bucket}|${prefix}`
		const id = window.setTimeout(() => setAutoScanReadyKey(key), 0)
		return () => window.clearTimeout(id)
	}, [bucket, objectsQuery.data, objectsQuery.isFetching, prefix, setAutoScanReadyKey])

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
		commandItems: interactions.commandItems,
		commandPaletteOpener,
	})

	const { clearSelectionAction, deleteSelectionAction, downloadSelectionAction } = useObjectsSelectionBarActions({
		selectionActionMap: interactions.selectionActionMap,
	})

	const listKeydownHandler = useObjectsListKeydownHandler({
		selectedCount,
		singleSelectedKey: previewState.singleSelectedKey,
		lastSelectedObjectKey,
		orderedVisibleObjectKeys: data.orderedVisibleObjectKeys,
		visibleObjectKeys,
		rowIndexByObjectKey,
		canGoUp,
		clearSelection,
		openRenameObject: actions.openRenameObject,
		openNewFolder: actions.openNewFolder,
		copySelectionToClipboard: interactions.copySelectionToClipboard,
		pasteClipboardObjects: interactions.pasteClipboardObjects,
		openDetailsForKey: actions.openDetailsForKey,
		onUp: data.onUp,
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
