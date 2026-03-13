import { DownloadOutlined, FilterOutlined, MoreOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons'
import { Alert, Button, Checkbox, Grid, Space, Tag, Tooltip, Typography, type MenuProps } from 'antd'
import { useEffect, useState } from 'react'

import type { JobStatus } from '../../api/types'
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

type Props = {
	activeProfileName?: string | null
	isOffline: boolean
	uploadSupported: boolean
	uploadDisabledReason: string | null
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

const MOBILE_FILTERS_MEDIA_QUERY = '(max-width: 480px)'

export function JobsToolbar(props: Props) {
	const screens = Grid.useBreakpoint()
	const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
	const [useCompactFilters, setUseCompactFilters] = useState(
		() => typeof window !== 'undefined' && window.matchMedia(MOBILE_FILTERS_MEDIA_QUERY).matches,
	)
	const healthItems = [
		{ key: 'active', label: 'Active', value: props.jobsStatusSummary.active, tone: 'active' },
		{ key: 'queued', label: 'Queued', value: props.jobsStatusSummary.queued, tone: 'muted' },
		{ key: 'running', label: 'Running', value: props.jobsStatusSummary.running, tone: 'active' },
		{ key: 'failed', label: 'Failed', value: props.jobsStatusSummary.failed, tone: 'danger' },
		{ key: 'succeeded', label: 'Succeeded', value: props.jobsStatusSummary.succeeded, tone: 'success' },
		{ key: 'canceled', label: 'Canceled', value: props.jobsStatusSummary.canceled, tone: 'muted' },
	] as const
	const advancedFiltersDirty =
		props.statusFilter !== 'all' || props.typeFilterNormalized.trim().length > 0 || props.errorCodeFilterNormalized.trim().length > 0

	useEffect(() => {
		if (typeof window === 'undefined') return
		const media = window.matchMedia(MOBILE_FILTERS_MEDIA_QUERY)
		const update = (matches: boolean) => {
			setUseCompactFilters(matches)
			if (!matches) setMobileFiltersOpen(false)
		}
		update(media.matches)
		const listener = (event: MediaQueryListEvent) => update(event.matches)
		media.addEventListener('change', listener)
		return () => media.removeEventListener('change', listener)
	}, [])

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
				title="Jobs"
				subtitle={
					props.activeProfileName
						? `${props.activeProfileName} profile is active. Monitor queue health, narrow the result set, and launch uploads, device downloads, or cleanup work from the same workspace.`
						: 'Monitor queue health, narrow the result set, and launch uploads, device downloads, or cleanup work from the same workspace.'
				}
				actions={
					<div className={styles.headerActions}>
						<Tag color={props.eventsConnected ? 'success' : 'default'}>
							{props.eventsConnected
								? `Realtime: ${(props.eventsTransport ?? 'unknown').toUpperCase()}`
								: 'Realtime disconnected'}
						</Tag>
						{!props.eventsConnected && props.eventsRetryCount >= props.eventsRetryThreshold ? (
							<Button size="small" onClick={props.onRetryRealtime} disabled={props.isOffline}>
								Retry realtime
							</Button>
						) : null}
						<Tooltip
							title={
								!props.uploadSupported
									? props.uploadDisabledReason ?? 'Uploads are not supported by this provider.'
									: 'Upload files or folders from this device'
							}
						>
							<span>
								<Button
									type="primary"
									icon={<PlusOutlined />}
									onClick={props.onOpenCreateUpload}
									disabled={props.isOffline || !props.uploadSupported}
								>
									Upload…
								</Button>
							</span>
						</Tooltip>
						<Tooltip title="Download a folder or prefix from S3 to this device">
							<span>
								<Button icon={<DownloadOutlined />} onClick={props.onOpenCreateDownload} disabled={props.isOffline}>
									Download…
								</Button>
							</span>
						</Tooltip>
						<MenuPopover menu={props.topActionsMenu} align="end">
							{({ toggle }) => (
								<Button icon={<MoreOutlined />} onClick={toggle}>
									More
								</Button>
							)}
						</MenuPopover>
					</div>
				}
			/>

			<div className={styles.alertStack}>
				{props.isOffline ? <Alert type="warning" showIcon title="Offline: job actions are disabled." /> : null}
				{!props.uploadSupported ? (
					<Alert
						type="info"
						showIcon
						title="Upload actions are disabled for this provider"
						description={props.uploadDisabledReason ?? 'This provider does not support upload transfers.'}
					/>
				) : null}
				{!props.eventsConnected && !props.isOffline ? (
					<Alert
						type="warning"
						showIcon
						title="Realtime updates disconnected"
						description={
							props.eventsRetryCount >= props.eventsRetryThreshold
								? 'Auto-retry paused. Use Retry realtime to reconnect.'
								: props.eventsRetryCount > 0
									? `Reconnecting… attempt ${props.eventsRetryCount}`
									: 'Reconnecting…'
						}
					/>
				) : null}
				</div>

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
							<div
								key={item.key}
								data-testid={`jobs-health-${item.key}`}
								className={`${styles.healthCard} ${styles[`healthCard${item.tone[0].toUpperCase()}${item.tone.slice(1)}`]}`}
							>
								<Typography.Text type="secondary" className={styles.healthLabel}>
									{item.label}
								</Typography.Text>
								<Typography.Text className={styles.healthValue}>{item.value.toLocaleString()}</Typography.Text>
							</div>
						))}
					</div>
				</PageSection>

			<PageSection
				title="Filters & layout"
				description="Search loaded jobs by id, payload, summary, or errors. You can also narrow the queue by status, job type, or error code, then adjust visible columns and refresh the current result set. Use Objects for copy, move, and indexing workflows."
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
							onClick={() => setMobileFiltersOpen(true)}
							data-testid="jobs-mobile-filters-trigger"
							className={styles.mobileFiltersTrigger}
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
						align="end"
						contentClassName={styles.columnsDropdown}
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
						{({ toggle }) => (
							<Button icon={<SettingOutlined />} onClick={toggle}>
								Columns
							</Button>
						)}
					</PopoverSurface>
					<Button icon={<ReloadOutlined />} onClick={props.onRefreshJobs} loading={props.jobsRefreshing} disabled={props.isOffline}>
						Refresh
					</Button>
				</div>
				{useCompactFilters ? (
					<Typography.Text type="secondary" className={styles.mobileFiltersHint} data-testid="jobs-mobile-filters-hint">
						Search current jobs here, or open Filters for status, type, and error code.
					</Typography.Text>
				) : null}
				{useCompactFilters ? (
					<OverlaySheet
						open={mobileFiltersOpen}
						onClose={() => setMobileFiltersOpen(false)}
						title="Job filters"
						placement={screens.md ? 'right' : 'bottom'}
						height={!screens.md ? 'min(80dvh, 560px)' : undefined}
						width={screens.md ? 520 : undefined}
						dataTestId="jobs-mobile-filters-sheet"
						bodyClassName={styles.mobileFiltersBody}
						footer={
							<>
								<Button onClick={props.onResetFilters} disabled={!props.filtersDirty}>
									Reset filters
								</Button>
								<Button type="primary" onClick={() => setMobileFiltersOpen(false)}>
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
