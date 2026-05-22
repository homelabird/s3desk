import { CloudUploadOutlined } from '@ant-design/icons'
import { Button, Empty, Space, Typography } from 'antd'

import { LinkButton } from '../../components/LinkButton'
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
	uploadSupported,
	filtersDirty,
	onResetFilters,
	eventsConnected,
	onRetryRealtime,
	onOpenCreateUpload,
}: Props) {
	const title = filtersDirty ? 'No activity matches the current filters.' : 'No activity yet.'
	const hint = filtersDirty
		? 'Reset filters to return to the broader activity view.'
		: eventsConnected
			? 'Activity appears after uploads, downloads, deletes, and other background work. Start object-specific work from Objects, or upload from this device.'
			: 'Realtime is disconnected. Retry realtime to resume live updates, or upload from this device when you are ready.'

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
			<div className={styles.emptyActionRow}>
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
				<Button
					type={filtersDirty || !eventsConnected ? 'default' : 'primary'}
					icon={<CloudUploadOutlined aria-hidden="true" />}
					onClick={onOpenCreateUpload}
					disabled={isOffline || !uploadSupported}
				>
					Upload from device
				</Button>
				<LinkButton to="/objects">Open objects</LinkButton>
			</div>
		</Empty>
	)
}
