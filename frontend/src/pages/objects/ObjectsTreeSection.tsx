import type { DragEvent, PointerEvent } from 'react'
import type { DataNode, EventDataNode } from 'antd/es/tree'
import type { FavoriteObjectItem } from '../../api/types'

import { ObjectsTreePanel } from './ObjectsTreePanel'

type ObjectsTreeSectionProps = {
	dockTree: boolean
	treeDrawerOpen: boolean
	hasProfile: boolean
	hasBucket: boolean
	favorites: FavoriteObjectItem[]
	favoritesSearch: string
	onFavoritesSearchChange: (value: string) => void
	favoritesOnly: boolean
	onFavoritesOnlyChange: (value: boolean) => void
	favoritesOpenDetails: boolean
	onFavoritesOpenDetailsChange: (value: boolean) => void
	onSelectFavorite: (key: string) => void
	onSelectFavoriteFromDrawer: (key: string) => void
	favoritesLoading: boolean
	favoritesError?: string | null
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
