import { Profiler, type ReactNode } from 'react'
import { Button, Empty, Spin } from 'antd'

import type { ObjectItem } from '../../api/types'
import { logReactRender, measurePerf } from '../../lib/perf'
import type { ObjectRow } from './objectsListUtils'
import type { ObjectsViewMode } from './objectsTypes'
import styles from './objects.module.css'

type ObjectsListContentProps = {
	rows: ObjectRow[]
	virtualItems: { index: number; start: number }[]
	totalSize: number
	hasProfile: boolean
	hasBucket: boolean
	isFetching: boolean
	isFetchingNextPage: boolean
	emptyKind: 'empty' | 'noresults' | null
	canClearSearch: boolean
	onClearSearch: () => void
	viewMode: ObjectsViewMode
	renderPrefixRow: (prefix: string, offset: number) => ReactNode
	renderObjectRow: (object: ObjectItem, offset: number) => ReactNode
	renderPrefixGridItem: (prefix: string) => ReactNode
	renderObjectGridItem: (object: ObjectItem) => ReactNode
	showLoadMore?: boolean
	loadMoreLabel?: string
	loadMoreDisabled?: boolean
	onLoadMore?: () => void
}

export function ObjectsListContent(props: ObjectsListContentProps) {
	const loadMoreButton =
		props.showLoadMore && props.onLoadMore ? (
			<Button size="small" onClick={props.onLoadMore} disabled={props.loadMoreDisabled}>
				{props.loadMoreLabel ?? 'Load more'}
			</Button>
		) : null
	const renderedRows =
		props.viewMode === 'grid'
			? null
			: measurePerf(
					'ObjectsListContent.map',
					() =>
						props.virtualItems.map((vi) => {
							const row = props.rows[vi.index]
							if (!row) return null
							if (row.kind === 'prefix') return props.renderPrefixRow(row.prefix, vi.start)
							return props.renderObjectRow(row.object, vi.start)
						}),
					{ items: props.virtualItems.length, rows: props.rows.length },
				)
	const renderedGridItems =
		props.viewMode !== 'grid'
			? null
			: measurePerf(
					'ObjectsListContent.grid',
					() =>
						props.rows.map((row) => {
							if (row.kind === 'prefix') return props.renderPrefixGridItem(row.prefix)
							return props.renderObjectGridItem(row.object)
						}),
					{ rows: props.rows.length },
				)

	if (props.rows.length === 0) {
		const empty = (
			<div className={styles.listEmptyState}>
				{!props.hasProfile ? (
					<Empty description="Select a profile to browse objects." />
				) : !props.hasBucket ? (
					<Empty description="Select a bucket to start browsing objects (use the dropdown above)." />
				) : props.isFetching ? (
					<div className={styles.listEmptyLoading}>
						<Spin />
					</div>
				) : (
					<Empty description={props.emptyKind === 'empty' ? 'Empty folder' : 'No results'}>
						{props.emptyKind === 'noresults' ? (
							<Button onClick={props.onClearSearch} disabled={!props.canClearSearch}>
								Clear search
							</Button>
						) : null}
					</Empty>
				)}

				{loadMoreButton ? (
					<div className={styles.listFooterAction}>{loadMoreButton}</div>
				) : null}
			</div>
		)
		return (
			<Profiler id="ObjectsListContent.empty" onRender={logReactRender}>
				{empty}
			</Profiler>
		)
	}

	if (props.viewMode === 'grid') {
		const content = (
			<div className={styles.gridContent} data-testid="objects-grid-content">
				{renderedGridItems}
				{props.isFetchingNextPage ? (
					<div className={styles.gridFooter}>
						<Spin />
					</div>
				) : loadMoreButton ? (
					<div className={styles.gridFooter}>{loadMoreButton}</div>
				) : null}
			</div>
		)
		return (
			<Profiler id="ObjectsListContent.grid" onRender={logReactRender}>
				{content}
			</Profiler>
		)
	}

	const content = (
		<div className={styles.virtualListContent} style={{ height: props.totalSize }}>
			{renderedRows}

			{props.isFetchingNextPage ? (
				<div className={styles.virtualListFooter}>
					<Spin />
				</div>
			) : loadMoreButton ? (
				<div className={styles.virtualListFooter}>{loadMoreButton}</div>
			) : null}
		</div>
	)
	return (
		<Profiler id="ObjectsListContent.rows" onRender={logReactRender}>
			{content}
		</Profiler>
	)
}
