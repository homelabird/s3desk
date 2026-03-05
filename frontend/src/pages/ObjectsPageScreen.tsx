import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'

import type { ObjectItem } from '../api/types'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import styles from './objects/objects.module.css'
import { ObjectThumbnail } from './objects/ObjectThumbnail'
import { ObjectsPageHeader } from './objects/ObjectsPageHeader'
import { ObjectsPageOverlays } from './objects/ObjectsPageOverlays'
import { ObjectsPagePanes } from './objects/ObjectsPagePanes'
import { useObjectDownloads } from './objects/useObjectDownloads'
import { useObjectPreview } from './objects/useObjectPreview'
import { useObjectsAutoScan } from './objects/useObjectsAutoScan'
import { useObjectsBreadcrumbItems } from './objects/useObjectsBreadcrumbItems'
import { buildObjectsPagePanesProps } from './objects/buildObjectsPagePanesProps'
import { buildObjectsPageOverlaysProps } from './objects/buildObjectsPageOverlaysProps'
import { useObjectsClipboard } from './objects/useObjectsClipboard'
import { useObjectsCommandPaletteOverlayState } from './objects/useObjectsCommandPaletteOverlayState'
import { useObjectsDnd } from './objects/useObjectsDnd'
import { useObjectsListKeydownHandler } from './objects/useObjectsListKeydownHandler'
import { useObjectsListViewport } from './objects/useObjectsListViewport'
import { COMPACT_ROW_HEIGHT_PX, WIDE_ROW_HEIGHT_PX } from './objects/objectsPageConstants'
import { logContextMenuDebug, logObjectsDebug } from './objects/objectsPageDebug'
import { guessPreviewKind, normalizePrefix, parentPrefixFromKey } from './objects/objectsListUtils'
import { useObjectsPageActions } from './objects/useObjectsPageActions'
import { useObjectsPageData } from './objects/useObjectsPageData'
import { useObjectsPageListInteractions } from './objects/useObjectsPageListInteractions'
import { useObjectsSelectionBarActions } from './objects/useObjectsSelectionBarActions'
import { useObjectsToolbarProps } from './objects/useObjectsToolbarProps'
import { useObjectsTopMenus } from './objects/useObjectsTopMenus'

type Props = {
	apiToken: string
	profileId: string | null
}

export function ObjectsPageScreen(props: Props) {
	const {
		activeTabId,
		addTab,
		allLoadedSelected,
		api,
		autoScanReady,
		bucket,
		bucketOptions,
		bucketsQuery,
		canGoBack,
		canGoForward,
		canGoUp,
		canDragDrop,
		cleanupEmptyDirsDefault,
		clearSearch,
		clearSelection,
		closeGlobalSearch,
		closeTab,
		commandPaletteOpener,
		commitPathDraft,
		createJobWithRetry,
		debugContextMenu,
		debugObjectsList,
		deferredSearch,
		detailsDrawerOpen,
		detailsOpen,
		detailsResizeHandleWidth,
		detailsVisible,
		detailsWidthUsed,
		dockDetails,
		dockTree,
		downloadLinkProxyEnabled,
		emptyKind,
		ensureObjectSelectedForContextMenu,
		extFilter,
		extOptions,
		favoriteItems,
		favoriteKeys,
		favoritePendingKeys,
		favoritesFirst,
		favoritesOnly,
		favoritesOpenDetails,
		favoritesQuery,
		favoritesSearch,
		filtersDrawerOpen,
		globalSearchDraft,
		globalSearchExt,
		globalSearchLimitClamped,
		globalSearchMaxModifiedMs,
		globalSearchMaxSize,
		globalSearchMinModifiedMs,
		globalSearchMinSize,
		globalSearchOpen,
		globalSearchPrefix,
		globalSearchQueryText,
		goBack,
		goForward,
		handleBucketDropdownVisibleChange,
		handleToggleSelectAll,
		handleToggleUiMode,
		handleTreeSelect,
		highlightText,
		indexFullReindex,
		indexObjectsJobMutation,
		indexPrefix,
		indexedSearchErrorMessage,
		indexedSearchItems,
		indexedSearchNotIndexed,
		indexedSearchQuery,
		isAdvanced,
		isBookmarked,
		isCompactList,
		isDesktop,
		isOffline,
		lastSelectedObjectKey,
		layoutRef,
		maxModifiedMs,
		maxSize,
		minModifiedMs,
		minSize,
		moveAfterUploadDefault,
		navigateToLocation,
		objectCrudSupported,
		objectsQuery,
		onDetailsResizePointerDown,
		onDetailsResizePointerMove,
		onDetailsResizePointerUp,
		onOpenPrefix,
		onTreeLoadData,
		onTreeResizePointerDown,
		onTreeResizePointerMove,
		onTreeResizePointerUp,
		onUp,
		openGlobalSearch,
		openPathModal,
		orderedVisibleObjectKeys,
		pathDraft,
		pathInputRef,
		pathModalOpen,
		pathOptions,
		prefix,
		prefixByBucketRef,
		profileCapabilities,
		queryClient,
		rawTotalCount,
		refreshTreeNode,
		resetGlobalSearch,
		rowIndexByObjectKey,
		rows,
		screens,
		search,
		searchDraft,
		selectAllLoaded,
		selectObjectFromCheckboxEvent,
		selectObjectFromPointerEvent,
		selectRange,
		selectedCount,
		selectedKeys,
		setActiveTabId,
		setCleanupEmptyDirsDefault,
		setDetailsDrawerOpen,
		setDetailsOpen,
		setExtFilter,
		setFavoritesFirst,
		setFavoritesOnly,
		setFavoritesOpenDetails,
		setFavoritesSearch,
		setFiltersDrawerOpen,
		setGlobalSearchDraft,
		setGlobalSearchExt,
		setGlobalSearchLimit,
		setGlobalSearchMaxModifiedMs,
		setGlobalSearchMaxSize,
		setGlobalSearchMinModifiedMs,
		setGlobalSearchMinSize,
		setGlobalSearchPrefix,
		setIndexFullReindex,
		setIndexPrefix,
		setLastSelectedObjectKey,
		setMaxModifiedMs,
		setMaxSize,
		setMinModifiedMs,
		setMinSize,
		setMoveAfterUploadDefault,
		setPathDraft,
		setPathModalOpen,
		setSearchDraft,
		setSelectedKeys,
		setSort,
		setAutoScanReadyKey,
		setTreeDrawerOpen,
		setTreeExpandedKeys,
		setTypeFilter,
		setUiMode,
		showThumbnails,
		someLoadedSelected,
		sort,
		tabs,
		thumbnailCache,
		toggleBookmark,
		toggleFavorite,
		transfers,
		treeData,
		treeDrawerOpen,
		treeExpandedKeys,
		treeLoadingKeys,
		treeResizeHandleWidth,
		treeSelectedKeys,
		treeWidthUsed,
		typeFilter,
		uploadDisabledReason,
		uploadSupported,
		visibleFileCount,
		visibleObjectKeys,
		visiblePrefixCount,
		zipObjectsJobMutation,
		zipPrefixJobMutation,
	} = useObjectsPageData(props)

	const refresh = async () => {
		if (favoritesOnly) {
			await favoritesQuery.refetch()
			return
		}
		await Promise.all([objectsQuery.refetch(), favoritesQuery.refetch()])
	}

	const toggleSortColumn = (col: 'name' | 'size' | 'time') => {
		if (col === 'name') {
			setSort(sort === 'name_asc' ? 'name_desc' : 'name_asc')
			return
		}
		if (col === 'size') {
			setSort(sort === 'size_asc' ? 'size_desc' : 'size_asc')
			return
		}
		if (col === 'time') {
			setSort(sort === 'time_asc' ? 'time_desc' : 'time_asc')
			return
		}
	}

	const sortDirForColumn = (col: 'name' | 'size' | 'time'): 'asc' | 'desc' | null => {
		if (col === 'name') {
			if (sort === 'name_asc') return 'asc'
			if (sort === 'name_desc') return 'desc'
			return null
		}
		if (col === 'size') {
			if (sort === 'size_asc') return 'asc'
			if (sort === 'size_desc') return 'desc'
			return null
		}
		if (col === 'time') {
			if (sort === 'time_asc') return 'asc'
			if (sort === 'time_desc') return 'desc'
			return null
		}
		return null
	}

	const actions = useObjectsPageActions({
		api,
		apiToken: props.apiToken,
		profileId: props.profileId,
		bucket,
		prefix,
		dockDetails,
		downloadLinkProxyEnabled,
		createJobWithRetry,
		typeFilter,
		favoritesOnly,
		deferredSearch,
		clearSearch,
		setFavoritesOnly,
		setTypeFilter,
		refreshTreeNode,
		onOpenPrefix,
		transfers,
		isOffline,
		uploadSupported,
		uploadDisabledReason,
		moveAfterUploadDefault,
		cleanupEmptyDirsDefault,
		selectedKeys,
		setSelectedKeys,
		setLastSelectedObjectKey,
		favoritesOpenDetails,
		navigateToLocation,
		setDetailsOpen,
		setDetailsDrawerOpen,
		setTreeDrawerOpen,
	})
	const {
		handleFavoriteSelect,
		openDetails,
		openDetailsForKey,
		toggleDetails,
		openRenameObject,
		openRenamePrefix,
		presignKey,
		presignMutation,
		openCopyMove,
		openCopyPrefix,
		deletingKey,
		deleteMutation,
		openNewFolder,
		openDownloadPrefix,
		uploadDropActive,
		onUploadDragEnter,
		onUploadDragLeave,
		onUploadDragOver,
		onUploadDrop,
		confirmDeleteObjects,
		confirmDeleteSelected,
		confirmDeletePrefixAsJob,
		uploadFilesInputRef,
		uploadFolderInputRef,
		onUploadFilesInputChange,
		onUploadFolderInputChange,
		openUploadFilesPicker,
		openUploadFolderPicker,
	} = actions

		useEffect(() => {
			return () => {
				thumbnailCache.clear()
		}
	}, [bucket, props.profileId, thumbnailCache])

	useEffect(() => {
		if (!showThumbnails) {
			thumbnailCache.clear()
		}
	}, [showThumbnails, thumbnailCache])

	const objectByKey = useMemo(() => {
		const out = new Map<string, ObjectItem>()
		if (favoritesOnly) {
			for (const obj of favoriteItems) out.set(obj.key, obj)
			return out
		}
		for (const p of objectsQuery.data?.pages ?? []) {
			for (const obj of p.items) out.set(obj.key, obj)
		}
		return out
	}, [favoriteItems, favoritesOnly, objectsQuery.data])
	const singleSelectedKey = selectedCount === 1 ? Array.from(selectedKeys)[0] : null
	const singleSelectedItem = singleSelectedKey ? objectByKey.get(singleSelectedKey) : undefined
	const detailsKey = detailsVisible ? singleSelectedKey : null
	const detailsMetaQuery = useQuery({
		queryKey: ['objectMeta', props.profileId, bucket, detailsKey, props.apiToken],
		enabled: !!props.profileId && !!bucket && !!detailsKey && detailsVisible,
		queryFn: () => api.getObjectMeta({ profileId: props.profileId!, bucket, key: detailsKey! }),
		retry: false,
	})
	const detailsMeta = detailsMetaQuery.data ?? null

	const { preview, loadPreview, cancelPreview, canCancelPreview } = useObjectPreview({
		api,
		profileId: props.profileId,
		bucket,
		detailsKey,
		detailsVisible,
		detailsMeta,
		downloadLinkProxyEnabled,
	})

	const {
		listScrollerEl,
		listScrollerRef,
		scrollContainerRef,
		rowVirtualizer,
		virtualItems,
		virtualItemsForRender,
		totalSize,
	} = useObjectsListViewport({
		rowCount: rows.length,
		isCompactList,
		bucket,
		prefix,
		search,
		sort,
		typeFilter,
		favoritesOnly,
		favoritesFirst,
		extFilter,
		minSize,
		maxSize,
		minModifiedMs,
		maxModifiedMs,
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

	const hasActiveFilters =
		typeFilter !== 'all' ||
		favoritesOnly ||
		!!extFilter.trim() ||
		minSize != null ||
		maxSize != null ||
		minModifiedMs != null ||
		maxModifiedMs != null
	const hasNonDefaultSort = sort !== 'name_asc' || favoritesFirst
	const hasActiveView = hasActiveFilters || hasNonDefaultSort
		const resetFilters = () => {
			setTypeFilter('all')
			setFavoritesOnly(false)
			setFavoritesFirst(false)
			setExtFilter('')
			setMinSize(null)
			setMaxSize(null)
			setMinModifiedMs(null)
			setMaxModifiedMs(null)
			setSort('name_asc')
		}

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
	const { onDownload, onDownloadToDevice, handleDownloadSelected } = useObjectDownloads({
		profileId: props.profileId,
		bucket,
		prefix,
		selectedKeys,
		selectedCount,
		objectByKey,
		transfers,
		onZipObjects: (keys) => zipObjectsJobMutation.mutate({ keys }),
	})
		const { clipboardObjects, onCopy, copySelectionToClipboard, pasteClipboardObjects } = useObjectsClipboard({
			profileId: props.profileId,
			bucket,
			prefix,
			selectedKeys,
			createJobWithRetry,
			queryClient,
		})
	const {
		dndHoverPrefix,
		normalizeDropTargetPrefix,
		onDndTargetDragOver,
		onDndTargetDragLeave,
		onDndTargetDrop,
		onRowDragStartObjects,
		onRowDragStartPrefix,
		clearDndHover,
	} = useObjectsDnd({
		profileId: props.profileId,
		bucket,
		prefix,
		canDragDrop,
		isDesktop,
		selectedKeys,
		setSelectedKeys,
		setLastSelectedObjectKey,
		createJobWithRetry,
		queryClient,
	})
	const listGridClassName = isCompactList ? styles.listGridCompact : styles.listGridWide
	const {
		getObjectActions,
		currentPrefixActionMap,
		selectionActionMap,
		selectionMenuActions,
		globalActionMap,
		commandItems,
		contextMenuClassName,
		contextMenuRef,
		contextMenuVisible,
		contextMenuProps,
		contextMenuStyle,
		getListScrollerElement,
		handleListScrollerContextMenu,
		handleListScrollerScroll,
		handleListScrollerWheel,
		renderPrefixRow,
		renderObjectRow,
		handleTreePrefixContextMenu,
	} = useObjectsPageListInteractions({
		actionCatalog: {
			isAdvanced,
			isOffline,
			profileId: props.profileId,
			bucket,
			prefix,
			objectCrudSupported,
			uploadSupported,
			selectedCount,
			clipboardObjects,
			singleSelectedKey,
			singleSelectedItemSize: singleSelectedItem?.size,
			canGoBack,
			canGoForward,
			canGoUp,
			detailsVisible,
			activeTabId,
			tabsCount: tabs.length,
			onGoBack: goBack,
			onGoForward: goForward,
			onGoUp: onUp,
			onDownload,
			onDownloadToDevice,
			onPresign: (key) => presignMutation.mutate(key),
			onCopy,
			onOpenDetailsForKey: openDetailsForKey,
			onOpenRenameObject: openRenameObject,
			onOpenCopyMove: openCopyMove,
			onConfirmDeleteObjects: confirmDeleteObjects,
			onOpenPrefix: onOpenPrefix,
			onOpenRenamePrefix: openRenamePrefix,
			onConfirmDeletePrefixAsJob: confirmDeletePrefixAsJob,
			onOpenCopyPrefix: openCopyPrefix,
			onOpenDownloadPrefix: openDownloadPrefix,
			onZipPrefix: (targetPrefix) => zipPrefixJobMutation.mutate({ prefix: targetPrefix }),
			onDownloadSelected: handleDownloadSelected,
			onCopySelectionToClipboard: (mode) => void copySelectionToClipboard(mode),
			onPasteClipboardObjects: () => void pasteClipboardObjects(),
			onClearSelection: clearSelection,
			onConfirmDeleteSelected: confirmDeleteSelected,
			onToggleDetails: toggleDetails,
			onOpenTreeDrawer: () => setTreeDrawerOpen(true),
			onRefresh: () => void refresh(),
			onOpenPathModal: openPathModal,
			onOpenUploadFiles: openUploadFilesPicker,
			onOpenUploadFolder: openUploadFolderPicker,
			onOpenNewFolder: openNewFolder,
			onOpenCommandPalette: commandPaletteOpener.open,
			onOpenTransfers: () => transfers.openTransfers(),
			onAddTab: addTab,
			onCloseTab: closeTab,
			onOpenGlobalSearch: openGlobalSearch,
			onToggleUiMode: handleToggleUiMode,
		},
		contextMenu: {
			debugEnabled: debugContextMenu,
			log: logContextMenuDebug,
			listScrollerEl,
			scrollContainerRef,
			selectedCount,
			objectByKey,
			selectedKeys,
			isAdvanced,
			ensureObjectSelected: ensureObjectSelectedForContextMenu,
		},
		rowRenderers: {
			api,
			profileId: props.profileId,
			bucket,
			prefix,
			canDragDrop,
			isCompactList,
			isAdvanced,
			isOffline,
			listGridClassName,
			rowHeightCompactPx: COMPACT_ROW_HEIGHT_PX,
			rowHeightWidePx: WIDE_ROW_HEIGHT_PX,
			showThumbnails,
			thumbnailCache,
			highlightText,
			onOpenPrefix,
			onRowDragStartPrefix,
			onRowDragStartObjects,
			clearDndHover,
			selectObjectFromPointerEvent,
			selectObjectFromCheckboxEvent,
			selectedCount,
			selectedKeys,
			favoriteKeys,
			favoritePendingKeys,
			toggleFavorite,
			scrollContainerRef,
		},
	})
	const { breadcrumbItems } = useObjectsBreadcrumbItems({
		bucket,
		prefix,
		isMd: !!screens.md,
		canDragDrop,
		dndHoverPrefix,
		normalizeDropTargetPrefix,
		onDndTargetDragOver,
		onDndTargetDragLeave,
		onDndTargetDrop,
		navigateToLocation,
	})
	const {
		commandPaletteOpen,
		openCommandPalette,
		closeCommandPalette,
		commandPaletteQuery,
		commandPaletteActiveIndex,
		setCommandPaletteActiveIndex,
		commandPaletteItems,
		runCommandPaletteItem,
		onCommandPaletteQueryChange,
		onCommandPaletteKeyDown,
	} = useObjectsCommandPaletteOverlayState({ items: commandItems })

	useEffect(() => {
		commandPaletteOpener.bind(openCommandPalette)
		return () => commandPaletteOpener.bind(null)
	}, [commandPaletteOpener, openCommandPalette])

	const { clearSelectionAction, deleteSelectionAction, downloadSelectionAction } = useObjectsSelectionBarActions({
		selectionActionMap,
	})
	const showUploadDropOverlay = uploadDropActive && !!props.profileId && !!bucket && !isOffline && uploadSupported
	const uploadDropLabel = bucket ? `s3://${bucket}/${normalizePrefix(prefix)}` : '-'
	const listKeydownHandler = useObjectsListKeydownHandler({
		selectedCount,
		singleSelectedKey,
		lastSelectedObjectKey,
		orderedVisibleObjectKeys,
		visibleObjectKeys,
		rowIndexByObjectKey,
		canGoUp,
		clearSelection,
		openRenameObject,
		openNewFolder,
		copySelectionToClipboard,
		pasteClipboardObjects,
		openDetailsForKey,
		onUp,
		confirmDeleteSelected,
		setSelectedKeys,
		setLastSelectedObjectKey,
		selectRange,
		selectAllLoaded,
		scrollToIndex: (index) => rowVirtualizer.scrollToIndex(index),
	})
	const handleClearSearch = clearSearch
	const canClearSearch = !!search.trim() || !!searchDraft.trim()
	const listIsFetching = favoritesOnly ? favoritesQuery.isFetching : objectsQuery.isFetching
	const listIsFetchingNextPage = favoritesOnly ? false : objectsQuery.isFetchingNextPage
	const loadMoreDisabled = listIsFetching || listIsFetchingNextPage
	const canInteract = !!props.profileId && !!bucket && !isOffline

		const { topMoreMenu } = useObjectsTopMenus({
			isAdvanced,
			profileId: props.profileId,
		bucket,
		prefix,
		dockTree,
		globalActionMap,
			currentPrefixActionMap,
		})

		const { toolbarProps, canCreateFolder, createFolderTooltipText } = useObjectsToolbarProps({
			isDesktop: !!screens.lg,
			showLabels: !!screens.sm,
			isAdvanced,
			isOffline,
			profileId: props.profileId,
			bucket,
			selectedCount,
			bucketOptions,
			bucketsLoading: bucketsQuery.isFetching,
			onBucketDropdownVisibleChange: handleBucketDropdownVisibleChange,
			canGoBack,
			canGoForward,
			canGoUp,
			onGoBack: goBack,
			onGoForward: goForward,
			onGoUp: onUp,
			globalActionMap,
			uploadEnabled: uploadSupported,
			uploadDisabledReason: uploadDisabledReason,
			onUploadFiles: openUploadFilesPicker,
			objectCrudSupported,
			profileCapabilities,
			topMoreMenu,
			showPrimaryActions: !isAdvanced,
			primaryDownloadAction: downloadSelectionAction,
			primaryDeleteAction: deleteSelectionAction,
			activeTransferCount: transfers.activeTransferCount,
			onOpenTransfers: () => transfers.openTransfers(),
			dockTree,
			dockDetails,
			onOpenTree: () => setTreeDrawerOpen(true),
			onOpenDetails: () => setDetailsDrawerOpen(true),
			onNewFolder: () => openNewFolder(),
			onRefresh: () => void refresh(),
			isRefreshing: listIsFetching,
			prefixByBucketRef,
			navigateToLocation,
		})

	const openGlobalSearchPrefix = (key: string) => {
		closeGlobalSearch()
		if (!bucket) return
		navigateToLocation(bucket, parentPrefixFromKey(key), { recordHistory: true })
	}

	const openGlobalSearchDetails = (key: string) => {
		closeGlobalSearch()
		openDetailsForKey(key)
	}

	const detailsThumbnailSize = 160
	const detailsThumbnail =
		showThumbnails &&
		detailsMeta &&
		detailsKey &&
		props.profileId &&
		bucket &&
		guessPreviewKind(detailsMeta.contentType, detailsKey) === 'image' ? (
			<ObjectThumbnail
				api={api}
				profileId={props.profileId}
				bucket={bucket}
				objectKey={detailsKey}
				size={detailsThumbnailSize}
				cache={thumbnailCache}
				cacheKeySuffix={detailsMeta.etag || detailsMeta.lastModified || undefined}
				fit="contain"
			/>
		) : null

	const overlaysProps = buildObjectsPageOverlaysProps({
		actions,
		profileId: props.profileId,
		bucket,
		prefix,
		isMd: !!screens.md,
		bucketOptions,
		bucketsLoading: bucketsQuery.isFetching,
		filtersDrawerOpen,
		setFiltersDrawerOpen,
		isAdvanced,
		typeFilter,
		setTypeFilter,
		favoritesOnly,
		setFavoritesOnly,
		favoritesFirst,
		setFavoritesFirst,
		extFilter,
		extOptions,
		setExtFilter,
		minSize,
		maxSize,
		setMinSize,
		setMaxSize,
		minModifiedMs,
		maxModifiedMs,
		setMinModifiedMs,
		setMaxModifiedMs,
		sort,
		setSort,
		resetFilters,
		hasActiveView,
		pathModalOpen,
		pathDraft,
		pathOptions,
		pathInputRef,
		setPathDraft,
		commitPathDraft,
		setPathModalOpen,
		commandPaletteOpen,
		commandPaletteQuery,
		commandPaletteItems,
		commandPaletteActiveIndex,
		onCommandPaletteQueryChange,
		setCommandPaletteActiveIndex,
		runCommandPaletteItem,
		closeCommandPalette,
		onCommandPaletteKeyDown,
		globalSearchOpen,
		closeGlobalSearch,
		globalSearchDraft,
		setGlobalSearchDraft,
		globalSearchPrefix,
		setGlobalSearchPrefix,
		globalSearchLimitClamped,
		setGlobalSearchLimit,
		globalSearchExt,
		setGlobalSearchExt,
		globalSearchMinSize,
		setGlobalSearchMinSize,
		globalSearchMaxSize,
		setGlobalSearchMaxSize,
		globalSearchMinModifiedMs,
		setGlobalSearchMinModifiedMs,
		globalSearchMaxModifiedMs,
		setGlobalSearchMaxModifiedMs,
		resetGlobalSearch,
		indexedSearchQuery,
		indexedSearchNotIndexed,
		indexedSearchErrorMessage,
		indexedSearchItems,
		indexObjectsJobMutation,
		indexPrefix,
		setIndexPrefix,
		indexFullReindex,
		setIndexFullReindex,
		globalSearchQueryText,
		setMoveAfterUploadDefault,
		setCleanupEmptyDirsDefault,
		onOpenPrefix,
		onCopy,
		onDownload,
		openGlobalSearchPrefix,
		openGlobalSearchDetails,
	})
	const panesProps = buildObjectsPagePanesProps({
		profileId: props.profileId,
		bucket,
		prefix,
		layoutProps: {
			treeWidthPx: dockTree ? treeWidthUsed : 0,
			treeHandleWidthPx: treeResizeHandleWidth,
			detailsWidthPx: dockDetails ? detailsWidthUsed : 0,
			detailsHandleWidthPx: dockDetails && detailsOpen ? detailsResizeHandleWidth : 0,
			treeDocked: dockTree,
			detailsDocked: dockDetails,
			detailsOpen,
		},
		contextMenuPortalProps: {
			contextMenuClassName,
			contextMenuRef,
			contextMenuVisible,
			contextMenuProps,
			contextMenuStyle,
		},
		treeDrawerOpen,
		dockTree,
		favoriteItems,
		favoritesSearch,
		setFavoritesSearch,
		favoritesOnly,
		setFavoritesOnly,
		favoritesOpenDetails,
		setFavoritesOpenDetails,
		handleFavoriteSelect,
		favoritesLoading: favoritesQuery.isFetching,
		favoritesErrorMessage: favoritesQuery.isError ? formatErr(favoritesQuery.error) : null,
		treeData,
		treeLoadingKeys,
		onTreeLoadData,
		treeSelectedKeys,
		treeExpandedKeys,
		setTreeExpandedKeys,
		handleTreeSelect,
		normalizeDropTargetPrefix,
		canDragDrop,
		dndHoverPrefix,
		onDndTargetDragOver,
		onDndTargetDragLeave,
		onDndTargetDrop,
		onTreeResizePointerDown,
		onTreeResizePointerMove,
		onTreeResizePointerUp,
		canCreateFolder,
		createFolderTooltipText,
		openNewFolder,
		handleTreePrefixContextMenu,
		setTreeDrawerOpen,
		isBookmarked,
		toggleBookmark,
		openPathModal,
		breadcrumbItems,
		isCompactList,
		searchDraft,
		setSearchDraft,
		hasActiveView,
		setFiltersDrawerOpen,
		isAdvanced,
		visiblePrefixCount,
		visibleFileCount,
		search,
		objectsHasNextPage: objectsQuery.hasNextPage ?? false,
		objectsIsFetchingNextPage: objectsQuery.isFetchingNextPage,
		rawTotalCount,
		searchAutoScanCap,
		openGlobalSearch,
		setUiMode,
		canInteract,
		sort,
		setSort,
		favoritesFirst,
		setFavoritesFirst,
		isOffline,
		objectsErrorMessage: objectsQuery.isError ? formatErr(objectsQuery.error) : null,
		uploadDropActive: showUploadDropOverlay,
		uploadDropLabel,
		onUploadDragEnter,
		onUploadDragLeave,
		onUploadDragOver,
		onUploadDrop,
		selectedCount,
		singleSelectedKey,
		singleSelectedSize: singleSelectedItem?.size,
		clearSelectionAction,
		deleteSelectionAction,
		downloadSelectionAction,
		selectionMenuActions,
		getObjectActions,
		isDownloadLoading: zipObjectsJobMutation.isPending,
		isDeleteLoading: deleteMutation.isPending && deletingKey === null,
		listGridClassName,
		allLoadedSelected,
		someLoadedSelected,
		visibleObjectKeys,
		handleToggleSelectAll,
		sortDirForColumn,
		toggleSortColumn,
		listScrollerRef,
		getListScrollerElement,
		listKeydownHandler,
		handleListScrollerScroll,
		handleListScrollerWheel,
		handleListScrollerContextMenu,
		rows,
		virtualItemsForRender,
		totalSize,
		listIsFetching,
		listIsFetchingNextPage,
		emptyKind,
		canClearSearch,
		handleClearSearch,
		renderPrefixRow,
		renderObjectRow,
		showLoadMore,
		loadMoreLabel,
		loadMoreDisabled,
		handleLoadMore,
		detailsKey,
		detailsMeta,
		detailsMetaQueryIsFetching: detailsMetaQuery.isFetching,
		detailsMetaQueryIsError: detailsMetaQuery.isError,
		detailsMetaErrorMessage: detailsMetaQuery.isError ? formatErr(detailsMetaQuery.error) : '',
		refetchDetailsMeta: () => void detailsMetaQuery.refetch(),
		onCopy,
		onDownload,
		presignMutate: (key) => presignMutation.mutate(key),
		presignPendingForKey: presignMutation.isPending && presignKey === detailsKey,
		openCopyMove,
		confirmDeleteObjects,
		detailsDeleteLoading: deleteMutation.isPending && deletingKey === detailsKey,
		detailsThumbnail,
		preview,
		loadPreview,
		cancelPreview,
		canCancelPreview,
		dockDetails,
		detailsOpen,
		detailsDrawerOpen,
		openDetails,
		setDetailsOpen,
		setDetailsDrawerOpen,
		onDetailsResizePointerDown,
		onDetailsResizePointerMove,
		onDetailsResizePointerUp,
	})

		return (
			<div className={styles.page}>
				<ObjectsPageHeader
					uploadSupported={uploadSupported}
					uploadDisabledReason={uploadDisabledReason}
					uploadFilesInputRef={uploadFilesInputRef}
					onUploadFilesInputChange={onUploadFilesInputChange}
					uploadFolderInputRef={uploadFolderInputRef}
					onUploadFolderInputChange={onUploadFolderInputChange}
					toolbarSectionProps={{
						apiToken: props.apiToken,
						profileId: props.profileId,
						bucketsErrorMessage: bucketsQuery.isError ? formatErr(bucketsQuery.error) : null,
						isAdvanced,
						tabs,
						activeTabId,
						onTabChange: setActiveTabId,
						onTabAdd: addTab,
						onTabClose: closeTab,
						tabLabelMaxWidth: screens.md ? 320 : 220,
						toolbarProps,
					}}
				/>

			<ObjectsPagePanes layoutRef={layoutRef} {...panesProps} />

				<ObjectsPageOverlays {...overlaysProps} />
		</div>
	)
}
