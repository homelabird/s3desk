import { ExpandOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import type { MenuProps } from 'antd'
import { memo, useCallback, useMemo } from 'react'
import type { DragEvent, MouseEvent, ReactNode } from 'react'

import type { APIClientShape } from '../../api/client'
import type { ObjectItem } from '../../api/types'
import type { PopoverOpenSource } from '../../components/PopoverSurface'
import { formatDateTime } from '../../lib/format'
import type { ThumbnailCache } from '../../lib/thumbnailCache'
import { formatBytes } from '../../lib/transfer'
import { LazyObjectThumbnail } from './ObjectThumbnailLazy'
import { ObjectsObjectRow } from './ObjectsListRow'
import thumbnailStyles from './ObjectsThumbnailPrimitives.module.css'
import type { UIActionOrDivider } from './objectsActions'
import { buildActionMenu } from './objectsActions'
import { COMPACT_LIST_THUMBNAIL_PX, WIDE_LIST_THUMBNAIL_PX } from './objectsPageConstants'
import { displayNameForKey, isThumbnailKey } from './objectsListUtils'
import type { ContextMenuMatch, ContextMenuPoint } from './useObjectsContextMenu'

type ObjectsObjectRowItemProps = {
	object: ObjectItem
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
	api: APIClientShape
	apiToken: string
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
		apiToken,
		profileId,
		bucket,
		showThumbnails,
		thumbnailCache,
		withContextMenuClassName,
	} = props
	const displayName = useMemo(() => displayNameForKey(object.key, currentPrefix), [currentPrefix, object.key])
	const sizeLabel = useMemo(() => formatBytes(object.size), [object.size])
	const timeLabel = useMemo(() => formatDateTime(object.lastModified), [object.lastModified])
	const thumbnailSize = isCompact ? COMPACT_LIST_THUMBNAIL_PX : WIDE_LIST_THUMBNAIL_PX
	const canShowThumbnail = showThumbnails && isThumbnailKey(object.key)
	const thumbnail =
		canShowThumbnail && profileId && bucket ? (
			<LazyObjectThumbnail
				key={`${bucket}:${object.key}:${thumbnailSize}`}
				api={api}
				apiToken={apiToken}
				profileId={profileId}
				bucket={bucket}
				objectKey={object.key}
				size={thumbnailSize}
				cache={thumbnailCache}
				cacheKeySuffix={object.etag || object.lastModified || undefined}
				objectSize={object.size}
				etag={object.etag || undefined}
				lastModified={object.lastModified || undefined}
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
	const handleCheckboxClick = useCallback((event: MouseEvent) => onSelectCheckbox(event, object.key), [object.key, onSelectCheckbox])
	const handleOpenLargePreview = useCallback(
		(event: MouseEvent) => {
			event.preventDefault()
			event.stopPropagation()
			onOpenLargePreviewForKey(object.key)
		},
		[object.key, onOpenLargePreviewForKey],
	)
	const handleDragStart = useCallback((event: DragEvent) => onRowDragStartObjects(event, object.key), [object.key, onRowDragStartObjects])
	const handleToggleFavorite = useCallback(() => onToggleFavorite(object.key), [object.key, onToggleFavorite])

	return (
		<ObjectsObjectRow
			offset={offset}
			rowMinHeight={rowMinHeight}
			virtualRowIndex={props.virtualRowIndex}
			measureElement={props.measureElement}
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
			thumbnail={thumbnail ? <div className={thumbnailStyles.listThumbnailFrame}>{thumbnail}</div> : undefined}
			previewAction={
				thumbnail ? (
					<Button
						size="small"
						type="text"
						icon={<ExpandOutlined />}
						onClick={handleOpenLargePreview}
						aria-label={`Open large preview for ${object.key}`}
					>
						Preview
					</Button>
				) : undefined
			}
		/>
	)
})

ObjectsObjectRowItem.displayName = 'ObjectsObjectRowItem'
