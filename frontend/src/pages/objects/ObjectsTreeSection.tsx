import type { DragEvent, PointerEvent } from 'react'
import type { DataNode, EventDataNode } from 'antd/es/tree'

import { ObjectsTreePanel } from './ObjectsTreePanel'

type ObjectsTreeSectionProps = {
	dockTree: boolean
	treeDrawerOpen: boolean
	hasProfile: boolean
	hasBucket: boolean
	treeData: DataNode[]
	onLoadData: (node: EventDataNode<DataNode>) => Promise<void>
	selectedKeys: string[]
	expandedKeys: string[]
	onExpandedKeysChange: (keys: string[]) => void
	onSelectKey: (key: string) => void
	onSelectKeyFromDrawer: (key: string) => void
	getDropTargetPrefix: (nodeKey: string) => string
	canDragDrop: boolean
	dndHoverPrefix: string | null
	onDndTargetDragOver: (event: DragEvent, nodeKey: string) => void
	onDndTargetDragLeave: (event: DragEvent, nodeKey: string) => void
	onDndTargetDrop: (event: DragEvent, nodeKey: string) => void
	onResizePointerDown: (event: PointerEvent<HTMLDivElement>) => void
	onResizePointerMove: (event: PointerEvent<HTMLDivElement>) => void
	onResizePointerUp: (event: PointerEvent<HTMLDivElement>) => void
	onCloseDrawer: () => void
}

export function ObjectsTreeSection(props: ObjectsTreeSectionProps) {
	return <ObjectsTreePanel {...props} />
}
