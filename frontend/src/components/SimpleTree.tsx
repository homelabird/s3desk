import type { KeyboardEvent, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

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
	ariaLabel?: string
	loadData?: LoadDataFn
	renderTitle?: (node: TreeNode) => ReactNode
	showIcon?: boolean
	loadingKeys?: ReadonlySet<string> | string[]
	indentPx?: number
	rowTestId?: string
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

function nodeAccessibleName(node: TreeNode) {
	if (typeof node.title === 'string' || typeof node.title === 'number') return String(node.title)
	return String(node.key)
}

type VisibleTreeItem = {
	key: string
	parentKey: string | null
	depth: number
	node: TreeNode
}

export function SimpleTree(props: Props) {
	const indentPx = typeof props.indentPx === 'number' && Number.isFinite(props.indentPx) ? props.indentPx : 14
	const expandedSet = useMemo(() => new Set(props.expandedKeys.map(String)), [props.expandedKeys])
	const selectedSet = useMemo(() => new Set(props.selectedKeys.map(String)), [props.selectedKeys])
	const itemRefs = useRef(new Map<string, HTMLDivElement>())
	const [focusedKey, setFocusedKey] = useState<string | null>(null)

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

	const visibleItems = useMemo(() => {
		const rows: VisibleTreeItem[] = []
		const walk = (nodes: TreeNode[], depth: number, parentKey: string | null) => {
			for (const node of nodes) {
				const key = String(node.key)
				rows.push({ key, parentKey, depth, node })
				if (expandedSet.has(key) && node.children && Array.isArray(node.children) && node.children.length > 0) {
					walk(node.children, depth + 1, key)
				}
			}
		}
		walk(props.nodes, 0, null)
		return rows
	}, [expandedSet, props.nodes])

	const visibleKeySet = useMemo(() => new Set(visibleItems.map((item) => item.key)), [visibleItems])
	const firstVisibleKey = visibleItems[0]?.key ?? null
	const selectedVisibleKey = props.selectedKeys.map(String).find((key) => visibleKeySet.has(key)) ?? null
	const rovingFocusKey =
		focusedKey && visibleKeySet.has(focusedKey) ? focusedKey : selectedVisibleKey ?? firstVisibleKey

	const focusTreeItem = (key: string) => {
		setFocusedKey(key)
		itemRefs.current.get(key)?.focus()
	}

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

	const selectTreeItem = (key: string) => {
		setFocusedKey(key)
		props.onSelectKey(key)
	}

	const handleTreeItemKeyDown = (event: KeyboardEvent<HTMLDivElement>, node: TreeNode) => {
		const key = String(node.key)
		const currentIndex = visibleItems.findIndex((item) => item.key === key)
		const currentItem = visibleItems[currentIndex]
		const canExpand = node.isLeaf !== true
		const expanded = expandedSet.has(key)

		switch (event.key) {
			case 'ArrowDown': {
				const next = visibleItems[currentIndex + 1]
				if (!next) return
				event.preventDefault()
				focusTreeItem(next.key)
				return
			}
			case 'ArrowUp': {
				const prev = visibleItems[currentIndex - 1]
				if (!prev) return
				event.preventDefault()
				focusTreeItem(prev.key)
				return
			}
			case 'Home': {
				if (!firstVisibleKey) return
				event.preventDefault()
				focusTreeItem(firstVisibleKey)
				return
			}
			case 'End': {
				const last = visibleItems[visibleItems.length - 1]
				if (!last) return
				event.preventDefault()
				focusTreeItem(last.key)
				return
			}
			case 'ArrowRight': {
				if (!canExpand) return
				event.preventDefault()
				if (!expanded) {
					toggleExpanded(key)
					return
				}
				const firstChild = visibleItems[currentIndex + 1]
				if (firstChild && firstChild.parentKey === key) focusTreeItem(firstChild.key)
				return
			}
			case 'ArrowLeft': {
				if (canExpand && expanded) {
					event.preventDefault()
					toggleExpanded(key)
					return
				}
				if (currentItem?.parentKey) {
					event.preventDefault()
					focusTreeItem(currentItem.parentKey)
				}
				return
			}
			case 'Enter':
			case ' ': {
				event.preventDefault()
				selectTreeItem(key)
				return
			}
			default:
				return
		}
	}

	const renderNode = (node: TreeNode, depth: number, posInSet: number, setSize: number): ReactNode => {
		const key = String(node.key)
		const expanded = expandedSet.has(key)
		const selected = selectedSet.has(key)
		const canExpand = node.isLeaf !== true
		const nodeLoading = isLoading(props.loadingKeys, key)
		const accessibleName = nodeAccessibleName(node)

		return (
			<li key={key} role="none">
				<div
					ref={(element) => {
						if (element) itemRefs.current.set(key, element)
						else itemRefs.current.delete(key)
					}}
					role="treeitem"
					tabIndex={rovingFocusKey === key ? 0 : -1}
					aria-label={accessibleName}
					aria-level={depth + 1}
					aria-posinset={posInSet}
					aria-setsize={setSize}
					aria-expanded={canExpand ? expanded : undefined}
					aria-selected={selected}
					aria-busy={nodeLoading ? 'true' : undefined}
					className={`${styles.row}${selected ? ` ${styles.rowSelected}` : ''}`}
					style={{ paddingLeft: depth * indentPx }}
					data-testid={props.rowTestId}
					data-tree-depth={String(depth)}
					data-tree-key={key}
					onClick={() => selectTreeItem(key)}
					onFocus={() => setFocusedKey(key)}
					onKeyDown={(event) => handleTreeItemKeyDown(event, node)}
				>
					{canExpand ? (
						<button
							type="button"
							className={styles.toggleButton}
							tabIndex={-1}
							aria-label={`${expanded ? 'Collapse' : 'Expand'} ${accessibleName}`}
							onClick={(event) => {
								event.stopPropagation()
								toggleExpanded(key)
							}}
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
						tabIndex={-1}
						aria-label={accessibleName}
						onClick={(event) => {
							event.stopPropagation()
							selectTreeItem(key)
						}}
					>
						<span className={styles.title}>{renderTitle(node)}</span>
						{nodeLoading ? (
							<span className={styles.loadingSpinner} role="status" aria-live="polite" aria-atomic="true">
								<span className="sr-only">Loading {accessibleName}</span>
							</span>
						) : null}
					</button>
				</div>

				{canExpand && expanded ? (
					<ul className={styles.tree} role="group">
						{node.children && Array.isArray(node.children) && node.children.length > 0
							? node.children.map((child, index) => renderNode(child, depth + 1, index + 1, node.children?.length ?? 0))
							: null}
					</ul>
				) : null}
			</li>
		)
	}

	return (
		<ul className={styles.tree} role="tree" aria-label={props.ariaLabel ?? 'Tree'}>
			{props.nodes.map((n, index) => renderNode(n, 0, index + 1, props.nodes.length))}
		</ul>
	)
}
