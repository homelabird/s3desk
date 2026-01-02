import { Button, Checkbox, Space, Typography } from 'antd'
import { CaretDownOutlined, CaretUpOutlined, EllipsisOutlined } from '@ant-design/icons'

import styles from './objects.module.css'
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
				<Button type="text" size="small" onClick={() => props.onToggleSort('name')} style={{ padding: 0, height: 'auto' }}>
					<Space size={4}>
						<Typography.Text type="secondary">Name</Typography.Text>
						{props.sortDirForColumn('name') === 'asc' ? (
							<CaretUpOutlined />
						) : props.sortDirForColumn('name') === 'desc' ? (
							<CaretDownOutlined />
						) : null}
					</Space>
				</Button>
				{props.isCompact ? (
					<Typography.Text type="secondary" style={{ justifySelf: 'end' }}>
						<EllipsisOutlined />
					</Typography.Text>
				) : (
					<>
						<Button
							type="text"
							size="small"
							onClick={() => props.onToggleSort('size')}
							style={{ padding: 0, height: 'auto', textAlign: 'right' }}
						>
							<Space size={4}>
								<Typography.Text type="secondary">Size</Typography.Text>
								{props.sortDirForColumn('size') === 'asc' ? (
									<CaretUpOutlined />
								) : props.sortDirForColumn('size') === 'desc' ? (
									<CaretDownOutlined />
								) : null}
							</Space>
						</Button>
						<Button
							type="text"
							size="small"
							onClick={() => props.onToggleSort('time')}
							style={{ padding: 0, height: 'auto' }}
						>
							<Space size={4}>
								<Typography.Text type="secondary">Last modified</Typography.Text>
								{props.sortDirForColumn('time') === 'asc' ? (
									<CaretUpOutlined />
								) : props.sortDirForColumn('time') === 'desc' ? (
									<CaretDownOutlined />
								) : null}
							</Space>
						</Button>
						<Typography.Text type="secondary">Actions</Typography.Text>
					</>
				)}
			</div>
		</ObjectsListHeaderRow>
	)
}
