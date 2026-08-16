import { ArrowUpOutlined } from '@ant-design/icons'
import { Typography } from 'antd'
import { useCallback } from 'react'

import type { UseObjectsGridRenderersArgs } from './objectsGridRendererTypes'
import styles from './ObjectsGridCards.module.css'
import { useObjectsObjectGridRenderer } from './useObjectsObjectGridRenderer'
import { useObjectsPrefixGridRenderer } from './useObjectsPrefixGridRenderer'

export function useObjectsGridRenderers({
	api,
	apiToken,
	profileId,
	profileProvider,
	bucket,
	prefix,
	canDragDrop,
	isAdvanced,
	isOffline,
	objectCrudSupported,
	showThumbnails,
	thumbnailCache,
	highlightText,
	contextMenuState,
	withContextMenuClassName,
	getPrefixActions,
	getObjectActions,
	selectionContextMenuActions,
	recordContextMenuPoint,
	openPrefixContextMenu,
	openObjectContextMenu,
	closeContextMenu,
	onOpenPrefix,
	onOpenLargePreviewForKey,
	onRowDragStartPrefix,
	onRowDragStartObjects,
	dndHoverPrefix,
	normalizeDropTargetPrefix,
	onDndTargetDragOver,
	onDndTargetDragLeave,
	onDndTargetDrop,
	clearDndHover,
	selectObjectFromPointerEvent,
	selectObjectFromCheckboxEvent,
	selectedCount,
	selectedKeys,
	favoriteKeys,
	favoritePendingKeys,
	toggleFavorite,
}: UseObjectsGridRenderersArgs) {
	const renderParentGridItem = useCallback(
		(parentPrefix: string) => (
			<div key={`parent:${parentPrefix}`} className={styles.gridCardShell} role="listitem">
				<button
					type="button"
					className={`${styles.gridCard} ${styles.gridCardParentButton}`}
					aria-label="Open parent folder"
					data-testid="objects-parent-grid-item"
					onClick={() => onOpenPrefix(parentPrefix)}
				>
					<div className={styles.gridCardTopRow}>
						<Typography.Text type="secondary" className={styles.gridCardKindLabel}>Parent folder</Typography.Text>
					</div>
					<div className={`${styles.gridCardMedia} ${styles.gridCardMediaFolder}`} aria-hidden="true">
						<ArrowUpOutlined className={styles.gridCardFolderIcon} />
					</div>
					<Typography.Text className={styles.gridCardTitle}>../</Typography.Text>
					<Typography.Text type="secondary" className={styles.gridCardMetaLine}>Go up one level</Typography.Text>
				</button>
			</div>
		),
		[onOpenPrefix],
	)
	const renderPrefixGridItem = useObjectsPrefixGridRenderer({
		canDragDrop,
		isAdvanced,
		highlightText,
		contextMenuState,
		withContextMenuClassName,
		getPrefixActions,
		recordContextMenuPoint,
		openPrefixContextMenu,
		closeContextMenu,
		onOpenPrefix,
		onRowDragStartPrefix,
		dndHoverPrefix,
		normalizeDropTargetPrefix,
		onDndTargetDragOver,
		onDndTargetDragLeave,
		onDndTargetDrop,
		clearDndHover,
		prefix,
	})

	const renderObjectGridItem = useObjectsObjectGridRenderer({
		api,
		apiToken,
		profileId,
		profileProvider,
		bucket,
		prefix,
		canDragDrop,
		isAdvanced,
		isOffline,
		objectCrudSupported,
		showThumbnails,
		thumbnailCache,
		highlightText,
		contextMenuState,
		withContextMenuClassName,
		getObjectActions,
		selectionContextMenuActions,
		recordContextMenuPoint,
		openObjectContextMenu,
		closeContextMenu,
		onOpenLargePreviewForKey,
		onRowDragStartObjects,
		clearDndHover,
		selectObjectFromPointerEvent,
		selectObjectFromCheckboxEvent,
		selectedCount,
		selectedKeys,
		favoriteKeys,
		favoritePendingKeys,
		toggleFavorite,
	})

	return {
		renderParentGridItem,
		renderPrefixGridItem,
		renderObjectGridItem,
	}
}
