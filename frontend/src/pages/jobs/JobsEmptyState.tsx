import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Empty, Space, Typography } from 'antd'

import { HelpTooltip } from '../../components/HelpTooltip'
import styles from './JobsTableSection.module.css'

type Props = {
	isOffline: boolean
	uploadSupported: boolean
	filtersDirty: boolean
	onResetFilters: () => void
	eventsConnected: boolean
	onRetryRealtime: () => void
	onOpenCreateUpload: () => void
	onOpenDownloadJob: () => void
	onOpenDeleteJob: () => void
}

export function JobsEmptyState({
	isOffline,
	uploadSupported,
	filtersDirty,
	onResetFilters,
	eventsConnected,
	onRetryRealtime,
	onOpenCreateUpload,
	onOpenDownloadJob,
	onOpenDeleteJob,
}: Props) {
	const title = filtersDirty ? 'No jobs match the current filters.' : 'No jobs yet.'
	const hint = filtersDirty
		? 'Reset filters to return to the broader queue view, or start a new upload or download job.'
		: eventsConnected
			? 'Upload from this device, queue a download to your device, or create a delete job to start populating the queue.'
			: 'Realtime is disconnected. Retry realtime or start a new upload or download job to continue.'

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
				<Button type={filtersDirty || !eventsConnected ? 'default' : 'primary'} icon={<PlusOutlined />} onClick={onOpenCreateUpload} disabled={isOffline || !uploadSupported}>
					Upload…
				</Button>
				<HelpTooltip ariaLabel="Upload help" text="Uploads selected files or folders from your device to the bucket" />
				<Button onClick={onOpenDownloadJob} disabled={isOffline}>
					Download…
				</Button>
				<HelpTooltip ariaLabel="Download help" text="Downloads an S3 bucket or prefix to a folder on your device." />
				<Button danger icon={<DeleteOutlined />} onClick={onOpenDeleteJob} disabled={isOffline}>
					New delete job
				</Button>
				<HelpTooltip ariaLabel="Delete job help" text="Queues a background delete job for a bucket or prefix. Use Objects for copy or move jobs." />
			</div>
		</Empty>
	)
}
