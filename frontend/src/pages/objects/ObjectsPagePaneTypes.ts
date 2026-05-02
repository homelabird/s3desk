import type { MenuProps } from 'antd'
import type {
	CSSProperties,
	DragEvent,
	KeyboardEvent,
	MouseEvent,
	Ref,
	UIEvent,
	WheelEvent,
} from 'react'

import type { ObjectsLayoutProps } from './ObjectsLayout'

type ObjectsTreeSectionProps = Parameters<typeof import('./ObjectsTreeSection').ObjectsTreeSection>[0]
type ObjectsListControlsProps = Parameters<typeof import('./ObjectsListControls').ObjectsListControls>[0]
type ObjectsListContentProps = Parameters<typeof import('./ObjectsListContent').ObjectsListContent>[0]
type ObjectsSelectionBarSectionProps = Parameters<typeof import('./ObjectsSelectionBarSection').ObjectsSelectionBarSection>[0]
type ObjectsListHeaderProps = Parameters<typeof import('./ObjectsListHeader').ObjectsListHeader>[0]
type ObjectsDetailsPanelSectionProps = Parameters<typeof import('./ObjectsDetailsPanelSection').ObjectsDetailsPanelSection>[0]

type ContextMenuPortalProps = {
	contextMenuClassName: string
	contextMenuRef: Ref<HTMLDivElement>
	contextMenuVisible: boolean
	contextMenuProps: MenuProps | null
	contextMenuStyle: CSSProperties | null
}

type ObjectsListPaneProps = {
	controlsProps: ObjectsListControlsProps
	isOffline: boolean
	favoritesOnly: boolean
	favoritesErrorMessage: string | null
	objectsErrorMessage: string | null
	hasBucket: boolean
	uploadDropActive: boolean
	uploadDropLabel: string
	onUploadDragEnter: (e: DragEvent) => void
	onUploadDragLeave: (e: DragEvent) => void
	onUploadDragOver: (e: DragEvent) => void
	onUploadDrop: (e: DragEvent) => void
	selectionBarProps: ObjectsSelectionBarSectionProps
	listHeaderProps: ObjectsListHeaderProps
	listScrollerRef: Ref<HTMLDivElement>
	listScrollerTabIndex?: number
	onListScrollerClick?: (e: MouseEvent<HTMLDivElement>) => void
	onListScrollerKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
	onListScrollerScroll?: (e: UIEvent<HTMLDivElement>) => void
	onListScrollerWheel?: (e: WheelEvent<HTMLDivElement>) => void
	onListScrollerContextMenu?: (e: MouseEvent<HTMLDivElement>) => void
	contentProps: ObjectsListContentProps
}

export type ObjectsPagePanesProps = {
	layoutRef: Ref<HTMLDivElement>
	layoutProps: Omit<ObjectsLayoutProps, 'children'>
	treeProps: ObjectsTreeSectionProps
	contextMenuPortalProps: ContextMenuPortalProps
	listProps: ObjectsListPaneProps
	detailsProps: ObjectsDetailsPanelSectionProps
}
