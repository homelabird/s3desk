import { Button } from 'antd'

import { DatalistInput } from '../../components/DatalistInput'
import { NativeSelect } from '../../components/NativeSelect'
import {
	formatLocalDateInputValue,
	localDayEndMsFromDateInput,
	localDayStartMsFromDateInput,
} from '../../lib/localDate'
import { ObjectsOverlaySheet } from './ObjectsOverlaySheet'
import styles from './objects.module.css'
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

function parseNumberInput(value: string): number | null {
	const normalized = value.trim()
	if (!normalized) return null
	const parsed = Number(normalized)
	return Number.isFinite(parsed) ? parsed : null
}

export function ObjectsFiltersDrawer(props: ObjectsFiltersDrawerProps) {
	const fileFiltersDisabled = props.typeFilter === 'folders'
	const modifiedAfterValue = formatLocalDateInputValue(props.modifiedAfterMs)
	const modifiedBeforeValue = formatLocalDateInputValue(props.modifiedBeforeMs)

	return (
		<ObjectsOverlaySheet
			open={props.open}
			onClose={props.onClose}
			title={props.isAdvanced ? 'View options' : 'Filters'}
			placement="right"
			width="90%"
		>
			<div className={styles.globalSearchContent}>
				<section className={styles.globalSearchSection}>
					<div className={styles.globalSearchSectionTitle}>Favorites</div>
					<div className={styles.globalSearchFieldRow}>
						<label className={styles.globalSearchCheckboxRow}>
							<input
								type="checkbox"
								checked={props.favoritesOnly}
								onChange={(event) => props.onFavoritesOnlyChange(event.currentTarget.checked)}
								aria-label="Favorites only"
							/>
							<span>Favorites only</span>
						</label>
						<label className={styles.globalSearchCheckboxRow}>
							<input
								type="checkbox"
								checked={props.favoritesFirst}
								onChange={(event) => props.onFavoritesFirstChange(event.currentTarget.checked)}
								disabled={props.favoritesOnly}
								aria-label="Favorites first"
							/>
							<span>Favorites first</span>
						</label>
					</div>
				</section>

				<section className={styles.globalSearchSection}>
					<div className={styles.globalSearchSectionTitle}>Type</div>
					<NativeSelect
						value={props.typeFilter}
						onChange={(value) => props.onTypeFilterChange(value as ObjectTypeFilter)}
						ariaLabel="Type filter"
						className={styles.drawerFullWidth}
						options={[
							{ label: 'All', value: 'all' },
							{ label: 'Folders', value: 'folders' },
							{ label: 'Files', value: 'files' },
						]}
					/>
				</section>

				{props.isAdvanced ? (
					<>
						<section className={styles.globalSearchSection}>
							<div className={styles.globalSearchSectionTitle}>Extension</div>
							<DatalistInput
								value={props.extFilter}
								onChange={props.onExtFilterChange}
								placeholder="Ext…"
								ariaLabel="Extension filter"
								allowClear
								disabled={fileFiltersDisabled}
								options={props.extOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
							/>
						</section>

						<section className={styles.globalSearchSection}>
							<div className={styles.globalSearchSectionTitle}>Size (MB)</div>
							<div className={styles.globalSearchFieldRow}>
								<input
									type="number"
									min={0}
									step={0.1}
									inputMode="decimal"
									placeholder="Min MB…"
									aria-label="Minimum size (MB)"
									className={`${styles.drawerHalfInput} ${styles.globalSearchNumberInput}`}
									value={mbFromBytes(props.minSizeBytes) ?? ''}
									onChange={(event) => props.onMinSizeBytesChange(bytesFromMb(parseNumberInput(event.currentTarget.value)))}
									disabled={fileFiltersDisabled}
								/>
								<input
									type="number"
									min={0}
									step={0.1}
									inputMode="decimal"
									placeholder="Max MB…"
									aria-label="Maximum size (MB)"
									className={`${styles.drawerHalfInput} ${styles.globalSearchNumberInput}`}
									value={mbFromBytes(props.maxSizeBytes) ?? ''}
									onChange={(event) => props.onMaxSizeBytesChange(bytesFromMb(parseNumberInput(event.currentTarget.value)))}
									disabled={fileFiltersDisabled}
								/>
							</div>
						</section>

						<section className={styles.globalSearchSection}>
							<div className={styles.globalSearchSectionTitle}>Last modified</div>
							<div className={styles.globalSearchFieldRow}>
								<input
									type="date"
									aria-label="Modified after date"
									className={`${styles.drawerHalfInput} ${styles.globalSearchDateInput}`}
									value={modifiedAfterValue}
									onChange={(event) => {
										props.onModifiedRangeChange(localDayStartMsFromDateInput(event.currentTarget.value), props.modifiedBeforeMs)
									}}
									disabled={fileFiltersDisabled}
								/>
								<input
									type="date"
									aria-label="Modified before date"
									className={`${styles.drawerHalfInput} ${styles.globalSearchDateInput}`}
									value={modifiedBeforeValue}
									onChange={(event) => {
										props.onModifiedRangeChange(props.modifiedAfterMs, localDayEndMsFromDateInput(event.currentTarget.value))
									}}
									disabled={fileFiltersDisabled}
								/>
							</div>
						</section>

						<section className={styles.globalSearchSection}>
							<div className={styles.globalSearchSectionTitle}>Sort</div>
							<NativeSelect
								value={props.sort}
								onChange={(value) => props.onSortChange(value as ObjectSort)}
								ariaLabel="Sort"
								className={styles.drawerFullWidth}
								options={[
									{ label: 'Name (A -> Z)', value: 'name_asc' },
									{ label: 'Name (Z -> A)', value: 'name_desc' },
									{ label: 'Size (smallest)', value: 'size_asc' },
									{ label: 'Size (largest)', value: 'size_desc' },
									{ label: 'Last modified (oldest)', value: 'time_asc' },
									{ label: 'Last modified (newest)', value: 'time_desc' },
								]}
							/>
						</section>
					</>
				) : null}

				<div className={`${styles.globalSearchButtonRow} ${styles.drawerActions}`}>
					<Button onClick={props.onResetView} disabled={!props.hasActiveView}>
						Reset view
					</Button>
					<Button type="primary" onClick={props.onClose}>
						Done
					</Button>
				</div>
			</div>
		</ObjectsOverlaySheet>
	)
}
