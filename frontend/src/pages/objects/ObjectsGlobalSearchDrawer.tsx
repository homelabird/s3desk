import { Alert, Button, Empty, Input, Spin } from 'antd'
import {
	CopyOutlined,
	DownloadOutlined,
	DownOutlined,
	InfoCircleOutlined,
	ReloadOutlined,
	SearchOutlined,
} from '@ant-design/icons'
import { useState } from 'react'

import type { ObjectItem } from '../../api/types'
import { NativeSelect } from '../../components/NativeSelect'
import { formatDateTime } from '../../lib/format'
import {
	formatLocalDateInputValue,
	localDayEndMsFromDateInput,
	localDayStartMsFromDateInput,
} from '../../lib/localDate'
import { formatBytes } from '../../lib/transfer'
import { ObjectsOverlaySheet } from './ObjectsOverlaySheet'
import styles from './ObjectsSearch.module.css'

type ObjectsGlobalSearchDrawerProps = {
	open: boolean
	onClose: () => void
	hasProfile: boolean
	hasBucket: boolean
	bucket: string
	currentPrefix: string
	isMd: boolean
	queryDraft: string
	onQueryDraftChange: (value: string) => void
	prefixFilter: string
	onPrefixFilterChange: (value: string) => void
	limit: number
	onLimitChange: (value: number) => void
	extFilter: string
	onExtFilterChange: (value: string) => void
	minSizeBytes: number | null
	maxSizeBytes: number | null
	onMinSizeBytesChange: (value: number | null) => void
	onMaxSizeBytesChange: (value: number | null) => void
	modifiedAfterMs: number | null
	modifiedBeforeMs: number | null
	onModifiedRangeChange: (startMs: number | null, endMs: number | null) => void
	onReset: () => void
	onRefresh: () => void
	isRefreshing: boolean
	isError: boolean
	isNotIndexed: boolean
	errorMessage: string
	onCreateIndexJob: () => void
	isCreatingIndexJob: boolean
	indexPrefix: string
	onIndexPrefixChange: (value: string) => void
	indexFullReindex: boolean
	onIndexFullReindexChange: (value: boolean) => void
	searchQueryText: string
	isFetching: boolean
	hasNextPage: boolean
	isFetchingNextPage: boolean
	items: ObjectItem[]
	onLoadMore: () => void
	onUseCurrentPrefix: () => void
	onOpenPrefixForKey: (key: string) => void
	onCopyKey: (key: string) => void
	onDownloadKey: (key: string, size?: number) => void
	onOpenDetails: (key: string) => void
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

type ObjectsGlobalSearchIndexPanelProps = Pick<
	ObjectsGlobalSearchDrawerProps,
	| 'bucket'
	| 'currentPrefix'
	| 'indexPrefix'
	| 'onIndexPrefixChange'
	| 'onUseCurrentPrefix'
	| 'indexFullReindex'
	| 'onIndexFullReindexChange'
	| 'onCreateIndexJob'
	| 'isCreatingIndexJob'
	| 'isNotIndexed'
	| 'isMd'
>

function ObjectsGlobalSearchIndexPanel(props: ObjectsGlobalSearchIndexPanelProps) {
	const [open, setOpen] = useState(props.isNotIndexed)
	const inputFieldClass = `${styles.drawerResponsiveField} ${props.isMd ? styles.globalSearchInputMd : ''}`

	return (
		<section className={styles.globalSearchIndexCard}>
			<button type="button" className={styles.globalSearchIndexToggle} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
				<span className={styles.globalSearchSectionTitle}>Index management</span>
				<DownOutlined className={`${styles.globalSearchIndexIcon} ${open ? styles.globalSearchIndexIconOpen : ''}`} />
			</button>
			{open ? (
				<div className={styles.globalSearchIndexPanel}>
					<p className={styles.globalSearchIndexHint}>
						Build/rebuild the index for <code className={styles.globalSearchCode}>{props.bucket}</code>.
					</p>
					<div className={styles.globalSearchFieldRow}>
						<Input
							allowClear
							placeholder="Index prefix (optional)…"
							aria-label="Index prefix"
							className={inputFieldClass}
							value={props.indexPrefix}
							onChange={(event) => props.onIndexPrefixChange(event.target.value)}
						/>
						<Button size="small" onClick={props.onUseCurrentPrefix} disabled={!props.currentPrefix.trim()}>
							Use current prefix
						</Button>
						<label className={styles.globalSearchCheckboxRow}>
							<input
								type="checkbox"
								checked={props.indexFullReindex}
								onChange={(event) => props.onIndexFullReindexChange(event.currentTarget.checked)}
								aria-label="Full reindex"
							/>
							<span>Full reindex</span>
						</label>
						<Button type="primary" onClick={props.onCreateIndexJob} loading={props.isCreatingIndexJob}>
							Create index job
						</Button>
					</div>
				</div>
			) : null}
		</section>
	)
}

export function ObjectsGlobalSearchDrawer(props: ObjectsGlobalSearchDrawerProps) {
	const drawerWidth = props.isMd ? 'min(92vw, 920px)' : '100%'
	const modifiedAfterValue = formatLocalDateInputValue(props.modifiedAfterMs)
	const modifiedBeforeValue = formatLocalDateInputValue(props.modifiedBeforeMs)
	const minSizeValue = mbFromBytes(props.minSizeBytes)
	const maxSizeValue = mbFromBytes(props.maxSizeBytes)
	const inputFieldClass = `${styles.drawerResponsiveField} ${props.isMd ? styles.globalSearchInputMd : ''}`
	const prefixFieldClass = `${styles.drawerResponsiveField} ${props.isMd ? styles.globalSearchPrefixMd : ''}`
	const limitFieldClass = `${styles.drawerResponsiveField} ${props.isMd ? styles.globalSearchLimitMd : ''}`
	const extFieldClass = `${styles.drawerResponsiveField} ${props.isMd ? styles.globalSearchExtMd : ''}`
	const sizeFieldClass = `${styles.drawerResponsiveField} ${props.isMd ? styles.globalSearchSizeMd : ''}`
	const dateFieldClass = `${styles.drawerResponsiveField} ${props.isMd ? styles.globalSearchDateMd : ''}`
	const tableWrapClass = `${styles.globalSearchTableWrap} ${props.isMd ? styles.globalSearchTableWrapMd : ''}`
	const tableClass = `${styles.globalSearchTable} ${props.isMd ? styles.globalSearchTableMd : styles.globalSearchTableSm}`
	const keyTextClass = `${styles.globalSearchKeyText} ${props.isMd ? styles.globalSearchKeyTextMd : styles.globalSearchKeyTextSm}`

	return (
		<ObjectsOverlaySheet open={props.open} onClose={props.onClose} width={drawerWidth} placement="right" title="Global Search (Indexed)">
			{!props.hasProfile ? (
				<Alert type="warning" showIcon message="Select a profile first" />
			) : !props.hasBucket ? (
				<Alert type="warning" showIcon message="Select a bucket first" />
			) : (
				<div className={styles.globalSearchContent}>
					<section className={styles.globalSearchSection}>
						<Alert
							type="info"
							showIcon
							icon={<InfoCircleOutlined />}
							message="Search the whole bucket"
							description="Use Search for bucket-wide indexed matches, then add Filters to narrow by prefix, extension, size, or modified date."
							className={styles.globalSearchIntro}
						/>
					</section>

					<section className={styles.globalSearchSection}>
						<div className={styles.globalSearchSectionTitle}>Search</div>
						<div className={styles.globalSearchFieldRow}>
							<Input
								allowClear
								prefix={<SearchOutlined />}
								placeholder="Search query (substring)…"
								aria-label="Search query"
								className={inputFieldClass}
								value={props.queryDraft}
								onChange={(event) => props.onQueryDraftChange(event.target.value)}
							/>
							<Input
								allowClear
								placeholder="Prefix filter (optional)…"
								aria-label="Prefix filter"
								className={prefixFieldClass}
								value={props.prefixFilter}
								onChange={(event) => props.onPrefixFilterChange(event.target.value)}
							/>
							<NativeSelect
								value={String(props.limit)}
								onChange={(value) => props.onLimitChange(Number(value))}
								ariaLabel="Result limit"
								className={limitFieldClass}
								options={[
									{ label: 'Limit 50', value: '50' },
									{ label: 'Limit 100', value: '100' },
									{ label: 'Limit 200', value: '200' },
								]}
							/>
							<div className={styles.globalSearchButtonRow}>
								<Button icon={<ReloadOutlined />} onClick={props.onRefresh} loading={props.isRefreshing}>
									Refresh
								</Button>
								<Button onClick={props.onReset}>Reset</Button>
							</div>
						</div>
					</section>

					<section className={styles.globalSearchSection}>
						<div className={styles.globalSearchSectionTitle}>Filters</div>
						<div className={styles.globalSearchFieldRow}>
							<Input
								allowClear
								placeholder="Ext (e.g. log)…"
								aria-label="Extension filter"
								className={extFieldClass}
								value={props.extFilter}
								onChange={(event) => props.onExtFilterChange(event.target.value)}
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
								onChange={(event) => props.onMinSizeBytesChange(bytesFromMb(parseNumberInput(event.currentTarget.value)))}
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
								onChange={(event) => props.onMaxSizeBytesChange(bytesFromMb(parseNumberInput(event.currentTarget.value)))}
							/>
							<input
								type="date"
								aria-label="Modified after date"
								className={`${dateFieldClass} ${styles.globalSearchDateInput}`}
								value={modifiedAfterValue}
								onChange={(event) => {
									props.onModifiedRangeChange(localDayStartMsFromDateInput(event.currentTarget.value), props.modifiedBeforeMs)
								}}
							/>
							<input
								type="date"
								aria-label="Modified before date"
								className={`${dateFieldClass} ${styles.globalSearchDateInput}`}
								value={modifiedBeforeValue}
								onChange={(event) => {
									props.onModifiedRangeChange(props.modifiedAfterMs, localDayEndMsFromDateInput(event.currentTarget.value))
								}}
							/>
						</div>
					</section>

					{props.isError ? (
						props.isNotIndexed ? (
							<Alert
								type="info"
								showIcon
								message="Index not found"
								description="Create an s3_index_objects job first, then search again."
								action={
									<Button type="primary" size="small" onClick={props.onCreateIndexJob} loading={props.isCreatingIndexJob}>
										Index bucket
									</Button>
								}
							/>
						) : (
							<Alert type="error" showIcon message="Search failed" description={props.errorMessage} />
						)
					) : null}

					<ObjectsGlobalSearchIndexPanel
						key={props.isNotIndexed ? 'index-missing' : 'index-ready'}
						bucket={props.bucket}
						currentPrefix={props.currentPrefix}
						indexPrefix={props.indexPrefix}
						onIndexPrefixChange={props.onIndexPrefixChange}
						onUseCurrentPrefix={props.onUseCurrentPrefix}
						indexFullReindex={props.indexFullReindex}
						onIndexFullReindexChange={props.onIndexFullReindexChange}
						onCreateIndexJob={props.onCreateIndexJob}
						isCreatingIndexJob={props.isCreatingIndexJob}
						isNotIndexed={props.isNotIndexed}
						isMd={props.isMd}
					/>

					<div className={styles.globalSearchDivider} />

					{!props.searchQueryText ? (
						<Empty description="Type a query to search" />
					) : props.isFetching && props.items.length === 0 ? (
						<div className={styles.loadingRow}>
							<Spin />
						</div>
					) : props.items.length === 0 ? (
						<Empty description="No results" />
					) : (
						<>
							<p className={styles.globalSearchResultsMeta}>
								{props.items.length} result(s)
								{props.hasNextPage ? ' (more available)' : ''}
							</p>
							<div className={tableWrapClass}>
								<table className={tableClass}>
									<thead>
										<tr>
											<th className={styles.globalSearchTh}>Key</th>
											<th className={`${styles.globalSearchTh} ${styles.globalSearchThSize}`}>Size</th>
											<th className={`${styles.globalSearchTh} ${styles.globalSearchThModified}`}>Last modified</th>
											<th className={`${styles.globalSearchTh} ${styles.globalSearchThActions}`}>Actions</th>
										</tr>
									</thead>
									<tbody>
										{props.items.map((row) => (
											<tr key={row.key}>
												<td className={styles.globalSearchTd}>
													<code title={row.key} className={keyTextClass}>
														{row.key}
													</code>
												</td>
												<td className={styles.globalSearchTd}>
													<span className={styles.globalSearchMuted}>
														{typeof row.size === 'number' && row.size >= 0 ? formatBytes(row.size) : '-'}
													</span>
												</td>
												<td className={styles.globalSearchTd}>
													{row.lastModified ? (
														<code title={row.lastModified}>{formatDateTime(row.lastModified)}</code>
													) : (
														<span className={styles.globalSearchMuted}>-</span>
													)}
												</td>
												<td className={styles.globalSearchTd}>
													<div className={styles.globalSearchActionRow}>
														<Button size="small" onClick={() => props.onOpenPrefixForKey(row.key)}>
															Open
														</Button>
														<Button size="small" icon={<CopyOutlined />} aria-label="Copy key" onClick={() => props.onCopyKey(row.key)} />
														<Button
															size="small"
															icon={<DownloadOutlined />}
															aria-label="Download"
															onClick={() => props.onDownloadKey(row.key, row.size)}
														/>
														<Button
															size="small"
															icon={<InfoCircleOutlined />}
															aria-label="Open details"
															onClick={() => props.onOpenDetails(row.key)}
														/>
													</div>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
							<div className={styles.globalSearchLoadMoreRow}>
								<Button onClick={props.onLoadMore} disabled={!props.hasNextPage} loading={props.isFetchingNextPage}>
									Load more
								</Button>
							</div>
						</>
					)}
				</div>
			)}
		</ObjectsOverlaySheet>
	)
}
