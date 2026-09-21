import { useCallback } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Button, Checkbox, Typography } from 'antd'
import { EllipsisOutlined, FileOutlined, StarFilled, StarOutlined } from '@ant-design/icons'

import type { ObjectItem } from '../../api/types'
import { formatDateTime } from '../../lib/format'
import { formatBytes } from '../../lib/transfer'
import gridStyles from './ObjectsGridCards.module.css'
import listStyles from './ObjectsListView.module.css'
import { LazyObjectThumbnail } from './ObjectThumbnailLazy'
import { ObjectsMenuPopover } from './ObjectsMenuPopover'
import { buildActionMenu, type UIAction } from './objectsActions'
import type { UseObjectsGridRenderersArgs } from './objectsGridRendererTypes'
import { GRID_CARD_THUMBNAIL_PX } from './objectsPageConstants'
import { displayNameForKey, isThumbnailKey } from './objectsListUtils'
import { extensionLabel } from './objectsGridRendererUtils'
import { compactObjectName } from './compactObjectName'

type UseObjectsObjectGridRendererArgs = Pick<
	UseObjectsGridRenderersArgs,
	| 'api'
	| 'apiToken'
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
	| 'objectCrudSupported'
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
		apiToken,
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
		objectCrudSupported,
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
			const compactName = compactObjectName(displayName)
			const compactSplit = compactName === displayName ? -1 : compactName.indexOf('…')
			const sizeLabel = formatBytes(object.size)
			const timeLabel = formatDateTime(object.lastModified, { showSeconds: false })
			const metaLabel = `${sizeLabel} \u00b7 ${timeLabel}`
			const isSelected = selectedKeys.has(key)
			const isFavorite = favoriteKeys.has(key)
			const favoriteDisabled = favoritePendingKeys.has(key) || isOffline || !profileId || !bucket || !objectCrudSupported
			const favoriteLabel = isFavorite ? `Remove favorite for ${displayName}` : `Add favorite for ${displayName}`
			const favoriteAction: UIAction = {
				id: 'toggle_favorite',
				label: favoriteLabel,
				icon: isFavorite ? <StarFilled /> : <StarOutlined />,
				enabled: !favoriteDisabled,
				run: () => toggleFavorite(key),
			}
			const useSelectionMenu = selectedCount > 1 && isSelected
			const menu = withContextMenuClassName(buildActionMenu(
				useSelectionMenu ? selectionContextMenuActions : [favoriteAction, { type: 'divider' }, ...getObjectActions(key, object.size)],
				isAdvanced,
			))
			const canShowThumbnail = showThumbnails && profileId && bucket && isThumbnailKey(key)
			const buttonMenuOpen =
				contextMenuState.open &&
				contextMenuState.kind === 'object' &&
				contextMenuState.key === key &&
				contextMenuState.source === 'button'

			return (
				<div key={key} className={gridStyles.gridCardShell} role="listitem">
					<div
						className={`${gridStyles.gridCard} ${isSelected ? gridStyles.gridCardSelected : ''}`}
						onClick={(event) => selectObjectFromPointerEvent(event, key)}
						onContextMenu={(event) => {
							event.preventDefault()
							event.stopPropagation()
							const point = recordContextMenuPoint(event)
							openObjectContextMenu(key, 'context', point)
						}}
						draggable={canDragDrop}
						onDragStart={(event) => onRowDragStartObjects(event, key)}
						onDragEnd={clearDndHover}
						data-objects-row="true"
						data-object-key={key}
						role="group"
						aria-label={`Object ${displayName}`}
					>
						<div className={gridStyles.gridCardTopRow}>
							<div className={gridStyles.gridCardCheckboxWrap}>
								<Checkbox
									checked={isSelected}
									onClick={(event) => {
										event.stopPropagation()
										selectObjectFromCheckboxEvent(event as unknown as ReactMouseEvent, key)
									}}
									aria-label={`Select ${displayName}`}
								/>
							</div>
							<div className={gridStyles.gridCardTopActions}>
								<Button
									size="small"
									type="text"
									className={gridStyles.gridCardIconButton}
									data-grid-favorite-action="true"
									icon={isFavorite ? <StarFilled className={listStyles.listRowFavoriteIcon} /> : <StarOutlined />}
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
											className={gridStyles.gridCardIconButton}
											icon={<EllipsisOutlined />}
											aria-label={`Object actions for ${displayName}`}
											aria-haspopup="menu"
											aria-expanded={buttonMenuOpen}
											title={`Object actions for ${displayName}`}
											onClick={(event) => {
												event.stopPropagation()
												toggle()
											}}
										/>
									)}
								</ObjectsMenuPopover>
							</div>
						</div>

						{isSelected ? <span className={gridStyles.gridCardSelectionMark} aria-hidden="true">✓</span> : null}
						<div className={gridStyles.gridCardMedia}>
							{canShowThumbnail ? (
								<button
									type="button"
									className={`${gridStyles.gridCardPreviewFrame} ${gridStyles.gridCardPreviewActionButton}`}
									aria-label={`Open large preview for ${key}`}
									title={`Open large preview for ${displayName}`}
									onClick={(event) => {
										event.stopPropagation()
										onOpenLargePreviewForKey(key)
									}}
								>
									<LazyObjectThumbnail
										api={api}
										apiToken={apiToken}
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
								</button>
							) : (
								<div className={gridStyles.gridCardMediaPlaceholder}>
									<FileOutlined className={gridStyles.gridCardFileIcon} />
									<Typography.Text type="secondary">{extensionLabel(key)}</Typography.Text>
								</div>
							)}
						</div>

						<div className={gridStyles.gridCardBody}>
							<button
								type="button"
								className={gridStyles.gridCardBodyButton}
								aria-label={`Select object ${displayName}`}
								aria-pressed={isSelected}
								onClick={(event) => {
									event.stopPropagation()
									selectObjectFromCheckboxEvent(event as unknown as ReactMouseEvent, key)
								}}
							>
								<Typography.Text className={gridStyles.gridCardTitle} title={key}>
									<span className={gridStyles.gridCardFullName}>{highlightText(displayName)}</span>
									<span className={gridStyles.gridCardCompactName} aria-hidden="true">
										{compactSplit < 0 ? highlightText(displayName) : <>
											<span className={gridStyles.gridCardNameHead}>{highlightText(compactName.slice(0, compactSplit))}</span>
											<span className={gridStyles.gridCardNameTail} dir="rtl"><bdi dir="auto">…{highlightText(compactName.slice(compactSplit + 1))}</bdi></span>
										</>}
									</span>
								</Typography.Text>
								<Typography.Text type="secondary" className={gridStyles.gridCardMetaLine} title={metaLabel}>
									{sizeLabel}
								</Typography.Text>
								<Typography.Text type="secondary" className={`${gridStyles.gridCardMetaLine} ${gridStyles.gridCardModified}`} title={timeLabel}>
									{timeLabel}
								</Typography.Text>
							</button>
						</div>
					</div>
				</div>
			)
		},
		[
			api,
			apiToken,
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
			objectCrudSupported,
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
