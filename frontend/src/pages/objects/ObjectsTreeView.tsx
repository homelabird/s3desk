import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react'

import { SimpleTree } from '../../components/SimpleTree'
import {
	chooseProfileToLoadFoldersForWorkspaceHint,
	createFolderOrUploadFilesAtThisLevelHint,
	failedToLoadFoldersTitle,
	fetchingNestedPrefixesForThisLocationHint,
	loadingFoldersTitle,
	noFoldersHereYetTitle,
	pickBucketToBrowseFoldersAndNestedPrefixesHint,
	selectBucketFirstHint,
	selectProfileFirstHint,
} from '../../lib/actionHints'
import { renderTreeNodeTitle, type TreeNode } from '../../lib/tree'
import styles from '../../components/simpleTree.module.css'
import { ObjectsPaneStatus } from './ObjectsPaneStatus'

type ObjectsTreeViewProps = {
	hasProfile: boolean
	hasBucket: boolean
	treeData: TreeNode[]
	errorMessage?: string | null
	loadingKeys?: ReadonlySet<string> | string[]
	expandedKeys: string[]
	selectedKeys: string[]
	onExpandedKeysChange: (keys: string[]) => void
	onSelectKey: (key: string) => void
	onLoadData: (nodeKey: string) => Promise<void>
	getDropTargetPrefix: (nodeKey: string) => string
	canDragDrop: boolean
	dndHoverPrefix: string | null
	onDndTargetDragOver: (event: DragEvent, nodeKey: string) => void
	onDndTargetDragLeave: (event: DragEvent, nodeKey: string) => void
	onDndTargetDrop: (event: DragEvent, nodeKey: string) => void
	onPrefixContextMenu?: (event: ReactMouseEvent, nodeKey: string) => void
}

function isTreeKeyLoading(loadingKeys: ObjectsTreeViewProps['loadingKeys'], key: string): boolean {
	if (!loadingKeys) return false
	return Array.isArray(loadingKeys) ? loadingKeys.includes(key) : loadingKeys.has(key)
}

function renderStatus(kind: 'prereq' | 'loading' | 'empty' | 'error', title: string, description?: string) {
	return (
		<ObjectsPaneStatus
			kind={kind}
			kindAttributeName="data-tree-status-kind"
			testId="objects-tree-status"
			title={title}
			description={description}
		/>
	)
}

export function ObjectsTreeView(props: ObjectsTreeViewProps) {
	if (!props.hasProfile) {
		return renderStatus('prereq', selectProfileFirstHint(), chooseProfileToLoadFoldersForWorkspaceHint())
	}
	if (!props.hasBucket) {
		return renderStatus('prereq', selectBucketFirstHint(), pickBucketToBrowseFoldersAndNestedPrefixesHint())
	}

	const rootNode = props.treeData[0]
	const rootKey = String(rootNode?.key ?? '/')
	const rootExpanded = props.expandedKeys.map(String).includes(rootKey)
	const rootLoading = rootExpanded && isTreeKeyLoading(props.loadingKeys, rootKey)
	const rootEmpty = rootExpanded && rootNode?.isLeaf === true && !rootLoading && !props.errorMessage
	const treeStatus = props.errorMessage
		? renderStatus('error', failedToLoadFoldersTitle(), props.errorMessage)
		: rootLoading
			? renderStatus('loading', loadingFoldersTitle(), fetchingNestedPrefixesForThisLocationHint())
			: rootEmpty
				? renderStatus('empty', noFoldersHereYetTitle(), createFolderOrUploadFilesAtThisLevelHint())
				: null

	return (
		<div className={styles.treeContent} data-testid="objects-tree-view">
			<SimpleTree
				nodes={props.treeData}
				loadData={props.onLoadData}
				selectedKeys={props.selectedKeys}
				expandedKeys={props.expandedKeys}
				onExpandedKeysChange={(keys) => props.onExpandedKeysChange(keys.map(String))}
				onSelectKey={(key) => props.onSelectKey(String(key))}
				showIcon
				loadingKeys={props.loadingKeys}
				indentPx={12}
				rowTestId="objects-tree-row"
				renderTitle={(node) => {
					const nodeKey = String(node.key ?? '/')
					const target = props.getDropTargetPrefix(nodeKey)
					const active = props.canDragDrop && props.dndHoverPrefix === target
					const renderedTitle = renderTreeNodeTitle(node)
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
							className={styles.titleSurface}
							style={{
								background: active ? 'var(--s3d-color-primary-light)' : undefined,
							}}
						>
							{renderedTitle}
						</span>
					)
				}}
			/>
			{treeStatus}
		</div>
	)
}
