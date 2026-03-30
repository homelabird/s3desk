import type { DragEvent, MouseEvent, ReactNode } from 'react'
import type { MenuProps } from 'antd'

import type { APIClient } from '../../api/client'
import type { ThumbnailCache } from '../../lib/thumbnailCache'
import type { UIActionOrDivider } from './objectsActions'
import type { ContextMenuMatch, ContextMenuPoint, ContextMenuState } from './objectsContextMenuTypes'

export type UseObjectsGridRenderersArgs = {
	api: APIClient
	apiToken: string
	profileId: string | null
	profileProvider?: string | null
	bucket: string
	prefix: string
	canDragDrop: boolean
	isAdvanced: boolean
	isOffline: boolean
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
	onOpenLargePreviewForKey: (key: string) => void
	onRowDragStartPrefix: (event: DragEvent, prefix: string) => void
	onRowDragStartObjects: (event: DragEvent, key: string) => void
	dndHoverPrefix: string | null
	normalizeDropTargetPrefix: (raw: string) => string
	onDndTargetDragOver: (event: DragEvent, targetPrefixRaw: string) => void
	onDndTargetDragLeave: (event: DragEvent, targetPrefixRaw: string) => void
	onDndTargetDrop: (event: DragEvent, targetPrefixRaw: string) => void
	clearDndHover: () => void
	selectObjectFromPointerEvent: (event: MouseEvent, key: string) => void
	selectObjectFromCheckboxEvent: (event: MouseEvent, key: string) => void
	selectedCount: number
	selectedKeys: Set<string>
	favoriteKeys: Set<string>
	favoritePendingKeys: Set<string>
	toggleFavorite: (key: string) => void
}
