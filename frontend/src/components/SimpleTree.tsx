import type { KeyboardEvent, ReactNode } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

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
	posInSet: number
	setSize: number
	node: TreeNode
}

function findScrollParent(node: HTMLElement | null): HTMLElement | null {
	let parent = node?.parentElement ?? null
	while (parent) {
		const overflowY = window.getComputedStyle(parent).overflowY
		if (overflowY === 'auto' || overflowY === 'scroll') return parent
		parent = parent.parentElement
	}
	return null
}

export function SimpleTree(props: Props) {
	const indentPx =
		typeof props.indentPx === 'number' && Number.isFinite(props.indentPx) ? props.indentPx : 14
	const expandedSet = useMemo(() => new Set(props.expandedKeys.map(String)), [props.expandedKeys])
	const selectedSet = useMemo(() => new Set(props.selectedKeys.map(String)), [props.selectedKeys])
	const itemRefs = useRef(new Map<string, HTMLDivElement>())
	const [focusedKey, setFocusedKey] = useState<string | null>(null)
	const [treeElement, setTreeElement] = useState<HTMLUListElement | null>(null)
	const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)
	const [scrollMargin, setScrollMargin] = useState(0)
	const treeRef = useCallback((node: HTMLUListElement | null) => {
		setTreeElement(node)
		setScrollElement(findScrollParent(node))
	}, [])

	const nodeByKey = useMemo(() => {
		const map = new Map<string, TreeNode>()
		const walk = (nodes: TreeNode[]) => {
			for (const node of nodes) {
				map.set(String(node.key), node)
				if (node.children && Array.isArray(node.children) && node.children.length > 0)
					walk(node.children)
			}
		}
		walk(props.nodes)
		return map
	}, [props.nodes])

	const visibleItems = useMemo(() => {
		const rows: VisibleTreeItem[] = []
		const walk = (nodes: TreeNode[], depth: number, parentKey: string | null) => {
			for (const [index, node] of nodes.entries()) {
				const key = String(node.key)
				rows.push({
					key,
					parentKey,
					depth,
					posInSet: index + 1,
					setSize: nodes.length,
					node,
				})
				if (
					expandedSet.has(key) &&
					node.children &&
					Array.isArray(node.children) &&
					node.children.length > 0
				) {
					walk(node.children, depth + 1, key)
				}
			}
		}
		walk(props.nodes, 0, null)
		return rows
	}, [expandedSet, props.nodes])
	const visibleIndexByKey = useMemo(
		() => new Map(visibleItems.map((item, index) => [item.key, index])),
		[visibleItems],
	)

	useLayoutEffect(() => {
		if (!treeElement || !scrollElement) return
		const treeRect = treeElement.getBoundingClientRect()
		const scrollRect = scrollElement.getBoundingClientRect()
		const next = Math.max(0, Math.round(treeRect.top - scrollRect.top + scrollElement.scrollTop))
		setScrollMargin((current) => (current === next ? current : next))
	}, [scrollElement, treeElement, visibleItems.length])

	const treeVirtualizer = useVirtualizer({
		count: visibleItems.length,
		getScrollElement: () => scrollElement,
		estimateSize: () => 28,
		overscan: 8,
		scrollMargin,
	})
	const measuredVirtualItems = treeVirtualizer.getVirtualItems()
	const virtualItems = useMemo(
		() =>
			measuredVirtualItems.length > 0
				? measuredVirtualItems
				: visibleItems.slice(0, 30).map((_, index) => ({
						index,
						key: index,
						start: index * 28,
						size: 28,
						end: (index + 1) * 28,
						lane: 0,
					})),
		[measuredVirtualItems, visibleItems],
	)
	const totalSize =
		measuredVirtualItems.length > 0 ? treeVirtualizer.getTotalSize() : visibleItems.length * 28

	const visibleKeySet = useMemo(() => new Set(visibleItems.map((item) => item.key)), [visibleItems])
	const firstVisibleKey = visibleItems[0]?.key ?? null
	const selectedVisibleKey =
		props.selectedKeys.map(String).find((key) => visibleKeySet.has(key)) ?? null
	const rovingFocusKey =
		focusedKey && visibleKeySet.has(focusedKey)
			? focusedKey
			: (selectedVisibleKey ?? firstVisibleKey)

	const focusTreeItem = (key: string) => {
		setFocusedKey(key)
		const index = visibleIndexByKey.get(key)
		if (typeof index === 'number') treeVirtualizer.scrollToIndex(index, { align: 'auto' })
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

	const renderTitle = (node: TreeNode) =>
		props.renderTitle ? props.renderTitle(node) : renderTreeNodeTitle(node)

	const toggleExpanded = (key: string) => {
		const k = String(key)
		const exists = expandedSet.has(k)
		const next = exists
			? props.expandedKeys.filter((x) => String(x) !== k)
			: [...props.expandedKeys, k]
		props.onExpandedKeysChange(next.map(String))
	}

	const selectTreeItem = (key: string) => {
		setFocusedKey(key)
		props.onSelectKey(key)
	}

	const handleTreeItemKeyDown = (event: KeyboardEvent<HTMLDivElement>, node: TreeNode) => {
		const key = String(node.key)
		const currentIndex = visibleIndexByKey.get(key) ?? -1
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

	const renderNode = (item: VisibleTreeItem): ReactNode => {
		const { node, depth, posInSet, setSize } = item
		const key = String(node.key)
		const expanded = expandedSet.has(key)
		const selected = selectedSet.has(key)
		const canExpand = node.isLeaf !== true
		const nodeLoading = isLoading(props.loadingKeys, key)
		const accessibleName = nodeAccessibleName(node)

		return (
			<div
				ref={(element) => {
					if (element) {
						itemRefs.current.set(key, element)
						if (focusedKey === key) element.focus()
					} else itemRefs.current.delete(key)
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

				{props.showIcon && node.icon ? (
					<span className={styles.icon} aria-hidden="true">
						{node.icon}
					</span>
				) : null}

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
						<span
							className={styles.loadingSpinner}
							role="status"
							aria-live="polite"
							aria-atomic="true"
						>
							<span className="sr-only">Loading {accessibleName}</span>
						</span>
					) : null}
				</button>
			</div>
		)
	}

	return (
		<ul
			ref={treeRef}
			className={styles.tree}
			role="tree"
			aria-label={props.ariaLabel ?? 'Tree'}
			style={{ height: totalSize }}
		>
			{virtualItems.map((virtualItem) => {
				const item = visibleItems[virtualItem.index]
				if (!item) return null
				return (
					<li
						key={item.key}
						ref={treeVirtualizer.measureElement}
						data-index={virtualItem.index}
						className={styles.virtualRow}
						style={{
							transform: `translateY(${virtualItem.start - scrollMargin}px)`,
						}}
						role="none"
					>
						{renderNode(item)}
					</li>
				)
			})}
		</ul>
	)
}
