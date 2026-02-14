import { Button, Drawer, InputNumber, Space, Switch, Typography } from 'antd'

import type { ObjectSort, ObjectTypeFilter } from './objectsTypes'
import { NativeSelect } from '../../components/NativeSelect'
import { DatalistInput } from '../../components/DatalistInput'

import {
	formatLocalDateInputValue,
	localDayEndMsFromDateInput,
	localDayStartMsFromDateInput,
} from '../../lib/localDate'

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
	extOptions: Array<{ label: string; value: string }>
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

export function ObjectsFiltersDrawer(props: ObjectsFiltersDrawerProps) {
	const fileFiltersDisabled = props.typeFilter === 'folders'
	const modifiedAfterValue = formatLocalDateInputValue(props.modifiedAfterMs)
	const modifiedBeforeValue = formatLocalDateInputValue(props.modifiedBeforeMs)
	return (
		<Drawer
			open={props.open}
			onClose={props.onClose}
			title={props.isAdvanced ? 'View options' : 'Filters'}
			placement="right"
			width="90%"
		>
			<Space orientation="vertical" size="middle" style={{ width: '100%' }}>
				<Space orientation="vertical" size="small" style={{ width: '100%' }}>
					<Typography.Text type="secondary">Favorites only</Typography.Text>
					<Switch
						checked={props.favoritesOnly}
						onChange={props.onFavoritesOnlyChange}
						aria-label="Favorites only"
					/>
				</Space>

				<Space orientation="vertical" size="small" style={{ width: '100%' }}>
					<Typography.Text type="secondary">Favorites first</Typography.Text>
					<Switch
						checked={props.favoritesFirst}
						onChange={props.onFavoritesFirstChange}
						disabled={props.favoritesOnly}
						aria-label="Favorites first"
					/>
				</Space>

				<Space orientation="vertical" size="small" style={{ width: '100%' }}>
					<Typography.Text type="secondary">Type</Typography.Text>
					<NativeSelect
									value={props.typeFilter}
									onChange={(value) => props.onTypeFilterChange(value as ObjectTypeFilter)}
									ariaLabel="Type filter"
									style={{ width: '100%' }}
									options={[
										{ label: 'All', value: 'all' },
										{ label: 'Folders', value: 'folders' },
										{ label: 'Files', value: 'files' },
									]}
								/>
				</Space>

				{props.isAdvanced ? (
					<>
						<Space orientation="vertical" size="small" style={{ width: '100%' }}>
							<Typography.Text type="secondary">Extension</Typography.Text>
							<DatalistInput
									value={props.extFilter}
									onChange={props.onExtFilterChange}
									placeholder="Ext…"
									ariaLabel="Extension filter"
									allowClear
									disabled={fileFiltersDisabled}
									options={props.extOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
								/>
						</Space>

						<Space orientation="vertical" size="small" style={{ width: '100%' }}>
							<Typography.Text type="secondary">Size (MB)</Typography.Text>
							<Space style={{ width: '100%' }}>
								<InputNumber
									min={0}
									step={0.1}
									placeholder="Min MB…"
									aria-label="Minimum size (MB)"
									style={{ flex: 1, maxWidth: '100%' }}
									value={mbFromBytes(props.minSizeBytes)}
									onChange={(value) => props.onMinSizeBytesChange(bytesFromMb(typeof value === 'number' ? value : null))}
									disabled={fileFiltersDisabled}
								/>
								<InputNumber
									min={0}
									step={0.1}
									placeholder="Max MB…"
									aria-label="Maximum size (MB)"
									style={{ flex: 1, maxWidth: '100%' }}
									value={mbFromBytes(props.maxSizeBytes)}
									onChange={(value) => props.onMaxSizeBytesChange(bytesFromMb(typeof value === 'number' ? value : null))}
									disabled={fileFiltersDisabled}
								/>
							</Space>
						</Space>

						<Space orientation="vertical" size="small" style={{ width: '100%' }}>
							<Typography.Text type="secondary">Last modified</Typography.Text>
							<Space style={{ width: '100%' }}>
								<input
									type="date"
									aria-label="Modified after date"
									style={{ flex: 1, maxWidth: '100%' }}
									value={modifiedAfterValue}
									onChange={(event) => {
										props.onModifiedRangeChange(localDayStartMsFromDateInput(event.currentTarget.value), props.modifiedBeforeMs)
									}}
									disabled={fileFiltersDisabled}
								/>
								<input
									type="date"
									aria-label="Modified before date"
									style={{ flex: 1, maxWidth: '100%' }}
									value={modifiedBeforeValue}
									onChange={(event) => {
										props.onModifiedRangeChange(props.modifiedAfterMs, localDayEndMsFromDateInput(event.currentTarget.value))
									}}
									disabled={fileFiltersDisabled}
								/>
							</Space>
						</Space>
					</>
				) : null}

				{props.isAdvanced ? (
					<Space orientation="vertical" size="small" style={{ width: '100%' }}>
						<Typography.Text type="secondary">Sort</Typography.Text>
						<NativeSelect
									value={props.sort}
									onChange={(value) => props.onSortChange(value as ObjectSort)}
									ariaLabel="Sort"
									style={{ width: '100%' }}
									options={[
										{ label: 'Name (A -> Z)', value: 'name_asc' },
										{ label: 'Name (Z -> A)', value: 'name_desc' },
										{ label: 'Size (smallest)', value: 'size_asc' },
										{ label: 'Size (largest)', value: 'size_desc' },
										{ label: 'Last modified (oldest)', value: 'time_asc' },
										{ label: 'Last modified (newest)', value: 'time_desc' },
									]}
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
