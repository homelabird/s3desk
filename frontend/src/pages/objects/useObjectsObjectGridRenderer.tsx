import { useCallback } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Button, Checkbox, Typography } from 'antd'
import { EllipsisOutlined, ExpandOutlined, FileOutlined, StarFilled, StarOutlined } from '@ant-design/icons'

import type { ObjectItem } from '../../api/types'
import { formatDateTime } from '../../lib/format'
import { formatBytes } from '../../lib/transfer'
import styles from './objects.module.css'
import { ObjectThumbnail } from './ObjectThumbnail'
import { ObjectsMenuPopover } from './ObjectsMenuPopover'
import { buildActionMenu } from './objectsActions'
import type { UseObjectsGridRenderersArgs } from './objectsGridRendererTypes'
import { GRID_CARD_THUMBNAIL_PX } from './objectsPageConstants'
import { displayNameForKey, isThumbnailKey } from './objectsListUtils'
import { extensionLabel, onActivateFromKeyboard } from './objectsGridRendererUtils'

type UseObjectsObjectGridRendererArgs = Pick<
	UseObjectsGridRenderersArgs,
	| 'api'
	| 'bucket'
	| 'canDragDrop'
	| 'clearDndHover'
	| 'closeContextMenu'
	| 'contextMenuState'
	| 'favoriteKeys'
	| 'favoritePendingKeys'
	| 'getObjectActions'
	| 'highlightText'
	| 'isAdvanced'
	| 'isOffline'
	| 'onOpenLargePreviewForKey'
	| 'onRowDragStartObjects'
	| 'openObjectContextMenu'
	| 'prefix'
	| 'profileId'
	| 'profileProvider'
	| 'recordContextMenuPoint'
	| 'selectObjectFromCheckboxEvent'
	| 'selectObjectFromPointerEvent'
	| 'selectedCount'
	| 'selectedKeys'
	| 'selectionContextMenuActions'
	| 'showThumbnails'
	| 'thumbnailCache'
	| 'toggleFavorite'
	| 'withContextMenuClassName'
>

export function useObjectsObjectGridRenderer(args: UseObjectsObjectGridRendererArgs) {
	const {
		api,
		bucket,
		canDragDrop,
		clearDndHover,
		closeContextMenu,
		contextMenuState,
		favoriteKeys,
		favoritePendingKeys,
		getObjectActions,
		highlightText,
		isAdvanced,
		isOffline,
		onOpenLargePreviewForKey,
		onRowDragStartObjects,
		openObjectContextMenu,
		prefix,
		profileId,
		recordContextMenuPoint,
		selectObjectFromCheckboxEvent,
		selectObjectFromPointerEvent,
		selectedCount,
		selectedKeys,
		selectionContextMenuActions,
		showThumbnails,
		thumbnailCache,
		toggleFavorite,
		withContextMenuClassName,
	} = args

	return useCallback(
		(object: ObjectItem) => {
			const key = object.key
			const displayName = displayNameForKey(key, prefix)
			const sizeLabel = formatBytes(object.size)
			const timeLabel = formatDateTime(object.lastModified)
			const useSelectionMenu = selectedCount > 1 && selectedKeys.has(key)
			const menu = withContextMenuClassName(
				buildActionMenu(useSelectionMenu ? selectionContextMenuActions : getObjectActions(key, object.size), isAdvanced),
			)
			const canShowThumbnail = showThumbnails && profileId && bucket && isThumbnailKey(key)
			const canOpenPreview = canShowThumbnail
			const isSelected = selectedKeys.has(key)
			const isFavorite = favoriteKeys.has(key)
			const favoriteDisabled = favoritePendingKeys.has(key) || isOffline || !profileId || !bucket
			const favoriteLabel = isFavorite ? 'Remove favorite' : 'Add favorite'
			const buttonMenuOpen =
				contextMenuState.open &&
				contextMenuState.kind === 'object' &&
				contextMenuState.key === key &&
				contextMenuState.source === 'button'

			return (
				<div key={key} className={styles.gridCardShell} role="listitem">
					<div
						className={`${styles.gridCard} ${isSelected ? styles.gridCardSelected : ''}`}
						onClick={(event) => selectObjectFromPointerEvent(event, key)}
						onContextMenu={(event) => {
							event.preventDefault()
							event.stopPropagation()
							const point = recordContextMenuPoint(event)
							openObjectContextMenu(key, 'context', point)
						}}
						onKeyDown={(event) =>
							onActivateFromKeyboard(event, () =>
								selectObjectFromPointerEvent(event as unknown as ReactMouseEvent, key),
							)
						}
						draggable={canDragDrop}
						onDragStart={(event) => onRowDragStartObjects(event, key)}
						onDragEnd={clearDndHover}
						data-objects-row="true"
						role="button"
						tabIndex={0}
					>
						<div className={styles.gridCardTopRow}>
							<div className={styles.gridCardCheckboxWrap}>
								<Checkbox
									checked={isSelected}
									onClick={(event) => {
										event.stopPropagation()
										selectObjectFromCheckboxEvent(event as unknown as ReactMouseEvent, key)
									}}
									aria-label={`Select ${displayName}`}
								/>
							</div>
							<div className={styles.gridCardTopActions}>
								<Button
									size="small"
									type="text"
									icon={isFavorite ? <StarFilled className={styles.listRowFavoriteIcon} /> : <StarOutlined />}
									disabled={favoriteDisabled}
									aria-label={favoriteLabel}
									title={favoriteLabel}
									onClick={(event) => {
										event.stopPropagation()
										toggleFavorite(key)
									}}
								/>
								<ObjectsMenuPopover
									menu={menu}
									align="end"
									open={buttonMenuOpen}
									onOpenChange={(open, info) => {
										if (open) openObjectContextMenu(key, 'button')
										else closeContextMenu({ key, kind: 'object', source: 'button' }, info?.source === 'menu' ? 'menu_item' : 'button_menu')
									}}
								>
									{({ toggle }) => (
										<Button
											size="small"
											type="text"
											icon={<EllipsisOutlined />}
											aria-label="Object actions"
											aria-haspopup="menu"
											aria-expanded={buttonMenuOpen}
											title="Object actions"
											onClick={(event) => {
												event.stopPropagation()
												toggle()
											}}
										/>
									)}
								</ObjectsMenuPopover>
							</div>
						</div>

						<div className={styles.gridCardMedia}>
							{canShowThumbnail ? (
								<div className={styles.gridCardPreviewFrame}>
									<ObjectThumbnail
										api={api}
										profileId={profileId}
										bucket={bucket}
										objectKey={key}
										size={GRID_CARD_THUMBNAIL_PX}
										cache={thumbnailCache}
										cacheKeySuffix={object.etag || object.lastModified || undefined}
										objectSize={object.size}
										etag={object.etag || undefined}
										lastModified={object.lastModified || undefined}
									/>
								</div>
							) : (
								<div className={styles.gridCardMediaPlaceholder}>
									<FileOutlined className={styles.gridCardFileIcon} />
									<Typography.Text type="secondary">{extensionLabel(key)}</Typography.Text>
								</div>
							)}
						</div>

						<div className={styles.gridCardBody}>
							<Typography.Text className={styles.gridCardTitle} title={key}>
								{highlightText(displayName)}
							</Typography.Text>
							<Typography.Text type="secondary" className={styles.gridCardMetaLine}>
								{sizeLabel}
							</Typography.Text>
							<Typography.Text type="secondary" className={styles.gridCardMetaLine}>
								{timeLabel}
							</Typography.Text>
							{canOpenPreview ? (
								<div className={styles.gridCardBodyActions}>
									<Button
										size="small"
										type="text"
										icon={<ExpandOutlined />}
										onClick={(event) => {
											event.preventDefault()
											event.stopPropagation()
											onOpenLargePreviewForKey(key)
										}}
										aria-label={`Open large preview for ${key}`}
									>
										Preview
									</Button>
								</div>
							) : null}
						</div>
					</div>
				</div>
			)
		},
		[
			api,
			bucket,
			canDragDrop,
			clearDndHover,
			closeContextMenu,
			contextMenuState.key,
			contextMenuState.kind,
			contextMenuState.open,
			contextMenuState.source,
			favoriteKeys,
			favoritePendingKeys,
			getObjectActions,
			highlightText,
			isAdvanced,
			isOffline,
			onOpenLargePreviewForKey,
			onRowDragStartObjects,
			openObjectContextMenu,
			prefix,
			profileId,
			recordContextMenuPoint,
			selectedCount,
			selectedKeys,
			selectObjectFromCheckboxEvent,
			selectObjectFromPointerEvent,
			selectionContextMenuActions,
			showThumbnails,
			thumbnailCache,
			toggleFavorite,
			withContextMenuClassName,
		],
	)
}
