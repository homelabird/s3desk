import { Drawer } from 'antd'
import type { DataNode, EventDataNode } from 'antd/es/tree'
import type { DragEvent, PointerEvent } from 'react'

import styles from './objects.module.css'
import { ObjectsTreePane } from './ObjectsTreePane'
import { ObjectsTreeView } from './ObjectsTreeView'

type ObjectsTreePanelProps = {
	dockTree: boolean
	treeDrawerOpen: boolean
	hasProfile: boolean
	hasBucket: boolean
	treeData: DataNode[]
	expandedKeys: string[]
	selectedKeys: string[]
	onExpandedKeysChange: (keys: string[]) => void
	onSelectKey: (key: string) => void
	onSelectKeyFromDrawer: (key: string) => void
	onLoadData: (node: EventDataNode<DataNode>) => Promise<void>
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

export function ObjectsTreePanel(props: ObjectsTreePanelProps) {
	const renderTreeView = (onSelectKey: (key: string) => void) => (
		<ObjectsTreeView
			hasProfile={props.hasProfile}
			hasBucket={props.hasBucket}
			treeData={props.treeData}
			onLoadData={props.onLoadData}
			selectedKeys={props.selectedKeys}
			expandedKeys={props.expandedKeys}
			onExpandedKeysChange={props.onExpandedKeysChange}
			onSelectKey={onSelectKey}
			getDropTargetPrefix={props.getDropTargetPrefix}
			canDragDrop={props.canDragDrop}
			dndHoverPrefix={props.dndHoverPrefix}
			onDndTargetDragOver={props.onDndTargetDragOver}
			onDndTargetDragLeave={props.onDndTargetDragLeave}
			onDndTargetDrop={props.onDndTargetDrop}
		/>
	)

	return (
		<>
			{props.dockTree ? (
				<>
					<div className={`${styles.layoutPane} ${styles.layoutTreePane}`}>
						<ObjectsTreePane title="Folders">{renderTreeView(props.onSelectKey)}</ObjectsTreePane>
					</div>

					<div
						onPointerDown={props.onResizePointerDown}
						onPointerMove={props.onResizePointerMove}
						onPointerUp={props.onResizePointerUp}
						onPointerCancel={props.onResizePointerUp}
						className={`${styles.resizeHandle} ${styles.layoutTreeHandle}`}
					>
						<div className={styles.resizeBar} />
					</div>
				</>
			) : null}

			<Drawer
				open={!props.dockTree && props.treeDrawerOpen}
				onClose={props.onCloseDrawer}
				title="Folders"
				placement="left"
				width="90%"
			>
				{renderTreeView(props.onSelectKeyFromDrawer)}
			</Drawer>
		</>
	)
}
