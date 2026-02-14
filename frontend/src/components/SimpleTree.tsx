import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef } from 'react'

import type { TreeNode } from '../lib/tree'
import { renderTreeNodeTitle } from '../lib/tree'

import styles from './simpleTree.module.css'

type LoadDataFn = (key: string) => Promise<void> | void

type Props = {
	nodes: TreeNode[]
	expandedKeys: string[]
	selectedKeys: string[]
	onExpandedKeysChange: (keys: string[]) => void
	onSelectKey: (key: string) => void
	loadData?: LoadDataFn
	renderTitle?: (node: TreeNode) => ReactNode
	showIcon?: boolean
	loadingKeys?: ReadonlySet<string> | string[]
	indentPx?: number
}

function isLoading(loadingKeys: Props['loadingKeys'], key: string): boolean {
	if (!loadingKeys) return false
	if (Array.isArray(loadingKeys)) return loadingKeys.includes(key)
	return loadingKeys.has(key)
}

function safeCallLoadData(loadData: LoadDataFn, key: string) {
	void Promise.resolve()
		.then(() => loadData(key))
		.catch(() => {
			// loadData handles its own error UX; ignore here to avoid unhandled rejection noise.
		})
}

export function SimpleTree(props: Props) {
	const indentPx = typeof props.indentPx === 'number' && Number.isFinite(props.indentPx) ? props.indentPx : 14
	const expandedSet = useMemo(() => new Set(props.expandedKeys.map(String)), [props.expandedKeys])
	const selectedSet = useMemo(() => new Set(props.selectedKeys.map(String)), [props.selectedKeys])

	const nodeByKey = useMemo(() => {
		const map = new Map<string, TreeNode>()
		const walk = (nodes: TreeNode[]) => {
			for (const node of nodes) {
				map.set(String(node.key), node)
				if (node.children && Array.isArray(node.children) && node.children.length > 0) walk(node.children)
			}
		}
		walk(props.nodes)
		return map
	}, [props.nodes])

	const prevExpandedRef = useRef<Set<string>>(new Set())
	const loadRequestedRef = useRef<Set<string>>(new Set())

	useEffect(() => {
		const prev = prevExpandedRef.current
		for (const k of expandedSet) {
			if (!prev.has(k)) loadRequestedRef.current.add(k)
		}

		// If a node is no longer expanded, it should no longer trigger a load.
		for (const k of loadRequestedRef.current) {
			if (!expandedSet.has(k)) loadRequestedRef.current.delete(k)
		}

		prevExpandedRef.current = new Set(expandedSet)

		if (!props.loadData) {
			loadRequestedRef.current.clear()
			return
		}

		for (const key of Array.from(loadRequestedRef.current)) {
			const node = nodeByKey.get(key)
			if (!node) continue
			if (node.isLeaf) {
				loadRequestedRef.current.delete(key)
				continue
			}
			if (node.children && Array.isArray(node.children) && node.children.length > 0) {
				loadRequestedRef.current.delete(key)
				continue
			}
			safeCallLoadData(props.loadData, key)
			loadRequestedRef.current.delete(key)
		}
	}, [expandedSet, nodeByKey, props.loadData])

	const renderTitle = (node: TreeNode) => (props.renderTitle ? props.renderTitle(node) : renderTreeNodeTitle(node))

	const toggleExpanded = (key: string) => {
		const k = String(key)
		const exists = expandedSet.has(k)
		const next = exists ? props.expandedKeys.filter((x) => String(x) !== k) : [...props.expandedKeys, k]
		props.onExpandedKeysChange(next.map(String))
	}

	const renderNode = (node: TreeNode, depth: number): ReactNode => {
		const key = String(node.key)
		const expanded = expandedSet.has(key)
		const selected = selectedSet.has(key)
		const canExpand = node.isLeaf !== true
		const nodeLoading = isLoading(props.loadingKeys, key)

		return (
			<li
				key={key}
				role="treeitem"
				aria-expanded={canExpand ? expanded : undefined}
				aria-selected={selected ? true : undefined}
			>
				<div className={`${styles.row}${selected ? ` ${styles.rowSelected}` : ''}`} style={{ paddingLeft: depth * indentPx }}>
					{canExpand ? (
						<button
							type="button"
							className={styles.toggleButton}
							aria-label={expanded ? 'Collapse' : 'Expand'}
							onClick={() => toggleExpanded(key)}
						>
							<span className={styles.toggleChevron} aria-hidden="true">
								{expanded ? '▾' : '▸'}
							</span>
						</button>
					) : (
						<span className={styles.toggleSpacer} aria-hidden="true" />
					)}

					{props.showIcon && node.icon ? <span className={styles.icon} aria-hidden="true">{node.icon}</span> : null}

					<button
						type="button"
						className={styles.labelButton}
						onClick={() => props.onSelectKey(key)}
					>
						<span className={styles.title}>{renderTitle(node)}</span>
						{nodeLoading ? <span className={styles.loadingSpinner} aria-label="Loading" /> : null}
					</button>
				</div>

				{canExpand && expanded ? (
					<ul role="group" className={styles.tree}>
						{node.children && Array.isArray(node.children) && node.children.length > 0
							? node.children.map((child) => renderNode(child, depth + 1))
							: null}
					</ul>
				) : null}
			</li>
		)
	}

	return (
		<ul role="tree" className={styles.tree}>
			{props.nodes.map((n) => renderNode(n, 0))}
		</ul>
	)
}
