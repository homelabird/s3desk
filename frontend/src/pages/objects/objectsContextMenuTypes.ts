import type { CSSProperties, RefObject } from 'react'
import type { MenuProps } from 'antd'

import type { ObjectItem } from '../../api/types'
import type { UIAction, UIActionOrDivider } from './objectsActions'

export type ContextMenuSource = 'context' | 'button'
export type ContextMenuKind = 'object' | 'prefix' | 'list'

export type ContextMenuState = {
	open: boolean
	source: ContextMenuSource | null
	kind: ContextMenuKind | null
	key: string | null
}

export type ContextMenuPoint = {
	x: number
	y: number
}

export type ContextMenuMatch = {
	source: ContextMenuSource
	kind: ContextMenuKind
	key: string
}

export type LogFn = (enabled: boolean, message: string, context?: Record<string, unknown>) => void
export type WithContextMenuClassName = (menu: MenuProps) => MenuProps

export type UseObjectsContextMenuArgs = {
	scopeKey: string
	debugEnabled: boolean
	log: LogFn
	listScrollerEl: HTMLDivElement | null
	scrollContainerRef: RefObject<HTMLDivElement | null>
	selectedCount: number
	objectByKey: Map<string, ObjectItem>
	selectedKeys: Set<string>
	getObjectActions: (key: string, size?: number) => UIActionOrDivider[]
	getPrefixActions: (prefix: string) => UIActionOrDivider[]
	selectionContextMenuActions: UIActionOrDivider[]
	globalActionMap: Map<string, UIAction>
	selectionActionMap: Map<string, UIAction>
	isAdvanced: boolean
	ensureObjectSelected: (key: string) => void
}

export type ObjectsContextMenuOverlayState = {
	contextMenuClassName: string
	contextMenuRef: RefObject<HTMLDivElement | null>
	contextMenuVisible: boolean
	contextMenuProps: MenuProps | null
	contextMenuStyle: CSSProperties | null
	getListScrollerElement: () => HTMLDivElement | null
	handleListScrollerContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void
}
