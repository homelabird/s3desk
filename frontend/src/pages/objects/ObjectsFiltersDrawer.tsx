import type { SelectProps } from 'antd'
import { Button, DatePicker, Drawer, InputNumber, Select, Space, Switch, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'

import type { ObjectSort, ObjectTypeFilter } from './objectsTypes'

type ObjectsFiltersDrawerProps = {
	open: boolean
	onClose: () => void
	isAdvanced: boolean
	typeFilter: ObjectTypeFilter
	onTypeFilterChange: (value: ObjectTypeFilter) => void
	favoritesOnly: boolean
	onFavoritesOnlyChange: (value: boolean) => void
	favoritesFirst: boolean
	onFavoritesFirstChange: (value: boolean) => void
	extFilter: string
	extOptions: SelectProps['options']
	onExtFilterChange: (value: string) => void
	minSizeBytes: number | null
	maxSizeBytes: number | null
	onMinSizeBytesChange: (value: number | null) => void
	onMaxSizeBytesChange: (value: number | null) => void
	modifiedAfterMs: number | null
	modifiedBeforeMs: number | null
	onModifiedRangeChange: (startMs: number | null, endMs: number | null) => void
	sort: ObjectSort
	onSortChange: (value: ObjectSort) => void
	onResetView: () => void
	hasActiveView: boolean
}

const mbFromBytes = (value: number | null) => {
	if (value == null || !Number.isFinite(value)) return null
	return Math.round((value / (1024 * 1024)) * 100) / 100
}

const bytesFromMb = (value: number | null) => {
	if (value == null || !Number.isFinite(value)) return null
	return Math.max(0, Math.round(value * 1024 * 1024))
}

const toDayjs = (value: number | null): Dayjs | null => {
	if (value == null || !Number.isFinite(value)) return null
	return dayjs(value)
}

export function ObjectsFiltersDrawer(props: ObjectsFiltersDrawerProps) {
	const fileFiltersDisabled = props.typeFilter === 'folders'
	const rangeValue: [Dayjs | null, Dayjs | null] = [toDayjs(props.modifiedAfterMs), toDayjs(props.modifiedBeforeMs)]
	return (
		<Drawer
			open={props.open}
			onClose={props.onClose}
			title={props.isAdvanced ? 'View options' : 'Filters'}
			placement="right"
			width="90%"
		>
			<Space direction="vertical" size="middle" style={{ width: '100%' }}>
				<Space direction="vertical" size="small" style={{ width: '100%' }}>
					<Typography.Text type="secondary">Favorites only</Typography.Text>
					<Switch
						checked={props.favoritesOnly}
						onChange={props.onFavoritesOnlyChange}
						aria-label="Favorites only"
					/>
				</Space>

				<Space direction="vertical" size="small" style={{ width: '100%' }}>
					<Typography.Text type="secondary">Favorites first</Typography.Text>
					<Switch
						checked={props.favoritesFirst}
						onChange={props.onFavoritesFirstChange}
						disabled={props.favoritesOnly}
						aria-label="Favorites first"
					/>
				</Space>

				<Space direction="vertical" size="small" style={{ width: '100%' }}>
					<Typography.Text type="secondary">Type</Typography.Text>
					<Select
						value={props.typeFilter}
						style={{ width: '100%' }}
						aria-label="Type filter"
						options={[
							{ label: 'All', value: 'all' },
							{ label: 'Folders', value: 'folders' },
							{ label: 'Files', value: 'files' },
						]}
						onChange={(value) => props.onTypeFilterChange(value as ObjectTypeFilter)}
					/>
				</Space>

				{props.isAdvanced ? (
					<>
						<Space direction="vertical" size="small" style={{ width: '100%' }}>
							<Typography.Text type="secondary">Extension</Typography.Text>
							<Select
								allowClear
								placeholder="Ext…"
								value={props.extFilter || undefined}
								style={{ width: '100%' }}
								aria-label="Extension filter"
								options={props.extOptions}
								onChange={(value) => props.onExtFilterChange(value ?? '')}
								disabled={fileFiltersDisabled}
							/>
						</Space>

						<Space direction="vertical" size="small" style={{ width: '100%' }}>
							<Typography.Text type="secondary">Size (MB)</Typography.Text>
							<Space style={{ width: '100%' }}>
								<InputNumber
									min={0}
									step={0.1}
									placeholder="Min MB…"
									style={{ flex: 1, maxWidth: '100%' }}
									value={mbFromBytes(props.minSizeBytes)}
									onChange={(value) => props.onMinSizeBytesChange(bytesFromMb(typeof value === 'number' ? value : null))}
									disabled={fileFiltersDisabled}
								/>
								<InputNumber
									min={0}
									step={0.1}
									placeholder="Max MB…"
									style={{ flex: 1, maxWidth: '100%' }}
									value={mbFromBytes(props.maxSizeBytes)}
									onChange={(value) => props.onMaxSizeBytesChange(bytesFromMb(typeof value === 'number' ? value : null))}
									disabled={fileFiltersDisabled}
								/>
							</Space>
						</Space>

						<Space direction="vertical" size="small" style={{ width: '100%' }}>
							<Typography.Text type="secondary">Last modified</Typography.Text>
							<DatePicker.RangePicker
								allowClear
								style={{ width: '100%' }}
								value={rangeValue}
								onChange={(values) => {
									const start = values?.[0] ?? null
									const end = values?.[1] ?? null
									const startMs = start ? start.startOf('day').valueOf() : null
									const endMs = end ? end.endOf('day').valueOf() : null
									props.onModifiedRangeChange(startMs, endMs)
								}}
								disabled={fileFiltersDisabled}
							/>
						</Space>
					</>
				) : null}

				{props.isAdvanced ? (
					<Space direction="vertical" size="small" style={{ width: '100%' }}>
						<Typography.Text type="secondary">Sort</Typography.Text>
						<Select
							value={props.sort}
							style={{ width: '100%' }}
							aria-label="Sort"
							options={[
								{ label: 'Name (A -> Z)', value: 'name_asc' },
								{ label: 'Name (Z -> A)', value: 'name_desc' },
								{ label: 'Size (smallest)', value: 'size_asc' },
								{ label: 'Size (largest)', value: 'size_desc' },
								{ label: 'Last modified (oldest)', value: 'time_asc' },
								{ label: 'Last modified (newest)', value: 'time_desc' },
							]}
							onChange={(value) => props.onSortChange(value as ObjectSort)}
						/>
					</Space>
				) : null}

				<Space wrap style={{ justifyContent: 'flex-end' }}>
					<Button onClick={props.onResetView} disabled={!props.hasActiveView}>
						Reset view
					</Button>
					<Button type="primary" onClick={props.onClose}>
						Done
					</Button>
				</Space>
			</Space>
		</Drawer>
	)
}
