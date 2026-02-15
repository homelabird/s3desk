import { useCallback } from 'react'
import type { DragEvent, MouseEvent, ReactNode, RefObject } from 'react'
import type { MenuProps } from 'antd'

import type { APIClient } from '../../api/client'
import type { ObjectItem } from '../../api/types'
import type { ThumbnailCache } from '../../lib/thumbnailCache'
import { ObjectsObjectRowItem, ObjectsPrefixRowItem } from './ObjectsListRowItems'
import type { UIActionOrDivider } from './objectsActions'
import type { ContextMenuMatch, ContextMenuPoint, ContextMenuState } from './useObjectsContextMenu'

type UseObjectsRowRenderersArgs = {
	api: APIClient
	profileId: string | null
	bucket: string
	prefix: string
	canDragDrop: boolean
	isCompactList: boolean
	isAdvanced: boolean
	isOffline: boolean
	listGridClassName: string
	rowHeightCompactPx: number
	rowHeightWidePx: number
	showThumbnails: boolean
	thumbnailCache: ThumbnailCache
	highlightText: (value: string) => ReactNode
	contextMenuState: ContextMenuState
	withContextMenuClassName: (menu: MenuProps) => MenuProps
	getPrefixActions: (prefix: string) => UIActionOrDivider[]
	getObjectActions: (key: string, size?: number) => UIActionOrDivider[]
	selectionContextMenuActions: UIActionOrDivider[]
	recordContextMenuPoint: (event: MouseEvent) => ContextMenuPoint
	openPrefixContextMenu: (key: string, source: 'context' | 'button', point?: ContextMenuPoint) => void
	openObjectContextMenu: (key: string, source: 'context' | 'button', point?: ContextMenuPoint) => void
	closeContextMenu: (match?: ContextMenuMatch, reason?: string) => void
	onOpenPrefix: (prefix: string) => void
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

export function useObjectsRowRenderers({
	api,
	profileId,
	bucket,
	prefix,
	canDragDrop,
	isCompactList,
	isAdvanced,
	isOffline,
	listGridClassName,
	rowHeightCompactPx,
	rowHeightWidePx,
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
}: UseObjectsRowRenderersArgs) {
	const getContextMenuPopupContainer = useCallback((triggerNode: HTMLElement) => {
		if (scrollContainerRef.current) return scrollContainerRef.current
		if (typeof document !== 'undefined') return document.body
		return triggerNode
	}, [scrollContainerRef])

	const handleListScrollerScroll = useCallback(() => {
		closeContextMenu(undefined, 'list_scroll')
	}, [closeContextMenu])

	const handleListScrollerWheel = useCallback(() => {
		closeContextMenu(undefined, 'list_wheel')
	}, [closeContextMenu])

	const renderPrefixRow = useCallback(
		(prefixKey: string, offset: number) => {
			const prefixButtonMenuOpen =
				contextMenuState.open &&
				contextMenuState.kind === 'prefix' &&
				contextMenuState.key === prefixKey &&
				contextMenuState.source === 'button'
			return (
				<ObjectsPrefixRowItem
					key={prefixKey}
					prefixKey={prefixKey}
					currentPrefix={prefix}
					offset={offset}
					rowMinHeight={isCompactList ? rowHeightCompactPx : rowHeightWidePx}
					listGridClassName={listGridClassName}
					isCompact={isCompactList}
					canDragDrop={canDragDrop}
					highlightText={highlightText}
					isAdvanced={isAdvanced}
					getPrefixActions={getPrefixActions}
					withContextMenuClassName={withContextMenuClassName}
					buttonMenuOpen={prefixButtonMenuOpen}
					getPopupContainer={getContextMenuPopupContainer}
					recordContextMenuPoint={recordContextMenuPoint}
					openPrefixContextMenu={openPrefixContextMenu}
					closeContextMenu={closeContextMenu}
					onOpenPrefix={onOpenPrefix}
					onRowDragStartPrefix={onRowDragStartPrefix}
					onRowDragEnd={clearDndHover}
				/>
			)
		},
		[
			canDragDrop,
			clearDndHover,
			closeContextMenu,
			contextMenuState.key,
			contextMenuState.kind,
			contextMenuState.open,
			contextMenuState.source,
			getContextMenuPopupContainer,
			getPrefixActions,
			highlightText,
			isAdvanced,
			isCompactList,
			listGridClassName,
			onOpenPrefix,
			onRowDragStartPrefix,
			openPrefixContextMenu,
			prefix,
			recordContextMenuPoint,
			rowHeightCompactPx,
			rowHeightWidePx,
			withContextMenuClassName,
		],
	)

	const renderObjectRow = useCallback(
		(object: ObjectItem, offset: number) => {
			const key = object.key
			const objectButtonMenuOpen =
				contextMenuState.open &&
				contextMenuState.kind === 'object' &&
				contextMenuState.key === key &&
				contextMenuState.source === 'button'
			const useSelectionMenu = selectedCount > 1 && selectedKeys.has(key)
			return (
				<ObjectsObjectRowItem
					key={key}
					object={object}
					currentPrefix={prefix}
					offset={offset}
					rowMinHeight={isCompactList ? rowHeightCompactPx : rowHeightWidePx}
					listGridClassName={listGridClassName}
					isCompact={isCompactList}
					canDragDrop={canDragDrop}
					highlightText={highlightText}
					isAdvanced={isAdvanced}
					getObjectActions={getObjectActions}
					selectionContextMenuActions={selectionContextMenuActions}
					useSelectionMenu={useSelectionMenu}
					withContextMenuClassName={withContextMenuClassName}
					isSelected={selectedKeys.has(key)}
					isFavorite={favoriteKeys.has(key)}
					favoriteDisabled={favoritePendingKeys.has(key) || isOffline || !profileId || !bucket}
					buttonMenuOpen={objectButtonMenuOpen}
					getPopupContainer={getContextMenuPopupContainer}
					recordContextMenuPoint={recordContextMenuPoint}
					openObjectContextMenu={openObjectContextMenu}
					closeContextMenu={closeContextMenu}
					onSelectObject={selectObjectFromPointerEvent}
					onSelectCheckbox={selectObjectFromCheckboxEvent}
					onRowDragStartObjects={onRowDragStartObjects}
					onRowDragEnd={clearDndHover}
					onToggleFavorite={toggleFavorite}
					api={api}
					profileId={profileId}
					bucket={bucket}
					showThumbnails={showThumbnails}
					thumbnailCache={thumbnailCache}
				/>
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
			getContextMenuPopupContainer,
			getObjectActions,
			highlightText,
			isAdvanced,
			isCompactList,
			isOffline,
			listGridClassName,
			onRowDragStartObjects,
			openObjectContextMenu,
			prefix,
			profileId,
			recordContextMenuPoint,
			rowHeightCompactPx,
			rowHeightWidePx,
			selectedCount,
			selectedKeys,
			selectionContextMenuActions,
			selectObjectFromCheckboxEvent,
			selectObjectFromPointerEvent,
			showThumbnails,
			thumbnailCache,
			toggleFavorite,
			withContextMenuClassName,
		],
	)

	return {
		handleListScrollerScroll,
		handleListScrollerWheel,
		renderPrefixRow,
		renderObjectRow,
	}
}
