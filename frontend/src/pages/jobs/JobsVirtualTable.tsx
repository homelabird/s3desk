import { useMemo, useRef } from 'react'
import { Empty, Spin } from 'antd'
import type { CSSProperties, ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import styles from './jobsVirtualTable.module.css'

export type SortState = { key: string; direction: 'asc' | 'desc' } | null

export type JobsVirtualTableColumn<Row> = {
	key: string
	title: ReactNode
	width?: number
	dataIndex?: string
	render?(value: unknown, row: Row): ReactNode
	sorter?: (a: Row, b: Row) => number
	align?: 'left' | 'center' | 'right'
	fixed?: 'right'
}

type ThemeVars = {
	borderColor: string
	bg: string
	hoverBg: string
}

type Props<Row> = {
	rows: Row[]
	columns: JobsVirtualTableColumn<Row>[]
	height: number
	loading: boolean
	empty?: ReactNode
	sort: SortState
	onSortChange: (next: SortState) => void
	ariaLabel?: string
	theme: ThemeVars
}

const DEFAULT_COL_WIDTH = 180
const ESTIMATED_ROW_HEIGHT_PX = 54

export function JobsVirtualTable<Row extends { id?: string }>(props: Props<Row>) {
	const scrollRef = useRef<HTMLDivElement | null>(null)

	const virtualizer = useVirtualizer({
		count: props.rows.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ESTIMATED_ROW_HEIGHT_PX,
		overscan: 10,
	})
	const virtualItems = virtualizer.getVirtualItems()

	const paddingTop = virtualItems.length ? virtualItems[0]!.start : 0
	const paddingBottom = virtualItems.length
		? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1]!.end
		: 0

	const minWidth = useMemo(() => {
		return props.columns.reduce((sum, c) => sum + (c.width ?? DEFAULT_COL_WIDTH), 0)
	}, [props.columns])

	const styleVars = useMemo(
		() =>
			({
				'--jvt-border': props.theme.borderColor,
				'--jvt-bg': props.theme.bg,
				'--jvt-hover': props.theme.hoverBg,
			}) as CSSProperties,
		[props.theme.bg, props.theme.borderColor, props.theme.hoverBg],
	)

	const getSortIndicator = (key: string) => {
		if (!props.sort || props.sort.key !== key) return null
		return props.sort.direction === 'asc' ? '^' : 'v'
	}

	const toggleSort = (key: string) => {
		const prev = props.sort
		if (!prev || prev.key !== key) {
			props.onSortChange({ key, direction: 'asc' })
			return
		}
		if (prev.direction === 'asc') {
			props.onSortChange({ key, direction: 'desc' })
			return
		}
		props.onSortChange(null)
	}

	const content =
		props.rows.length === 0 ? (
			props.loading ? (
				<div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
					<Spin />
				</div>
			) : props.empty ? (
				<div style={{ padding: 16 }}>{props.empty}</div>
			) : (
				<div style={{ padding: 16 }}>
					<Empty />
				</div>
			)
		) : (
			<div ref={scrollRef} className={styles.scroll} style={{ maxHeight: props.height }}>
				<table className={styles.table} style={{ minWidth }} aria-label={props.ariaLabel ?? 'Table'}>
					<colgroup>
						{props.columns.map((c) => (
							<col key={c.key} style={{ width: c.width ?? DEFAULT_COL_WIDTH }} />
						))}
					</colgroup>
					<thead>
						<tr>
							{props.columns.map((c) => {
								const sortable = !!c.sorter
								const indicator = getSortIndicator(c.key)
								const ariaSort =
									props.sort && props.sort.key === c.key
										? props.sort.direction === 'asc'
											? 'ascending'
											: 'descending'
										: 'none'
								const thStyle: CSSProperties = {
									textAlign: c.align ?? 'left',
								}
								const thClassName =
									c.fixed === 'right'
										? `${styles.headerCell} ${styles.stickyRightCell} ${styles.stickyRightHeader}`
										: styles.headerCell
								return (
									<th key={c.key} className={thClassName} style={thStyle} aria-sort={ariaSort}>
										{sortable ? (
											<button type="button" className={styles.sortButton} onClick={() => toggleSort(c.key)}>
												<span>{c.title}</span>
												{indicator ? <span className={styles.sortIndicator}>{indicator}</span> : null}
											</button>
										) : (
											c.title
										)}
									</th>
								)
							})}
						</tr>
					</thead>
					<tbody>
						{paddingTop > 0 ? (
							<tr aria-hidden>
								<td className={styles.spacerCell} colSpan={props.columns.length} style={{ height: paddingTop }} />
							</tr>
						) : null}
						{virtualItems.map((vi) => {
							const row = props.rows[vi.index]
							if (!row) return null
							const key = (row as { id?: string }).id ?? String(vi.index)
							return (
								<tr
									key={key}
									data-index={vi.index}
									ref={virtualizer.measureElement as unknown as (el: HTMLTableRowElement | null) => void}
								>
									{props.columns.map((c) => {
										const raw = c.dataIndex ? (row as Record<string, unknown>)[String(c.dataIndex)] : undefined
										const content = c.render ? c.render(raw, row) : raw == null ? '-' : String(raw)
										const tdStyle: CSSProperties = {
											textAlign: c.align ?? 'left',
										}
										const tdClassName =
											c.fixed === 'right' ? `${styles.cell} ${styles.stickyRightCell}` : styles.cell
										return (
											<td key={c.key} className={tdClassName} style={tdStyle}>
												{content}
											</td>
										)
									})}
								</tr>
							)
						})}
						{paddingBottom > 0 ? (
							<tr aria-hidden>
								<td className={styles.spacerCell} colSpan={props.columns.length} style={{ height: paddingBottom }} />
							</tr>
						) : null}
					</tbody>
				</table>
			</div>
		)

	return (
		<div className={styles.frame} style={styleVars}>
			<Spin spinning={props.loading && props.rows.length > 0}>{content}</Spin>
		</div>
	)
}
