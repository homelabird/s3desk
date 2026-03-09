import { MoreOutlined, PlusOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons'
import { Alert, Button, Checkbox, Space, Tag, Tooltip, Typography, type MenuProps } from 'antd'

import type { JobStatus } from '../../api/types'
import { DatalistInput } from '../../components/DatalistInput'
import { MenuPopover } from '../../components/MenuPopover'
import { NativeSelect } from '../../components/NativeSelect'
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
	topActionsMenu: MenuProps
	statusFilter: JobStatus | 'all'
	onStatusFilterChange: (next: JobStatus | 'all') => void
	typeFilterNormalized: string
	onTypeFilterChange: (next: string) => void
	typeFilterSuggestions: TypeSuggestion[]
	errorCodeFilterNormalized: string
	onErrorCodeFilterChange: (next: string) => void
	errorCodeSuggestions: ErrorCodeSuggestion[]
	filtersDirty: boolean
	onResetFilters: () => void
	columnOptions: ColumnOption[]
	mergedColumnVisibility: Record<ColumnKey, boolean>
	onSetColumnVisible: (key: ToggleableColumnKey, next: boolean) => void
	columnsDirty: boolean
	onResetColumns: () => void
	onRefreshJobs: () => void
	jobsRefreshing: boolean
	jobsCount: number
}

export function JobsToolbar(props: Props) {
	return (
		<>
			<PageHeader
				eyebrow="Operations"
				title="Jobs"
				subtitle={
					props.activeProfileName
						? `${props.activeProfileName} profile is active. Monitor queue health, narrow the result set, and launch device transfers from the same workspace.`
						: 'Monitor queue health, narrow the result set, and launch device transfers from the same workspace.'
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
									: 'Upload a local folder from this device'
							}
						>
							<span>
								<Button
									type="primary"
									icon={<PlusOutlined />}
									onClick={props.onOpenCreateUpload}
									disabled={props.isOffline || !props.uploadSupported}
								>
									Upload folder (device)
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
				title="Filters & layout"
				description="Narrow the queue by status, job type, or error code. You can also adjust visible columns and refresh the current result set."
				actions={
					<Typography.Text type="secondary" className={styles.sectionMeta}>
						{props.jobsCount ? `${props.jobsCount.toLocaleString()} jobs loaded` : 'No jobs loaded yet'}
					</Typography.Text>
				}
			>
				<div className={styles.filtersRow}>
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
			</PageSection>
		</>
	)
}
