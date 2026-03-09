import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Space, Typography } from 'antd'

import { OverlaySheet } from '../../components/OverlaySheet'
import { ToggleSwitch } from '../../components/ToggleSwitch'

type Props = {
	open: boolean
	onClose: () => void
	drawerWidth: number | string
	activeLogJobId: string | null
	isLogsLoading: boolean
	onRefresh: () => void
	followLogs: boolean
	onFollowLogsChange: (next: boolean) => void
	logPollPaused: boolean
	logPollFailures: number
	onResumeLogPolling: () => void
	logSearchQuery: string
	onLogSearchQueryChange: (next: string) => void
	onCopyVisibleLogs: () => Promise<void>
	normalizedLogSearchQuery: string
	visibleLogEntries: string[]
	activeLogLines: number
	onLogsContainerRef: (element: HTMLDivElement | null) => void
	visibleLogText: string
	searchInputWidth: number | string
}

export function JobsLogsDrawer(props: Props) {
	const {
		open,
		onClose,
		drawerWidth,
		activeLogJobId,
		isLogsLoading,
		onRefresh,
		followLogs,
		onFollowLogsChange,
		logPollPaused,
		logPollFailures,
		onResumeLogPolling,
		logSearchQuery,
		onLogSearchQueryChange,
		onCopyVisibleLogs,
		normalizedLogSearchQuery,
		visibleLogEntries,
		activeLogLines,
		onLogsContainerRef,
		visibleLogText,
		searchInputWidth,
	} = props

	return (
		<OverlaySheet
			open={open}
			onClose={onClose}
			title="Job Logs"
			placement="right"
			width={typeof drawerWidth === 'number' ? `${drawerWidth}px` : drawerWidth}
			extra={
				<Space>
					<Button icon={<ReloadOutlined />} disabled={!activeLogJobId} loading={isLogsLoading} onClick={onRefresh}>
						Refresh
					</Button>
					<Space>
						<Typography.Text type="secondary">Follow</Typography.Text>
						<ToggleSwitch checked={followLogs} onChange={onFollowLogsChange} ariaLabel="Follow job logs" />
					</Space>
				</Space>
			}
		>
			{activeLogJobId ? (
				<>
					{logPollPaused ? (
						<Alert
							type="warning"
							showIcon
							title="Log polling paused"
							description={`Paused after ${logPollFailures} failed attempts. Click retry to resume polling.`}
							action={
								<Button size="small" onClick={onResumeLogPolling}>
									Retry
								</Button>
							}
							style={{ marginBottom: 12 }}
						/>
					) : null}
					<Space wrap size={8} style={{ width: '100%', marginBottom: 8 }}>
						<Input
							allowClear
							placeholder="Search logs (contains)"
							aria-label="Search logs"
							value={logSearchQuery}
							onChange={(event) => onLogSearchQueryChange(event.target.value)}
							style={{ width: searchInputWidth }}
						/>
						<Button icon={<CopyOutlined />} onClick={() => void onCopyVisibleLogs()} disabled={visibleLogEntries.length === 0}>
							Copy {normalizedLogSearchQuery ? 'visible' : 'all'}
						</Button>
					</Space>
					<Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
						Lines: {activeLogLines.toLocaleString()}
						{normalizedLogSearchQuery ? ` · Matches: ${visibleLogEntries.length.toLocaleString()}` : ''}
					</Typography.Text>
					<div ref={onLogsContainerRef} style={{ maxHeight: '75vh', overflow: 'auto' }}>
						{normalizedLogSearchQuery && visibleLogEntries.length === 0 ? (
							<Typography.Text type="secondary">No matching log lines.</Typography.Text>
						) : (
							<pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{visibleLogText}</pre>
						)}
					</div>
				</>
			) : (
				<Typography.Text type="secondary">Select a job</Typography.Text>
			)}
		</OverlaySheet>
	)
}
