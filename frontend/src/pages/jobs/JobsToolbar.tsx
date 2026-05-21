import { FilterOutlined, MoreOutlined, ReloadOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons'
import { Alert, Button, Checkbox, Grid, Space, Tag, Typography, type MenuProps } from 'antd'
import { useEffect, useState } from 'react'

import type { JobStatus } from '../../api/types'
import { uploadsUnsupportedHint } from '../../lib/actionHints'
import { DatalistInput } from '../../components/DatalistInput'
import { MenuPopover } from '../../components/MenuPopover'
import { NativeSelect } from '../../components/NativeSelect'
import { OverlaySheet } from '../../components/OverlaySheet'
import { PageHeader } from '../../components/PageHeader'
import { PageSection } from '../../components/PageSection'
import { PopoverSurface } from '../../components/PopoverSurface'
import styles from './JobsToolbar.module.css'
import type { ColumnKey, ColumnOption, ToggleableColumnKey } from './useJobsColumnsVisibility'

type TypeSuggestion = {
	value: string
	label?: string
}

type ErrorCodeSuggestion = {
	value: string
}

export type JobsToolbarProps = {
	scopeKey: string
	activeProfileName?: string | null
	isOffline: boolean
	uploadSupported: boolean
	uploadDisabledReason: string | null
	bucketLookupErrorDescription?: string | null
	eventsConnected: boolean
	eventsTransport: 'ws' | 'sse' | null
	eventsRetryCount: number
	eventsRetryThreshold: number
	onRetryRealtime: () => void
	onOpenCreateUpload: () => void
	onOpenCreateDownload: () => void
	topActionsMenu: MenuProps
	statusFilter: JobStatus | 'all'
	onStatusFilterChange: (next: JobStatus | 'all') => void
	searchFilterNormalized: string
	onSearchFilterChange: (next: string) => void
	typeFilterNormalized: string
	onTypeFilterChange: (next: string) => void
	typeFilterSuggestions: TypeSuggestion[]
	errorCodeFilterNormalized: string
	onErrorCodeFilterChange: (next: string) => void
	errorCodeSuggestions: ErrorCodeSuggestion[]
	filtersDirty: boolean
	onResetFilters: () => void
	jobsStatusSummary: {
		total: number
		active: number
		queued: number
		running: number
		succeeded: number
		failed: number
		canceled: number
	}
	columnOptions: ColumnOption[]
	mergedColumnVisibility: Record<ColumnKey, boolean>
	onSetColumnVisible: (key: ToggleableColumnKey, next: boolean) => void
	columnsDirty: boolean
	onResetColumns: () => void
	onRefreshJobs: () => void
	jobsRefreshing: boolean
	jobsCount: number
}

const MOBILE_FILTERS_MEDIA_QUERY = '(max-width: 767px)'

export function JobsToolbar(props: JobsToolbarProps) {
	const screens = Grid.useBreakpoint()
	const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
	const [mobileFiltersScopeKey, setMobileFiltersScopeKey] = useState('')
	const [useCompactFilters, setUseCompactFilters] = useState(
		() => typeof window !== 'undefined' && window.matchMedia(MOBILE_FILTERS_MEDIA_QUERY).matches,
	)
	const healthItems = [
		{ key: 'active', label: 'Active', value: props.jobsStatusSummary.active, tone: 'active', filter: 'all' },
		{ key: 'queued', label: 'Queued', value: props.jobsStatusSummary.queued, tone: 'muted', filter: 'queued' },
		{ key: 'running', label: 'Running', value: props.jobsStatusSummary.running, tone: 'active', filter: 'running' },
		{ key: 'failed', label: 'Failed', value: props.jobsStatusSummary.failed, tone: 'danger', filter: 'failed' },
		{ key: 'succeeded', label: 'Succeeded', value: props.jobsStatusSummary.succeeded, tone: 'success', filter: 'succeeded' },
		{ key: 'canceled', label: 'Canceled', value: props.jobsStatusSummary.canceled, tone: 'muted', filter: 'canceled' },
	] as const
	const advancedFiltersDirty =
		props.statusFilter !== 'all' || props.typeFilterNormalized.trim().length > 0 || props.errorCodeFilterNormalized.trim().length > 0
	const realtimePaused =
		!props.eventsConnected &&
		!props.isOffline &&
		props.eventsRetryCount >= props.eventsRetryThreshold
	const realtimeStatusLabel = props.eventsConnected
		? `Realtime: ${(props.eventsTransport ?? 'unknown').toUpperCase()}`
		: props.isOffline
			? 'Realtime paused offline'
			: 'Realtime disconnected'
	const failedJobsAvailable = props.jobsStatusSummary.failed > 0
	const troubleshootingClean =
		!props.isOffline &&
		props.uploadSupported &&
		!props.bucketLookupErrorDescription &&
		props.eventsConnected &&
		!failedJobsAvailable

	useEffect(() => {
		if (typeof window === 'undefined') return
		const media = window.matchMedia(MOBILE_FILTERS_MEDIA_QUERY)
		const update = (matches: boolean) => {
			setUseCompactFilters(matches)
			if (!matches) {
				setMobileFiltersOpen(false)
				setMobileFiltersScopeKey('')
			}
		}
		update(media.matches)
		const listener = (event: MediaQueryListEvent) => update(event.matches)
		media.addEventListener('change', listener)
		return () => media.removeEventListener('change', listener)
	}, [])
	const mobileFiltersOpenVisible = mobileFiltersOpen && mobileFiltersScopeKey === props.scopeKey
	const mobileFiltersSheetId = 'jobs-mobile-filters-sheet-panel'
	const columnsPopoverId = 'jobs-columns-popover-panel'
	const setScopedMobileFiltersOpen = (nextOpen: boolean) => {
		setMobileFiltersOpen(nextOpen)
		setMobileFiltersScopeKey(nextOpen ? props.scopeKey : '')
	}

	const advancedFilterFields = (
		<>
			<NativeSelect
				value={props.statusFilter}
				onChange={(next) => props.onStatusFilterChange(next as JobStatus | 'all')}
				ariaLabel="Job status filter"
				className={styles.statusFilterControl}
				options={[
					{ label: 'All statuses', value: 'all' },
					{ label: 'queued', value: 'queued' },
					{ label: 'running', value: 'running' },
					{ label: 'succeeded', value: 'succeeded' },
					{ label: 'failed', value: 'failed' },
					{ label: 'canceled', value: 'canceled' },
				]}
			/>
			<DatalistInput
				value={props.typeFilterNormalized}
				onChange={props.onTypeFilterChange}
				placeholder="Type (exact, optional)…"
				ariaLabel="Job type filter"
				allowClear
				className={styles.typeFilterControl}
				options={props.typeFilterSuggestions}
			/>
			<DatalistInput
				value={props.errorCodeFilterNormalized}
				onChange={props.onErrorCodeFilterChange}
				placeholder="Error code (exact, optional)…"
				ariaLabel="Job error code filter"
				allowClear
				className={styles.errorCodeFilterControl}
				options={props.errorCodeSuggestions}
			/>
		</>
	)

	return (
		<>
			<PageHeader
				eyebrow="Operations"
				title="Activity"
				subtitle={
					props.activeProfileName
						? `${props.activeProfileName} profile is active. Review background work, failures, and recent queue history.`
						: 'Review background work, failures, and recent queue history.'
				}
				actions={
					<Space wrap>
						<Tag color={props.eventsConnected ? 'success' : 'default'}>{realtimeStatusLabel}</Tag>
						<Button icon={<ReloadOutlined />} onClick={props.onRefreshJobs} loading={props.jobsRefreshing} disabled={props.isOffline}>
							Refresh
						</Button>
						<MenuPopover menu={props.topActionsMenu} align="end" scopeKey={props.scopeKey}>
							{({ toggle, open }) => (
								<Button icon={<MoreOutlined />} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
									More
								</Button>
							)}
						</MenuPopover>
					</Space>
				}
			/>

			{troubleshootingClean ? null : (
				<PageSection
					title="Needs attention"
					description="Only active recovery signals are shown here."
				>
					<div className={styles.troubleshootingPanel}>
						{!props.eventsConnected || props.isOffline ? (
							<div className={styles.realtimeStatusRow}>
								<Tag color={props.eventsConnected ? 'success' : 'default'}>{realtimeStatusLabel}</Tag>
								<Typography.Text type="secondary">
									{props.eventsConnected
										? 'Live job updates are connected.'
										: props.isOffline
											? 'Network is offline; retry when connectivity returns.'
											: realtimePaused
												? 'Auto-retry paused.'
												: props.eventsRetryCount > 0
													? `Reconnecting attempt ${props.eventsRetryCount}.`
													: 'Reconnecting.'}
								</Typography.Text>
							</div>
						) : null}

						<div className={styles.alertStack}>
							{failedJobsAvailable ? (
								<Alert
									type="error"
									showIcon
									title={`${props.jobsStatusSummary.failed.toLocaleString()} failed job${props.jobsStatusSummary.failed === 1 ? '' : 's'} need review`}
									description="Filter to failed jobs, open details, then use retry, logs, or delete actions on the affected rows."
									action={
										<Button
											size="small"
											onClick={() => props.onStatusFilterChange('failed')}
											disabled={props.statusFilter === 'failed'}
										>
											Show failed jobs
										</Button>
									}
								/>
							) : null}
							{props.isOffline ? <Alert type="warning" showIcon title="Offline: job actions are disabled." /> : null}
							{!props.uploadSupported ? (
								<Alert
									type="info"
									showIcon
									title="Upload actions are disabled for this provider"
									description={props.uploadDisabledReason ?? uploadsUnsupportedHint()}
								/>
							) : null}
							{props.bucketLookupErrorDescription ? (
								<Alert
									type="warning"
									showIcon
									title="Bucket lookup unavailable"
									description={`${props.bucketLookupErrorDescription} You can still type a bucket name manually in Upload, Download, and Delete dialogs.`}
								/>
							) : null}
							{!props.eventsConnected && !props.isOffline ? (
								<Alert
									type="warning"
									showIcon
									title="Realtime updates disconnected"
									description={
										realtimePaused
											? 'Auto-retry paused. Use Retry realtime to reconnect.'
											: props.eventsRetryCount > 0
												? `Reconnecting… attempt ${props.eventsRetryCount}`
												: 'Reconnecting…'
									}
									action={
										realtimePaused ? (
											<Button size="small" onClick={props.onRetryRealtime}>
												Retry realtime
											</Button>
										) : null
									}
								/>
							) : null}
						</div>
					</div>
				</PageSection>
			)}

			<PageSection
				title="Queue health"
				description={
					props.filtersDirty
						? 'Current loaded jobs after filters. Reset filters to return to the broader queue view.'
						: 'Current loaded jobs split by status so active and failed work is visible at a glance.'
				}
				actions={
					<Typography.Text type="secondary" className={styles.sectionMeta}>
						{props.jobsStatusSummary.total
							? `${props.jobsStatusSummary.total.toLocaleString()} loaded`
							: 'No jobs loaded yet'}
					</Typography.Text>
				}
			>
				<div className={styles.healthGrid}>
					{healthItems.map((item) => (
						<button
							key={item.key}
							type="button"
							data-testid={`jobs-health-${item.key}`}
							aria-label={`Filter to ${item.label.toLowerCase()} jobs`}
							className={`${styles.healthCard} ${styles[`healthCard${item.tone[0].toUpperCase()}${item.tone.slice(1)}`]}`}
							onClick={() => props.onStatusFilterChange(item.filter)}
						>
							<Typography.Text type="secondary" className={styles.healthLabel}>
								{item.label}
							</Typography.Text>
							<Typography.Text className={styles.healthValue}>{item.value.toLocaleString()}</Typography.Text>
						</button>
					))}
				</div>
			</PageSection>

			<PageSection
				title="Filters & layout"
				description="Search loaded jobs by id, payload, summary, or errors. You can also narrow the queue by status, job type, or error code, then adjust visible columns. Use Objects for copy, move, and indexing workflows."
				actions={
					<Typography.Text type="secondary" className={styles.sectionMeta}>
						{props.jobsCount ? `${props.jobsCount.toLocaleString()} jobs loaded` : 'No jobs loaded yet'}
					</Typography.Text>
				}
			>
				<div className={styles.filtersRow}>
					<DatalistInput
						value={props.searchFilterNormalized}
						onChange={props.onSearchFilterChange}
						placeholder="Search jobs…"
						ariaLabel="Search jobs"
						allowClear
						className={styles.searchFilterControl}
						options={[]}
						prefix={<SearchOutlined />}
					/>
					{useCompactFilters ? (
						<Button
							icon={<FilterOutlined />}
							onClick={() => setScopedMobileFiltersOpen(true)}
							data-testid="jobs-mobile-filters-trigger"
							className={styles.mobileFiltersTrigger}
							aria-haspopup="dialog"
							aria-expanded={mobileFiltersOpenVisible}
							aria-controls={mobileFiltersSheetId}
						>
							{advancedFiltersDirty ? 'Filters active' : 'Filters'}
						</Button>
					) : (
						advancedFilterFields
					)}
					<Button onClick={props.onResetFilters} disabled={!props.filtersDirty}>
						Reset filters
					</Button>
					<PopoverSurface
						key={`columns:${props.scopeKey}`}
						align="end"
						closeOnTab={false}
						contentClassName={styles.columnsDropdown}
						contentProps={{
							id: columnsPopoverId,
							role: 'dialog',
							'aria-label': 'Job columns',
						}}
						content={({ close }) => (
							<Space orientation="vertical" size={4} className={styles.columnsDropdownList}>
								{props.columnOptions.map((option) => (
									<Checkbox
										key={option.key}
										checked={props.mergedColumnVisibility[option.key]}
										onChange={(event) => props.onSetColumnVisible(option.key, event.target.checked)}
									>
										{option.label}
									</Checkbox>
								))}
								<Button
									size="small"
									onClick={() => {
										props.onResetColumns()
										close('content')
									}}
									disabled={!props.columnsDirty}
								>
									Reset columns
								</Button>
							</Space>
						)}
					>
						{({ toggle, open }) => (
							<Button
								icon={<SettingOutlined />}
								onClick={toggle}
								data-testid="jobs-columns-trigger"
								aria-haspopup="dialog"
								aria-expanded={open}
								aria-controls={columnsPopoverId}
							>
								Columns
							</Button>
						)}
					</PopoverSurface>
				</div>
				{useCompactFilters ? (
					<Typography.Text type="secondary" className={styles.mobileFiltersHint} data-testid="jobs-mobile-filters-hint">
						Search current jobs here, or open Filters for status, type, and error code.
					</Typography.Text>
				) : null}
				{useCompactFilters ? (
					<OverlaySheet
						open={mobileFiltersOpenVisible}
						onClose={() => setScopedMobileFiltersOpen(false)}
						title="Job filters"
						placement={screens.md ? 'right' : 'bottom'}
						height={!screens.md ? 'min(80dvh, 560px)' : undefined}
						width={screens.md ? 520 : undefined}
						sheetId={mobileFiltersSheetId}
						dataTestId="jobs-mobile-filters-sheet"
						bodyClassName={styles.mobileFiltersBody}
						footer={
							<>
								<Button onClick={props.onResetFilters} disabled={!props.filtersDirty}>
									Reset filters
								</Button>
								<Button type="primary" onClick={() => setScopedMobileFiltersOpen(false)}>
									Done
								</Button>
							</>
						}
					>
						<div className={styles.mobileFiltersStack}>{advancedFilterFields}</div>
					</OverlaySheet>
				) : null}
			</PageSection>
		</>
	)
}
