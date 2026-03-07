import { useCallback } from 'react'
import type { DragEvent, KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react'
import { Button, Checkbox, Dropdown, Tooltip, Typography } from 'antd'
import { EllipsisOutlined, FileOutlined, FolderOutlined, StarFilled, StarOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'

import type { APIClient } from '../../api/client'
import type { ObjectItem } from '../../api/types'
import type { ThumbnailCache } from '../../lib/thumbnailCache'
import { formatDateTime } from '../../lib/format'
import { formatBytes } from '../../lib/transfer'
import styles from './objects.module.css'
import { ObjectThumbnail } from './ObjectThumbnail'
import type { UIActionOrDivider } from './objectsActions'
import { buildActionMenu } from './objectsActions'
import { GRID_CARD_THUMBNAIL_PX } from './objectsPageConstants'
import {
	displayNameForKey,
	displayNameForPrefix,
	fileExtensionFromKey,
	isThumbnailKey,
} from './objectsListUtils'
import type { ContextMenuPoint } from './useObjectsContextMenu'

type UseObjectsGridRenderersArgs = {
	api: APIClient
	profileId: string | null
	bucket: string
	prefix: string
	canDragDrop: boolean
	isAdvanced: boolean
	isOffline: boolean
	showThumbnails: boolean
	thumbnailCache: ThumbnailCache
	highlightText: (value: string) => ReactNode
	withContextMenuClassName: (menu: MenuProps) => MenuProps
	getPrefixActions: (prefix: string) => UIActionOrDivider[]
	getObjectActions: (key: string, size?: number) => UIActionOrDivider[]
	selectionContextMenuActions: UIActionOrDivider[]
	recordContextMenuPoint: (event: MouseEvent) => ContextMenuPoint
	openPrefixContextMenu: (key: string, source: 'context' | 'button', point?: ContextMenuPoint) => void
	openObjectContextMenu: (key: string, source: 'context' | 'button', point?: ContextMenuPoint) => void
	onOpenPrefix: (prefix: string) => void
	onOpenLargePreviewForKey: (key: string) => void
	onRowDragStartPrefix: (event: DragEvent, prefix: string) => void
	onRowDragStartObjects: (event: DragEvent, key: string) => void
	clearDndHover: () => void
	selectObjectFromPointerEvent: (event: MouseEvent, key: string) => void
	selectObjectFromCheckboxEvent: (event: MouseEvent, key: string) => void
	selectedCount: number
	selectedKeys: Set<string>
	favoriteKeys: Set<string>
	favoritePendingKeys: Set<string>
	toggleFavorite: (key: string) => void
	scrollContainerRef: RefObject<HTMLDivElement | null>
}

function onActivateFromKeyboard(event: KeyboardEvent<HTMLDivElement>, onActivate: () => void) {
	if (event.key !== 'Enter' && event.key !== ' ') return
	event.preventDefault()
	onActivate()
}

function extensionLabel(key: string): string {
	const ext = fileExtensionFromKey(key)
	return ext ? ext.toUpperCase() : 'FILE'
}

export function useObjectsGridRenderers({
	api,
	profileId,
	bucket,
	prefix,
	canDragDrop,
	isAdvanced,
	isOffline,
	showThumbnails,
	thumbnailCache,
	highlightText,
	withContextMenuClassName,
	getPrefixActions,
	getObjectActions,
	selectionContextMenuActions,
	recordContextMenuPoint,
	openPrefixContextMenu,
	openObjectContextMenu,
	onOpenPrefix,
	onOpenLargePreviewForKey,
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
}: UseObjectsGridRenderersArgs) {
	const getPopupContainer = useCallback(
		(triggerNode: HTMLElement) => {
			if (scrollContainerRef.current) return scrollContainerRef.current
			if (typeof document !== 'undefined') return document.body
			return triggerNode
		},
		[scrollContainerRef],
	)

	const renderPrefixGridItem = useCallback(
		(prefixKey: string) => {
			const displayName = displayNameForPrefix(prefixKey, prefix)
			const menu = withContextMenuClassName(buildActionMenu(getPrefixActions(prefixKey), isAdvanced))
			return (
				<div key={prefixKey} className={styles.gridCardShell} role="listitem">
					<div
						className={styles.gridCard}
						onClick={() => onOpenPrefix(prefixKey)}
						onContextMenu={(event) => {
							event.preventDefault()
							event.stopPropagation()
							const point = recordContextMenuPoint(event)
							openPrefixContextMenu(prefixKey, 'context', point)
						}}
						onKeyDown={(event) => onActivateFromKeyboard(event, () => onOpenPrefix(prefixKey))}
						draggable={canDragDrop}
						onDragStart={(event) => onRowDragStartPrefix(event, prefixKey)}
						onDragEnd={clearDndHover}
						data-objects-row="true"
						role="button"
						tabIndex={0}
					>
						<div className={styles.gridCardTopRow}>
							<div className={styles.gridCardTopActions}>
								<Typography.Text type="secondary">Folder</Typography.Text>
							</div>
							<Dropdown menu={menu} trigger={['click']} getPopupContainer={getPopupContainer}>
								<Button
									size="small"
									type="text"
									icon={<EllipsisOutlined />}
									aria-label="Prefix actions"
									onClick={(event) => {
										event.stopPropagation()
										openPrefixContextMenu(prefixKey, 'button')
									}}
								/>
							</Dropdown>
						</div>
						<div className={`${styles.gridCardMedia} ${styles.gridCardMediaFolder}`}>
							<FolderOutlined className={styles.gridCardFolderIcon} />
						</div>
						<div className={styles.gridCardBody}>
							<Tooltip title={prefixKey}>
								<Typography.Text className={styles.gridCardTitle}>{highlightText(displayName)}</Typography.Text>
							</Tooltip>
							<Typography.Text type="secondary" className={styles.gridCardMetaLine}>
								Open folder
							</Typography.Text>
						</div>
					</div>
				</div>
			)
		},
		[
			canDragDrop,
			clearDndHover,
			getPopupContainer,
			getPrefixActions,
			highlightText,
			isAdvanced,
			onOpenPrefix,
			onRowDragStartPrefix,
			openPrefixContextMenu,
			prefix,
			recordContextMenuPoint,
			withContextMenuClassName,
		],
	)

	const renderObjectGridItem = useCallback(
		(object: ObjectItem) => {
			const key = object.key
			const displayName = displayNameForKey(key, prefix)
			const sizeLabel = formatBytes(object.size)
			const timeLabel = formatDateTime(object.lastModified)
			const useSelectionMenu = selectedCount > 1 && selectedKeys.has(key)
			const actions = useSelectionMenu ? selectionContextMenuActions : getObjectActions(key, object.size)
			const menu = withContextMenuClassName(buildActionMenu(actions, isAdvanced))
			const canShowThumbnail = showThumbnails && profileId && bucket && isThumbnailKey(key)
			const isSelected = selectedKeys.has(key)
			const isFavorite = favoriteKeys.has(key)
			const favoriteDisabled = favoritePendingKeys.has(key) || isOffline || !profileId || !bucket

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
								selectObjectFromPointerEvent(event as unknown as MouseEvent, key),
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
										selectObjectFromCheckboxEvent(event as unknown as MouseEvent, key)
									}}
									aria-label={`Select ${displayName}`}
								/>
							</div>
							<div className={styles.gridCardTopActions}>
								<Tooltip title={isFavorite ? 'Remove favorite' : 'Add favorite'}>
									<Button
										size="small"
										type="text"
										icon={isFavorite ? <StarFilled className={styles.listRowFavoriteIcon} /> : <StarOutlined />}
										disabled={favoriteDisabled}
										aria-label={isFavorite ? 'Remove favorite' : 'Add favorite'}
										onClick={(event) => {
											event.stopPropagation()
											toggleFavorite(key)
										}}
									/>
								</Tooltip>
								<Dropdown menu={menu} trigger={['click']} getPopupContainer={getPopupContainer}>
									<Button
										size="small"
										type="text"
										icon={<EllipsisOutlined />}
										aria-label="Object actions"
										onClick={(event) => {
											event.stopPropagation()
											openObjectContextMenu(key, 'button')
										}}
									/>
								</Dropdown>
							</div>
						</div>

						<div className={styles.gridCardMedia}>
							{canShowThumbnail ? (
								<button
									type="button"
									className={styles.gridCardPreviewButton}
									onClick={(event) => {
										event.preventDefault()
										event.stopPropagation()
										onOpenLargePreviewForKey(key)
									}}
									aria-label={`Open large preview for ${key}`}
								>
									<ObjectThumbnail
										api={api}
										profileId={profileId}
										bucket={bucket}
										objectKey={key}
										size={GRID_CARD_THUMBNAIL_PX}
										cache={thumbnailCache}
										cacheKeySuffix={object.etag || object.lastModified || undefined}
									/>
								</button>
							) : (
								<div className={styles.gridCardMediaPlaceholder}>
									<FileOutlined className={styles.gridCardFileIcon} />
									<Typography.Text type="secondary">{extensionLabel(key)}</Typography.Text>
								</div>
							)}
						</div>

						<div className={styles.gridCardBody}>
							<Tooltip title={key}>
								<Typography.Text className={styles.gridCardTitle}>{highlightText(displayName)}</Typography.Text>
							</Tooltip>
							<Typography.Text type="secondary" className={styles.gridCardMetaLine}>
								{sizeLabel}
							</Typography.Text>
							<Typography.Text type="secondary" className={styles.gridCardMetaLine}>
								{timeLabel}
							</Typography.Text>
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
			favoriteKeys,
			favoritePendingKeys,
			getObjectActions,
			getPopupContainer,
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

	return {
		renderPrefixGridItem,
		renderObjectGridItem,
	}
}
