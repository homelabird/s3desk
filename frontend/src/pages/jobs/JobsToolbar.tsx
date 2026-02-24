import { MoreOutlined, PlusOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons'
import { Alert, Button, Checkbox, Dropdown, Space, Tag, Tooltip, Typography, type MenuProps } from 'antd'

import type { JobStatus } from '../../api/types'
import { DatalistInput } from '../../components/DatalistInput'
import { NativeSelect } from '../../components/NativeSelect'
import type { ColumnKey, ColumnOption, ToggleableColumnKey } from './useJobsColumnsVisibility'

type TypeSuggestion = {
	value: string
	label?: string
}

type ErrorCodeSuggestion = {
	value: string
}

type Props = {
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
	isMdScreen: boolean
	dropdownBg: string
	dropdownBorder: string
	dropdownBorderRadius: number
	dropdownShadow: string
}

export function JobsToolbar(props: Props) {
	return (
		<>
			<div
				style={{
					display: 'flex',
					width: '100%',
					justifyContent: 'space-between',
					alignItems: 'center',
					gap: 12,
					flexWrap: 'wrap',
				}}
			>
				<Typography.Title level={2} style={{ margin: 0 }}>
					Jobs
				</Typography.Title>
				<Space wrap>
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
					<Dropdown menu={props.topActionsMenu} trigger={['click']} placement="bottomRight">
						<Button icon={<MoreOutlined />}>More</Button>
					</Dropdown>
				</Space>
			</div>

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

			<Space wrap style={{ width: '100%' }}>
				<NativeSelect
					value={props.statusFilter}
					onChange={(next) => props.onStatusFilterChange(next as JobStatus | 'all')}
					ariaLabel="Job status filter"
					style={{ width: props.isMdScreen ? 200 : '100%', maxWidth: '100%' }}
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
					style={{ width: props.isMdScreen ? 340 : '100%', maxWidth: '100%' }}
					options={props.typeFilterSuggestions}
				/>
				<DatalistInput
					value={props.errorCodeFilterNormalized}
					onChange={props.onErrorCodeFilterChange}
					placeholder="Error code (exact, optional)…"
					ariaLabel="Job error code filter"
					allowClear
					style={{ width: props.isMdScreen ? 260 : '100%', maxWidth: '100%' }}
					options={props.errorCodeSuggestions}
				/>
				<Button onClick={props.onResetFilters} disabled={!props.filtersDirty}>
					Reset filters
				</Button>
				<Dropdown
					trigger={['click']}
					dropdownRender={() => (
						<div
							style={{
								padding: 8,
								width: 220,
								background: props.dropdownBg,
								border: `1px solid ${props.dropdownBorder}`,
								borderRadius: props.dropdownBorderRadius,
								boxShadow: props.dropdownShadow,
							}}
						>
							<Space direction="vertical" size={4} style={{ width: '100%' }}>
								{props.columnOptions.map((option) => (
									<Checkbox
										key={option.key}
										checked={props.mergedColumnVisibility[option.key]}
										onChange={(event) => props.onSetColumnVisible(option.key, event.target.checked)}
									>
										{option.label}
									</Checkbox>
								))}
								<Button size="small" onClick={props.onResetColumns} disabled={!props.columnsDirty}>
									Reset columns
								</Button>
							</Space>
						</div>
					)}
				>
					<Button icon={<SettingOutlined />}>Columns</Button>
				</Dropdown>
				<Button icon={<ReloadOutlined />} onClick={props.onRefreshJobs} loading={props.jobsRefreshing} disabled={props.isOffline}>
					Refresh
				</Button>
				<Typography.Text type="secondary">{props.jobsCount ? `${props.jobsCount} jobs` : ''}</Typography.Text>
			</Space>
		</>
	)
}
