import type { ReactNode } from 'react'
import { Button, Empty, Spin } from 'antd'

import type { ObjectItem } from '../../api/types'

type Row = { kind: 'prefix'; prefix: string } | { kind: 'object'; object: ObjectItem }

type ObjectsListContentProps = {
	rows: Row[]
	virtualItems: { index: number; start: number }[]
	totalSize: number
	hasProfile: boolean
	hasBucket: boolean
	isFetching: boolean
	isFetchingNextPage: boolean
	emptyKind: 'empty' | 'noresults' | null
	canClearSearch: boolean
	onClearSearch: () => void
	renderPrefixRow: (prefix: string, offset: number) => ReactNode
	renderObjectRow: (object: ObjectItem, offset: number) => ReactNode
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

	if (props.rows.length === 0) {
		return (
			<div style={{ padding: 24 }}>
				{props.hasProfile && props.hasBucket ? (
					props.isFetching ? (
						<div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
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
					)
				) : null}
				{loadMoreButton ? (
					<div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>{loadMoreButton}</div>
				) : null}
			</div>
		)
	}

	return (
		<div style={{ height: props.totalSize, width: '100%', position: 'relative' }}>
			{props.virtualItems.map((vi) => {
				const row = props.rows[vi.index]
				if (!row) return null
				if (row.kind === 'prefix') return props.renderPrefixRow(row.prefix, vi.start)
				return props.renderObjectRow(row.object, vi.start)
			})}

			{props.isFetchingNextPage ? (
				<div style={{ position: 'absolute', left: 0, right: 0, bottom: 8, textAlign: 'center' }}>
					<Spin />
				</div>
			) : loadMoreButton ? (
				<div style={{ position: 'absolute', left: 0, right: 0, bottom: 8, textAlign: 'center' }}>{loadMoreButton}</div>
			) : null}
		</div>
	)
}
