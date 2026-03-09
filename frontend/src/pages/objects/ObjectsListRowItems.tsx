import { memo, useCallback, useMemo } from 'react'
import type { DragEvent, MouseEvent, ReactNode } from 'react'
import type { MenuProps } from 'antd'

import type { APIClient } from '../../api/client'
import type { ObjectItem } from '../../api/types'
import type { PopoverOpenSource } from '../../components/PopoverSurface'
import type { ThumbnailCache } from '../../lib/thumbnailCache'
import { formatDateTime } from '../../lib/format'
import { formatBytes } from '../../lib/transfer'
import styles from './objects.module.css'
import type { UIActionOrDivider } from './objectsActions'
import { buildActionMenu } from './objectsActions'
import { COMPACT_LIST_THUMBNAIL_PX, WIDE_LIST_THUMBNAIL_PX } from './objectsPageConstants'
import { ObjectsObjectRow, ObjectsPrefixRow } from './ObjectsListRow'
import { ObjectThumbnail } from './ObjectThumbnail'
import { displayNameForKey, displayNameForPrefix, isThumbnailKey } from './objectsListUtils'
import type { ContextMenuMatch, ContextMenuPoint } from './useObjectsContextMenu'

type ObjectsPrefixRowItemProps = {
	prefixKey: string
	currentPrefix: string
	offset: number
	rowMinHeight: number
	listGridClassName: string
	isCompact: boolean
	canDragDrop: boolean
	highlightText: (value: string) => ReactNode
	isAdvanced: boolean
	getPrefixActions: (prefix: string) => UIActionOrDivider[]
	withContextMenuClassName: (menu: MenuProps) => MenuProps
	buttonMenuOpen: boolean
	recordContextMenuPoint: (event: MouseEvent) => ContextMenuPoint
	openPrefixContextMenu: (key: string, source: 'context' | 'button', point?: ContextMenuPoint) => void
	closeContextMenu: (match: ContextMenuMatch, reason?: string) => void
	onOpenPrefix: (prefix: string) => void
	onRowDragStartPrefix: (event: DragEvent, prefix: string) => void
	onRowDragEnd: () => void
	isDropTargetActive: boolean
	onDropTargetDragOver: (event: DragEvent, prefix: string) => void
	onDropTargetDragLeave: (event: DragEvent, prefix: string) => void
	onDropTargetDrop: (event: DragEvent, prefix: string) => void
}

export const ObjectsPrefixRowItem = memo(function ObjectsPrefixRowItem(props: ObjectsPrefixRowItemProps) {
	const {
		prefixKey,
		currentPrefix,
		offset,
		rowMinHeight,
		listGridClassName,
		isCompact,
		canDragDrop,
		highlightText,
		isAdvanced,
		getPrefixActions,
		withContextMenuClassName,
		buttonMenuOpen,
		recordContextMenuPoint,
		openPrefixContextMenu,
		closeContextMenu,
		onOpenPrefix,
		onRowDragStartPrefix,
		onRowDragEnd,
		isDropTargetActive,
		onDropTargetDragOver,
		onDropTargetDragLeave,
		onDropTargetDrop,
	} = props
	const displayName = useMemo(
		() => displayNameForPrefix(prefixKey, currentPrefix),
		[currentPrefix, prefixKey],
	)
	const menu = useMemo(
		() => {
			return withContextMenuClassName(buildActionMenu(getPrefixActions(prefixKey), isAdvanced))
		},
		[getPrefixActions, isAdvanced, prefixKey, withContextMenuClassName],
	)
	const handleButtonMenuOpenChange = useCallback(
		(open: boolean, info?: { source: PopoverOpenSource }) => {
			if (open) openPrefixContextMenu(prefixKey, 'button')
			else closeContextMenu({ key: prefixKey, kind: 'prefix', source: 'button' }, info?.source === 'menu' ? 'menu_item' : 'button_menu')
		},
		[closeContextMenu, openPrefixContextMenu, prefixKey],
	)
	const handleContextMenu = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			event.preventDefault()
			event.stopPropagation()
			const point = recordContextMenuPoint(event)
			openPrefixContextMenu(prefixKey, 'context', point)
		},
		[openPrefixContextMenu, prefixKey, recordContextMenuPoint],
	)
	const handleOpen = useCallback(() => onOpenPrefix(prefixKey), [onOpenPrefix, prefixKey])
	const handleDragStart = useCallback(
		(event: DragEvent) => onRowDragStartPrefix(event, prefixKey),
		[onRowDragStartPrefix, prefixKey],
	)
	const handleDropTargetDragOver = useCallback(
		(event: DragEvent<HTMLDivElement>) => onDropTargetDragOver(event, prefixKey),
		[onDropTargetDragOver, prefixKey],
	)
	const handleDropTargetDragLeave = useCallback(
		(event: DragEvent<HTMLDivElement>) => onDropTargetDragLeave(event, prefixKey),
		[onDropTargetDragLeave, prefixKey],
	)
	const handleDropTargetDrop = useCallback(
		(event: DragEvent<HTMLDivElement>) => onDropTargetDrop(event, prefixKey),
		[onDropTargetDrop, prefixKey],
	)

	return (
		<ObjectsPrefixRow
			prefixKey={prefixKey}
			offset={offset}
			rowMinHeight={rowMinHeight}
			listGridClassName={listGridClassName}
			isCompact={isCompact}
			canDragDrop={canDragDrop}
			displayName={displayName}
			highlightText={highlightText}
			menu={menu}
			buttonMenuOpen={buttonMenuOpen}
			onButtonMenuOpenChange={handleButtonMenuOpenChange}
			onContextMenu={handleContextMenu}
			onOpen={handleOpen}
			onDragStart={handleDragStart}
			onDragEnd={onRowDragEnd}
			isDropTargetActive={isDropTargetActive}
			onDropTargetDragOver={handleDropTargetDragOver}
			onDropTargetDragLeave={handleDropTargetDragLeave}
			onDropTargetDrop={handleDropTargetDrop}
		/>
	)
})

ObjectsPrefixRowItem.displayName = 'ObjectsPrefixRowItem'

type ObjectsObjectRowItemProps = {
	object: ObjectItem
	currentPrefix: string
	offset: number
	rowMinHeight: number
	listGridClassName: string
	isCompact: boolean
	canDragDrop: boolean
	highlightText: (value: string) => ReactNode
	isAdvanced: boolean
	getObjectActions: (key: string, size?: number) => UIActionOrDivider[]
	selectionContextMenuActions: UIActionOrDivider[]
	useSelectionMenu: boolean
	withContextMenuClassName: (menu: MenuProps) => MenuProps
	isSelected: boolean
	isFavorite: boolean
	favoriteDisabled: boolean
	buttonMenuOpen: boolean
	recordContextMenuPoint: (event: MouseEvent) => ContextMenuPoint
	openObjectContextMenu: (key: string, source: 'context' | 'button', point?: ContextMenuPoint) => void
	closeContextMenu: (match: ContextMenuMatch, reason?: string) => void
	onSelectObject: (event: MouseEvent, key: string) => void
	onSelectCheckbox: (event: MouseEvent, key: string) => void
	onOpenLargePreviewForKey: (key: string) => void
	onRowDragStartObjects: (event: DragEvent, key: string) => void
	onRowDragEnd: () => void
	onToggleFavorite: (key: string) => void
	api: APIClient
	profileId: string | null
	profileProvider?: string | null
	bucket: string
	showThumbnails: boolean
	thumbnailCache: ThumbnailCache
}

export const ObjectsObjectRowItem = memo(function ObjectsObjectRowItem(props: ObjectsObjectRowItemProps) {
	const {
		object,
		currentPrefix,
		offset,
		rowMinHeight,
		listGridClassName,
		isCompact,
		canDragDrop,
		highlightText,
		isAdvanced,
		getObjectActions,
		selectionContextMenuActions,
		useSelectionMenu,
		isSelected,
		isFavorite,
		favoriteDisabled,
		buttonMenuOpen,
		recordContextMenuPoint,
		openObjectContextMenu,
		closeContextMenu,
		onSelectObject,
		onSelectCheckbox,
		onOpenLargePreviewForKey,
		onRowDragStartObjects,
		onRowDragEnd,
		onToggleFavorite,
		api,
		profileId,
		bucket,
		showThumbnails,
		thumbnailCache,
		withContextMenuClassName,
	} = props
	const displayName = useMemo(
		() => displayNameForKey(object.key, currentPrefix),
		[currentPrefix, object.key],
	)
	const sizeLabel = useMemo(() => formatBytes(object.size), [object.size])
	const timeLabel = useMemo(() => formatDateTime(object.lastModified), [object.lastModified])
	const thumbnailSize = isCompact ? COMPACT_LIST_THUMBNAIL_PX : WIDE_LIST_THUMBNAIL_PX
	const canShowThumbnail = showThumbnails && isThumbnailKey(object.key)
	const thumbnail =
		canShowThumbnail && profileId && bucket ? (
			<ObjectThumbnail
				key={`${bucket}:${object.key}:${thumbnailSize}`}
				api={api}
				profileId={profileId}
				bucket={bucket}
				objectKey={object.key}
				size={thumbnailSize}
				cache={thumbnailCache}
				cacheKeySuffix={object.etag || object.lastModified || undefined}
			/>
		) : null

	const menu = useMemo(() => {
		const actions = useSelectionMenu ? selectionContextMenuActions : getObjectActions(object.key, object.size)
		return withContextMenuClassName(buildActionMenu(actions, isAdvanced))
	}, [
		object.key,
		object.size,
		getObjectActions,
		isAdvanced,
		selectionContextMenuActions,
		useSelectionMenu,
		withContextMenuClassName,
	])
	const handleButtonMenuOpenChange = useCallback(
		(open: boolean, info?: { source: PopoverOpenSource }) => {
			if (open) openObjectContextMenu(object.key, 'button')
			else closeContextMenu({ key: object.key, kind: 'object', source: 'button' }, info?.source === 'menu' ? 'menu_item' : 'button_menu')
		},
		[closeContextMenu, object.key, openObjectContextMenu],
	)
	const handleContextMenu = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			event.preventDefault()
			event.stopPropagation()
			const point = recordContextMenuPoint(event)
			openObjectContextMenu(object.key, 'context', point)
		},
		[object.key, openObjectContextMenu, recordContextMenuPoint],
	)
	const handleClick = useCallback((event: MouseEvent) => onSelectObject(event, object.key), [object.key, onSelectObject])
	const handleCheckboxClick = useCallback(
		(event: MouseEvent) => onSelectCheckbox(event, object.key),
		[object.key, onSelectCheckbox],
	)
	const handleOpenLargePreview = useCallback(
		(event: MouseEvent) => {
			event.preventDefault()
			event.stopPropagation()
			onOpenLargePreviewForKey(object.key)
		},
		[object.key, onOpenLargePreviewForKey],
	)
	const handleDragStart = useCallback(
		(event: DragEvent) => onRowDragStartObjects(event, object.key),
		[object.key, onRowDragStartObjects],
	)
	const handleToggleFavorite = useCallback(
		() => onToggleFavorite(object.key),
		[object.key, onToggleFavorite],
	)

	return (
		<ObjectsObjectRow
			offset={offset}
			rowMinHeight={rowMinHeight}
			listGridClassName={listGridClassName}
			isCompact={isCompact}
			canDragDrop={canDragDrop}
			objectKey={object.key}
			displayName={displayName}
			sizeLabel={sizeLabel}
			timeLabel={timeLabel}
			isSelected={isSelected}
			isFavorite={isFavorite}
			favoriteDisabled={favoriteDisabled}
			highlightText={highlightText}
			menu={menu}
			buttonMenuOpen={buttonMenuOpen}
			onButtonMenuOpenChange={handleButtonMenuOpenChange}
			onClick={handleClick}
			onContextMenu={handleContextMenu}
			onCheckboxClick={handleCheckboxClick}
			onDragStart={handleDragStart}
			onDragEnd={onRowDragEnd}
			onToggleFavorite={handleToggleFavorite}
			thumbnail={
				thumbnail ? (
					<button
						type="button"
						className={styles.listThumbnailButton}
						onClick={handleOpenLargePreview}
						aria-label={`Open large preview for ${object.key}`}
					>
						{thumbnail}
					</button>
				) : undefined
			}
		/>
	)
})

ObjectsObjectRowItem.displayName = 'ObjectsObjectRowItem'
