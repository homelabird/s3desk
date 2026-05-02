import { memo, useCallback, useMemo } from 'react'
import type { DragEvent, MouseEvent, ReactNode } from 'react'
import type { MenuProps } from 'antd'

import type { PopoverOpenSource } from '../../components/PopoverSurface'
import type { UIActionOrDivider } from './objectsActions'
import { buildActionMenu } from './objectsActions'
import { ObjectsPrefixRow } from './ObjectsListRow'
import { displayNameForPrefix } from './objectsListUtils'
import type { ContextMenuMatch, ContextMenuPoint } from './useObjectsContextMenu'

type ObjectsPrefixRowItemProps = {
	prefixKey: string
	currentPrefix: string
	offset: number
	rowMinHeight: number
	virtualRowIndex?: number
	measureElement?: (element: HTMLDivElement | null) => void
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
	const displayName = useMemo(() => displayNameForPrefix(prefixKey, currentPrefix), [currentPrefix, prefixKey])
	const menu = useMemo(() => {
		return withContextMenuClassName(buildActionMenu(getPrefixActions(prefixKey), isAdvanced))
	}, [getPrefixActions, isAdvanced, prefixKey, withContextMenuClassName])
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
	const handleDragStart = useCallback((event: DragEvent) => onRowDragStartPrefix(event, prefixKey), [onRowDragStartPrefix, prefixKey])
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
			virtualRowIndex={props.virtualRowIndex}
			measureElement={props.measureElement}
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
