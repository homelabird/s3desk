import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Input } from 'antd'

import { NativeSelect } from '../../components/NativeSelect'
import {
	formatLocalDateInputValue,
	localDayEndMsFromDateInput,
	localDayStartMsFromDateInput,
} from '../../lib/localDate'
import styles from './ObjectsSearch.module.css'

type ObjectsGlobalSearchControlsProps = {
	extFilter: string
	isMd: boolean
	isRefreshing: boolean
	limit: number
	maxSizeBytes: number | null
	minSizeBytes: number | null
	modifiedAfterMs: number | null
	modifiedBeforeMs: number | null
	onExtFilterChange: (value: string) => void
	onLimitChange: (value: number) => void
	onMaxSizeBytesChange: (value: number | null) => void
	onMinSizeBytesChange: (value: number | null) => void
	onModifiedRangeChange: (startMs: number | null, endMs: number | null) => void
	onPrefixFilterChange: (value: string) => void
	onQueryDraftChange: (value: string) => void
	onRefresh: () => void
	onReset: () => void
	prefixFilter: string
	queryDraft: string
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

export function ObjectsGlobalSearchControls({
	extFilter,
	isMd,
	isRefreshing,
	limit,
	maxSizeBytes,
	minSizeBytes,
	modifiedAfterMs,
	modifiedBeforeMs,
	onExtFilterChange,
	onLimitChange,
	onMaxSizeBytesChange,
	onMinSizeBytesChange,
	onModifiedRangeChange,
	onPrefixFilterChange,
	onQueryDraftChange,
	onRefresh,
	onReset,
	prefixFilter,
	queryDraft,
}: ObjectsGlobalSearchControlsProps) {
	const buttonSize = isMd ? 'middle' : 'small'
	const modifiedAfterValue = formatLocalDateInputValue(modifiedAfterMs)
	const modifiedBeforeValue = formatLocalDateInputValue(modifiedBeforeMs)
	const minSizeValue = mbFromBytes(minSizeBytes)
	const maxSizeValue = mbFromBytes(maxSizeBytes)
	const inputFieldClass = `${styles.drawerResponsiveField} ${styles.drawerCompactField} ${isMd ? styles.globalSearchInputMd : ''}`
	const prefixFieldClass = `${styles.drawerResponsiveField} ${styles.drawerCompactField} ${isMd ? styles.globalSearchPrefixMd : ''}`
	const limitFieldClass = `${styles.drawerResponsiveField} ${styles.drawerCompactField} ${isMd ? styles.globalSearchLimitMd : ''}`
	const extFieldClass = `${styles.drawerResponsiveField} ${styles.drawerCompactField} ${isMd ? styles.globalSearchExtMd : ''}`
	const sizeFieldClass = `${styles.drawerResponsiveField} ${styles.drawerCompactField} ${isMd ? styles.globalSearchSizeMd : ''}`
	const dateFieldClass = `${styles.drawerResponsiveField} ${styles.drawerCompactField} ${isMd ? styles.globalSearchDateMd : ''}`

	return (
		<>
			<section className={styles.globalSearchSection}>
				<div className={styles.globalSearchSectionTitle} data-testid="objects-global-search-search-section">
					Search
				</div>
				<div className={styles.globalSearchFieldRow}>
					<Input
						size={buttonSize}
						allowClear
						prefix={<SearchOutlined />}
						placeholder="Search query (substring)…"
						aria-label="Search query"
						className={inputFieldClass}
						value={queryDraft}
						onChange={(event) => onQueryDraftChange(event.target.value)}
					/>
					<Input
						size={buttonSize}
						allowClear
						placeholder="Prefix filter (optional)…"
						aria-label="Prefix filter"
						className={prefixFieldClass}
						value={prefixFilter}
						onChange={(event) => onPrefixFilterChange(event.target.value)}
					/>
					<NativeSelect
						value={String(limit)}
						onChange={(value) => onLimitChange(Number(value))}
						ariaLabel="Result limit"
						className={limitFieldClass}
						options={[
							{ label: 'Limit 50', value: '50' },
							{ label: 'Limit 100', value: '100' },
							{ label: 'Limit 200', value: '200' },
						]}
					/>
					<div className={styles.globalSearchButtonRow} data-testid="objects-global-search-actions">
						<Button
							size={buttonSize}
							className={styles.globalSearchCompactButton}
							icon={<ReloadOutlined />}
							onClick={onRefresh}
							loading={isRefreshing}
						>
							Refresh
						</Button>
						<Button size={buttonSize} className={styles.globalSearchCompactButton} onClick={onReset}>
							Reset
						</Button>
					</div>
				</div>
			</section>

			<section className={styles.globalSearchSection}>
				<div className={styles.globalSearchSectionTitle}>Filters</div>
				<div className={styles.globalSearchFieldRow}>
					<Input
						size={buttonSize}
						allowClear
						placeholder="Ext (e.g. log)…"
						aria-label="Extension filter"
						className={extFieldClass}
						value={extFilter}
						onChange={(event) => onExtFilterChange(event.target.value)}
					/>
					<input
						type="number"
						min={0}
						step={0.1}
						inputMode="decimal"
						placeholder="Min MB…"
						aria-label="Minimum size (MB)"
						className={`${sizeFieldClass} ${styles.globalSearchNumberInput}`}
						value={minSizeValue == null ? '' : String(minSizeValue)}
						onChange={(event) => onMinSizeBytesChange(bytesFromMb(parseNumberInput(event.currentTarget.value)))}
					/>
					<input
						type="number"
						min={0}
						step={0.1}
						inputMode="decimal"
						placeholder="Max MB…"
						aria-label="Maximum size (MB)"
						className={`${sizeFieldClass} ${styles.globalSearchNumberInput}`}
						value={maxSizeValue == null ? '' : String(maxSizeValue)}
						onChange={(event) => onMaxSizeBytesChange(bytesFromMb(parseNumberInput(event.currentTarget.value)))}
					/>
					<input
						type="date"
						aria-label="Modified after date"
						className={`${dateFieldClass} ${styles.globalSearchDateInput}`}
						value={modifiedAfterValue}
						onChange={(event) => {
							onModifiedRangeChange(localDayStartMsFromDateInput(event.currentTarget.value), modifiedBeforeMs)
						}}
					/>
					<input
						type="date"
						aria-label="Modified before date"
						className={`${dateFieldClass} ${styles.globalSearchDateInput}`}
						value={modifiedBeforeValue}
						onChange={(event) => {
							onModifiedRangeChange(modifiedAfterMs, localDayEndMsFromDateInput(event.currentTarget.value))
						}}
					/>
				</div>
			</section>
		</>
	)
}
