import { Tree, Typography } from 'antd'
import type { DataNode, EventDataNode } from 'antd/es/tree'
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react'

type ObjectsTreeViewProps = {
	hasProfile: boolean
	hasBucket: boolean
	treeData: DataNode[]
	expandedKeys: string[]
	selectedKeys: string[]
	onExpandedKeysChange: (keys: string[]) => void
	onSelectKey: (key: string) => void
	onLoadData: (node: EventDataNode<DataNode>) => Promise<void>
	getDropTargetPrefix: (nodeKey: string) => string
	canDragDrop: boolean
	dndHoverPrefix: string | null
	onDndTargetDragOver: (event: DragEvent, nodeKey: string) => void
	onDndTargetDragLeave: (event: DragEvent, nodeKey: string) => void
	onDndTargetDrop: (event: DragEvent, nodeKey: string) => void
	onPrefixContextMenu?: (event: ReactMouseEvent, nodeKey: string) => void
}

export function ObjectsTreeView(props: ObjectsTreeViewProps) {
	if (!props.hasProfile) {
		return <Typography.Text type="secondary">Select a profile first.</Typography.Text>
	}
	if (!props.hasBucket) {
		return <Typography.Text type="secondary">Select a bucket to browse folders.</Typography.Text>
	}

	return (
		<Tree.DirectoryTree
			blockNode
			showIcon
			treeData={props.treeData}
			loadData={props.onLoadData}
			titleRender={(node: DataNode) => {
				const nodeKey = String(node.key ?? '/')
				const target = props.getDropTargetPrefix(nodeKey)
				const active = props.canDragDrop && props.dndHoverPrefix === target
				const renderedTitle = typeof node.title === 'function' ? node.title(node) : node.title
				return (
					<span
						onContextMenu={
							props.onPrefixContextMenu
								? (e) => {
										e.preventDefault()
										e.stopPropagation()
										props.onPrefixContextMenu?.(e, nodeKey)
								  }
								: undefined
						}
						onDragOver={(e) => props.onDndTargetDragOver(e, nodeKey)}
						onDragLeave={(e) => props.onDndTargetDragLeave(e, nodeKey)}
						onDrop={(e) => props.onDndTargetDrop(e, nodeKey)}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							width: '100%',
							paddingInline: 4,
							borderRadius: 4,
							background: active ? 'rgba(22, 119, 255, 0.12)' : undefined,
						}}
					>
						{renderedTitle}
					</span>
				)
			}}
			selectedKeys={props.selectedKeys}
			expandedKeys={props.expandedKeys}
			onExpand={(keys) => props.onExpandedKeysChange(keys.map(String))}
			onSelect={(keys) => {
				const key = String(keys[0] ?? '/')
				props.onSelectKey(key)
			}}
		/>
	)
}
