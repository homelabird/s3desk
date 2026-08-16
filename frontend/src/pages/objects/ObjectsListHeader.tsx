import { Button, Checkbox, Space, Typography } from 'antd'
import { ArrowDownOutlined, ArrowUpOutlined, MoreOutlined } from '@ant-design/icons'

import styles from './ObjectsListView.module.css'
import { ObjectsListHeaderRow } from './ObjectsListPane'

type SortColumn = 'name' | 'size' | 'time'

type ObjectsListHeaderProps = {
	isCompact: boolean
	listGridClassName: string
	allLoadedSelected: boolean
	someLoadedSelected: boolean
	hasRows: boolean
	onToggleSelectAll: (checked: boolean) => void
	sortDirForColumn: (column: SortColumn) => 'asc' | 'desc' | null
	onToggleSort: (column: SortColumn) => void
}

export function ObjectsListHeader(props: ObjectsListHeaderProps) {
	const sortLabelGap = props.isCompact ? 3 : 4
	const nameSortDir = props.sortDirForColumn('name')
	const sizeSortDir = props.sortDirForColumn('size')
	const timeSortDir = props.sortDirForColumn('time')
	const sortClassName = (direction: 'asc' | 'desc' | null) =>
		`${styles.listHeaderSortButton} ${direction ? styles.listHeaderSortButtonActive : ''}`.trim()
	const sortAriaLabel = (label: string, direction: 'asc' | 'desc' | null) =>
		direction ? `Sort by ${label}, currently ${direction === 'asc' ? 'ascending' : 'descending'}` : `Sort by ${label}`

	return (
		<ObjectsListHeaderRow>
			<div className={`${styles.listGridBase} ${styles.listHeaderGrid} ${props.listGridClassName}`}>
				<Checkbox
					checked={props.allLoadedSelected}
					indeterminate={props.someLoadedSelected}
					disabled={!props.hasRows}
					onChange={(e) => props.onToggleSelectAll(e.target.checked)}
					aria-label="Select all objects"
				/>
				<Button
					type="text"
					size="small"
					className={sortClassName(nameSortDir)}
					onClick={() => props.onToggleSort('name')}
					aria-label={sortAriaLabel('Name', nameSortDir)}
					style={{ padding: 0, height: 'auto' }}
				>
					<Space size={sortLabelGap}>
						<Typography.Text type="secondary" className={styles.listHeaderLabel}>
							Name
						</Typography.Text>
						{nameSortDir === 'asc' ? (
							<ArrowUpOutlined aria-hidden="true" />
						) : nameSortDir === 'desc' ? (
							<ArrowDownOutlined aria-hidden="true" />
						) : null}
					</Space>
				</Button>
				{props.isCompact ? (
					<Typography.Text type="secondary" className={`${styles.listHeaderEndCell} ${styles.listHeaderActionsIcon}`}>
						<MoreOutlined aria-hidden="true" />
					</Typography.Text>
				) : (
					<>
						<Button
							type="text"
							size="small"
							className={sortClassName(sizeSortDir)}
							onClick={() => props.onToggleSort('size')}
							aria-label={sortAriaLabel('Size', sizeSortDir)}
							style={{ padding: 0, height: 'auto', textAlign: 'right', justifySelf: 'end' }}
						>
							<Space size={sortLabelGap}>
								<Typography.Text type="secondary" className={styles.listHeaderLabel}>
									Size
								</Typography.Text>
								{sizeSortDir === 'asc' ? (
									<ArrowUpOutlined aria-hidden="true" />
								) : sizeSortDir === 'desc' ? (
									<ArrowDownOutlined aria-hidden="true" />
								) : null}
							</Space>
						</Button>
						<Button
							type="text"
							size="small"
							className={sortClassName(timeSortDir)}
							onClick={() => props.onToggleSort('time')}
							aria-label={sortAriaLabel('Last modified', timeSortDir)}
							style={{ padding: 0, height: 'auto' }}
						>
							<Space size={sortLabelGap}>
								<Typography.Text type="secondary" className={styles.listHeaderLabel}>
									Last modified
								</Typography.Text>
								{timeSortDir === 'asc' ? (
									<ArrowUpOutlined aria-hidden="true" />
								) : timeSortDir === 'desc' ? (
									<ArrowDownOutlined aria-hidden="true" />
								) : null}
							</Space>
						</Button>
						<Typography.Text type="secondary" className={styles.listHeaderEndCell}>
							Actions
						</Typography.Text>
					</>
				)}
			</div>
		</ObjectsListHeaderRow>
	)
}
