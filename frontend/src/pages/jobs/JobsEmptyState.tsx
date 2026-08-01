import { Button, Empty, Space, Typography } from 'antd'

import styles from './JobsTableSection.module.css'

type Props = {
	isOffline: boolean
	uploadSupported: boolean
	filtersDirty: boolean
	onResetFilters: () => void
	eventsConnected: boolean
	onRetryRealtime: () => void
	onOpenCreateUpload: () => void
}

export function JobsEmptyState({
	isOffline,
	filtersDirty,
	onResetFilters,
	eventsConnected,
	onRetryRealtime,
}: Props) {
	const title = filtersDirty ? 'No activity matches the current filters.' : 'No activity yet.'
	const hint = filtersDirty
		? 'Reset filters to return to the broader activity view.'
		: eventsConnected
			? 'Uploads and other background work will appear here.'
			: 'Realtime is disconnected. Retry to resume live updates.'

	return (
		<Empty
			description={
				<Space orientation="vertical" size={6} className={styles.emptyCopy}>
					<Typography.Text strong>{title}</Typography.Text>
					<Typography.Text type="secondary" className={styles.emptyHint}>
						{hint}
					</Typography.Text>
				</Space>
			}
		>
			{filtersDirty || (!eventsConnected && !isOffline) ? <div className={styles.emptyActionRow}>
				{filtersDirty ? (
					<Button type="primary" onClick={onResetFilters}>
						Reset filters
					</Button>
				) : null}
				{!eventsConnected && !isOffline ? (
					<Button type={filtersDirty ? 'default' : 'primary'} onClick={onRetryRealtime}>
						Retry realtime
					</Button>
				) : null}
			</div> : null}
		</Empty>
	)
}
