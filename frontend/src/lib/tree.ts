import type { ReactNode } from 'react'

export type TreeNodeTitle = ReactNode | ((node: TreeNode) => ReactNode)

export type TreeNode = {
	key: string
	title: TreeNodeTitle
	children?: TreeNode[]
	isLeaf?: boolean
	icon?: ReactNode
}

export function renderTreeNodeTitle(node: TreeNode): ReactNode {
	return typeof node.title === 'function' ? node.title(node) : node.title
}

export function upsertTreeChildren(nodes: TreeNode[], targetKey: string, children: TreeNode[]): TreeNode[] {
	return nodes.map((node) => {
		if (String(node.key) === targetKey) {
			const nextChildren = children.length ? children : undefined
			return { ...node, children: nextChildren, isLeaf: children.length === 0 }
		}
		if (node.children && Array.isArray(node.children) && node.children.length > 0) {
			return { ...node, children: upsertTreeChildren(node.children, targetKey, children) }
		}
		return node
	})
}

