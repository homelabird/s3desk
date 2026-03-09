import { Suspense, useCallback, useEffect } from 'react'

import styles from './objects/objects.module.css'
import { ObjectsPageHeader } from './objects/ObjectsPageHeader'
import { ObjectsPageOverlays } from './objects/ObjectsPageOverlays'
import { ObjectsPagePanes } from './objects/ObjectsPagePanes'
import { ObjectsImageViewerModal } from './objects/objectsPageLazy'
import { useObjectsPageActions } from './objects/useObjectsPageActions'
import { useObjectsPageData } from './objects/useObjectsPageData'
import { isObjectsRefreshRelevant, objectsRefreshEventName, type ObjectsRefreshEventDetail } from './objects/objectsRefreshEvents'
import { normalizePrefix } from './objects/objectsListUtils'
import { useObjectsListViewport } from './objects/useObjectsListViewport'
import { useObjectsScreenComposition } from './objects/useObjectsScreenComposition'
import { useObjectsScreenPreviewState } from './objects/useObjectsScreenPreviewState'

type Props = {
	apiToken: string
	profileId: string | null
}

export function ObjectsPageScreen(props: Props) {
	const data = useObjectsPageData(props)
	const {
		api,
		bucket,
		cleanupEmptyDirsDefault,
		clearSearch,
		deferredSearch,
		detailsVisible,
		dockDetails,
		downloadLinkProxyEnabled,
		favoritesOnly,
		favoritesOpenDetails,
		favoritesQuery,
		moveAfterUploadDefault,
		navigateToLocation,
		objectsQuery,
		onOpenPrefix,
		prefix,
		refreshTreeNode,
		rows,
		screens,
		search,
		selectedCount,
		selectedKeys,
		setDetailsDrawerOpen,
		setDetailsOpen,
		setFavoritesOnly,
		setLastSelectedObjectKey,
		setSelectedKeys,
		setTypeFilter,
		setTreeDrawerOpen,
		showThumbnails,
		thumbnailCache,
		typeFilter,
		uploadDisabledReason,
		uploadSupported,
		favoritesFirst,
		extFilter,
		minSize,
		maxSize,
		minModifiedMs,
		maxModifiedMs,
		sort,
	} = data

	const refresh = useCallback(async () => {
		if (favoritesOnly) {
			await favoritesQuery.refetch()
			return
		}
		await Promise.all([objectsQuery.refetch(), favoritesQuery.refetch()])
	}, [favoritesOnly, favoritesQuery, objectsQuery])

	useEffect(() => {
		const profileId = props.profileId
		if (typeof window === 'undefined' || !profileId || !bucket) return

		const handleObjectsRefresh = (event: Event) => {
			if (!(event instanceof CustomEvent)) return
			const detail = event.detail as ObjectsRefreshEventDetail | undefined
			if (!detail) return
			if (!isObjectsRefreshRelevant({ profileId, bucket, prefix }, detail)) return
			void refreshTreeNode(normalizePrefix(prefix) || '/')
		}

		window.addEventListener(objectsRefreshEventName, handleObjectsRefresh as EventListener)
		return () => window.removeEventListener(objectsRefreshEventName, handleObjectsRefresh as EventListener)
	}, [bucket, prefix, props.profileId, refreshTreeNode])

	const actions = useObjectsPageActions({
		api,
		apiToken: props.apiToken,
		profileId: props.profileId,
		bucket,
		prefix,
		dockDetails,
		downloadLinkProxyEnabled,
		createJobWithRetry: data.createJobWithRetry,
		typeFilter,
		favoritesOnly,
		deferredSearch,
		clearSearch,
		setFavoritesOnly,
		setTypeFilter,
		refreshTreeNode,
		onOpenPrefix,
		transfers: data.transfers,
		isOffline: data.isOffline,
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

	const previewState = useObjectsScreenPreviewState({
		api,
		apiToken: props.apiToken,
		profileId: props.profileId,
		bucket,
		selectedKeys,
		selectedCount,
		detailsVisible,
		favoritesOnly,
		favoriteItems: data.favoriteItems,
		objectPages: data.objectsQuery.data?.pages,
		downloadLinkProxyEnabled,
		showThumbnails,
		thumbnailCache,
		openDetailsForKey: actions.openDetailsForKey,
	})

	const viewportState = useObjectsListViewport({
		rowCount: rows.length,
		isCompactList: data.isCompactList,
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

	const { toolbarSectionProps, onDownload, onPresign, panesProps, overlaysProps } = useObjectsScreenComposition({
		props,
		data,
		actions,
		previewState,
		viewportState,
		refresh,
	})

	return (
		<div className={styles.page}>
			<ObjectsPageHeader
				uploadSupported={uploadSupported}
				uploadDisabledReason={uploadDisabledReason}
				uploadFilesInputRef={actions.uploadFilesInputRef}
				onUploadFilesInputChange={actions.onUploadFilesInputChange}
				uploadFolderInputRef={actions.uploadFolderInputRef}
				onUploadFolderInputChange={actions.onUploadFolderInputChange}
				toolbarSectionProps={toolbarSectionProps}
			/>

			<ObjectsPagePanes layoutRef={data.layoutRef} {...panesProps} />
			<Suspense fallback={null}>
				<ObjectsImageViewerModal
					open={previewState.largePreviewOpen}
					isMobile={!screens.md}
					objectKey={previewState.largePreviewKey}
					objectMeta={previewState.largePreviewMeta}
					isMetaFetching={previewState.largePreviewMetaIsFetching}
					thumbnail={previewState.largePreviewThumbnail}
					preview={previewState.largePreview}
					onLoadPreview={previewState.loadLargePreview}
					onCancelPreview={previewState.cancelLargePreview}
					canCancelPreview={previewState.canCancelLargePreview}
					onClose={previewState.closeLargePreview}
					onDownload={() => {
						if (!previewState.largePreviewKey) return
						const objectSize = previewState.objectByKey.get(previewState.largePreviewKey)?.size
						const size = previewState.largePreviewMeta?.size ?? objectSize
						onDownload(previewState.largePreviewKey, size)
					}}
					onPresign={() => {
						if (!previewState.largePreviewKey) return
						onPresign(previewState.largePreviewKey)
					}}
					isPresignLoading={
						actions.presignMutation.isPending && actions.presignKey === previewState.largePreviewKey
					}
				/>
			</Suspense>
			<ObjectsPageOverlays {...overlaysProps} />
		</div>
	)
}
