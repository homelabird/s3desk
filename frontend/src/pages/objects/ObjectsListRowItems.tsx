import { memo, useCallback, useMemo } from 'react'
import type { DragEvent, MouseEvent, ReactNode } from 'react'
import type { MenuProps } from 'antd'

import type { APIClient } from '../../api/client'
import type { ObjectItem } from '../../api/types'
import type { ThumbnailCache } from '../../lib/thumbnailCache'
import { formatDateTime } from '../../lib/format'
import { formatBytes } from '../../lib/transfer'
import type { UIActionOrDivider } from './objectsActions'
import { buildActionMenu } from './objectsActions'
import { ObjectsObjectRow, ObjectsPrefixRow } from './ObjectsListRow'
import { ObjectThumbnail } from './ObjectThumbnail'
import { displayNameForKey, displayNameForPrefix, isImageKey } from './objectsListUtils'
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
	getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement
	recordContextMenuPoint: (event: MouseEvent) => ContextMenuPoint
	openPrefixContextMenu: (key: string, source: 'context' | 'button', point?: ContextMenuPoint) => void
	closeContextMenu: (match: ContextMenuMatch, reason?: string) => void
	onOpenPrefix: (prefix: string) => void
	onRowDragStartPrefix: (event: DragEvent, prefix: string) => void
	onRowDragEnd: () => void
}

export const ObjectsPrefixRowItem = memo(function ObjectsPrefixRowItem(props: ObjectsPrefixRowItemProps) {
	const displayName = useMemo(
		() => displayNameForPrefix(props.prefixKey, props.currentPrefix),
		[props.currentPrefix, props.prefixKey],
	)
	const menu = useMemo(
		() => props.withContextMenuClassName(buildActionMenu(props.getPrefixActions(props.prefixKey), props.isAdvanced)),
		[props.getPrefixActions, props.isAdvanced, props.prefixKey, props.withContextMenuClassName],
	)
	const handleButtonMenuOpenChange = useCallback(
		(open: boolean) => {
			if (open) props.openPrefixContextMenu(props.prefixKey, 'button')
			else props.closeContextMenu({ key: props.prefixKey, kind: 'prefix', source: 'button' }, 'button_menu')
		},
		[props.closeContextMenu, props.openPrefixContextMenu, props.prefixKey],
	)
	const handleContextMenu = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			event.preventDefault()
			event.stopPropagation()
			const point = props.recordContextMenuPoint(event)
			props.openPrefixContextMenu(props.prefixKey, 'context', point)
		},
		[props.openPrefixContextMenu, props.prefixKey, props.recordContextMenuPoint],
	)
	const handleOpen = useCallback(() => props.onOpenPrefix(props.prefixKey), [props.onOpenPrefix, props.prefixKey])
	const handleDragStart = useCallback(
		(event: DragEvent) => props.onRowDragStartPrefix(event, props.prefixKey),
		[props.onRowDragStartPrefix, props.prefixKey],
	)

	return (
		<ObjectsPrefixRow
			offset={props.offset}
			rowMinHeight={props.rowMinHeight}
			listGridClassName={props.listGridClassName}
			isCompact={props.isCompact}
			canDragDrop={props.canDragDrop}
			displayName={displayName}
			highlightText={props.highlightText}
			menu={menu}
			buttonMenuOpen={props.buttonMenuOpen}
			getPopupContainer={props.getPopupContainer}
			onButtonMenuOpenChange={handleButtonMenuOpenChange}
			onContextMenu={handleContextMenu}
			onOpen={handleOpen}
			onDragStart={handleDragStart}
			onDragEnd={props.onRowDragEnd}
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
	getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement
	recordContextMenuPoint: (event: MouseEvent) => ContextMenuPoint
	openObjectContextMenu: (key: string, source: 'context' | 'button', point?: ContextMenuPoint) => void
	closeContextMenu: (match: ContextMenuMatch, reason?: string) => void
	onSelectObject: (event: MouseEvent, key: string) => void
	onSelectCheckbox: (event: MouseEvent, key: string) => void
	onRowDragStartObjects: (event: DragEvent, key: string) => void
	onRowDragEnd: () => void
	onToggleFavorite: (key: string) => void
	api: APIClient
	profileId: string | null
	bucket: string
	showThumbnails: boolean
	thumbnailCache: ThumbnailCache
}

export const ObjectsObjectRowItem = memo(function ObjectsObjectRowItem(props: ObjectsObjectRowItemProps) {
	const { object } = props
	const displayName = useMemo(
		() => displayNameForKey(object.key, props.currentPrefix),
		[object.key, props.currentPrefix],
	)
	const sizeLabel = useMemo(() => formatBytes(object.size), [object.size])
	const timeLabel = useMemo(() => formatDateTime(object.lastModified), [object.lastModified])
	const thumbnailSize = props.isCompact ? 24 : 32
	const canShowThumbnail = props.showThumbnails && isImageKey(object.key)
	const thumbnail =
		canShowThumbnail && props.profileId && props.bucket ? (
			<ObjectThumbnail
				key={`${props.bucket}:${object.key}:${thumbnailSize}`}
				api={props.api}
				profileId={props.profileId}
				bucket={props.bucket}
				objectKey={object.key}
				size={thumbnailSize}
				cache={props.thumbnailCache}
				cacheKeySuffix={object.etag || object.lastModified || undefined}
			/>
		) : null

	const menu = useMemo(() => {
		const actions = props.useSelectionMenu ? props.selectionContextMenuActions : props.getObjectActions(object.key, object.size)
		return props.withContextMenuClassName(buildActionMenu(actions, props.isAdvanced))
	}, [
		object.key,
		object.size,
		props.getObjectActions,
		props.isAdvanced,
		props.selectionContextMenuActions,
		props.useSelectionMenu,
		props.withContextMenuClassName,
	])
	const handleButtonMenuOpenChange = useCallback(
		(open: boolean) => {
			if (open) props.openObjectContextMenu(object.key, 'button')
			else props.closeContextMenu({ key: object.key, kind: 'object', source: 'button' }, 'button_menu')
		},
		[object.key, props.closeContextMenu, props.openObjectContextMenu],
	)
	const handleContextMenu = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			event.preventDefault()
			event.stopPropagation()
			const point = props.recordContextMenuPoint(event)
			props.openObjectContextMenu(object.key, 'context', point)
		},
		[object.key, props.openObjectContextMenu, props.recordContextMenuPoint],
	)
	const handleClick = useCallback(
		(event: MouseEvent) => props.onSelectObject(event, object.key),
		[object.key, props.onSelectObject],
	)
	const handleCheckboxClick = useCallback(
		(event: MouseEvent) => props.onSelectCheckbox(event, object.key),
		[object.key, props.onSelectCheckbox],
	)
	const handleDragStart = useCallback(
		(event: DragEvent) => props.onRowDragStartObjects(event, object.key),
		[object.key, props.onRowDragStartObjects],
	)
	const handleToggleFavorite = useCallback(
		() => props.onToggleFavorite(object.key),
		[object.key, props.onToggleFavorite],
	)

	return (
		<ObjectsObjectRow
			offset={props.offset}
			rowMinHeight={props.rowMinHeight}
			listGridClassName={props.listGridClassName}
			isCompact={props.isCompact}
			canDragDrop={props.canDragDrop}
			objectKey={object.key}
			displayName={displayName}
			sizeLabel={sizeLabel}
			timeLabel={timeLabel}
			isSelected={props.isSelected}
			isFavorite={props.isFavorite}
			favoriteDisabled={props.favoriteDisabled}
			highlightText={props.highlightText}
			menu={menu}
			buttonMenuOpen={props.buttonMenuOpen}
			getPopupContainer={props.getPopupContainer}
			onButtonMenuOpenChange={handleButtonMenuOpenChange}
			onClick={handleClick}
			onContextMenu={handleContextMenu}
			onCheckboxClick={handleCheckboxClick}
			onDragStart={handleDragStart}
			onDragEnd={props.onRowDragEnd}
			onToggleFavorite={handleToggleFavorite}
			thumbnail={thumbnail}
		/>
	)
})

ObjectsObjectRowItem.displayName = 'ObjectsObjectRowItem'
