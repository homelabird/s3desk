import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Empty, Space, Typography } from 'antd'

import { HelpTooltip } from '../../components/HelpTooltip'
import styles from './JobsTableSection.module.css'

type Props = {
	isOffline: boolean
	uploadSupported: boolean
	onOpenCreateUpload: () => void
	onOpenDownloadJob: () => void
	onOpenDeleteJob: () => void
}

export function JobsEmptyState({
	isOffline,
	uploadSupported,
	onOpenCreateUpload,
	onOpenDownloadJob,
	onOpenDeleteJob,
}: Props) {
	return (
		<Empty
			description={
				<Space orientation="vertical" size={6} className={styles.emptyCopy}>
					<Typography.Text strong>No jobs yet.</Typography.Text>
					<Typography.Text type="secondary" className={styles.emptyHint}>
						Upload from this device, queue a download to your device, or create a delete job to start populating the queue.
					</Typography.Text>
				</Space>
			}
		>
			<div className={styles.emptyActionRow}>
				<Button type="primary" icon={<PlusOutlined />} onClick={onOpenCreateUpload} disabled={isOffline || !uploadSupported}>
					Upload…
				</Button>
				<HelpTooltip text="Uploads selected files or folders from your device to the bucket" />
				<Button onClick={onOpenDownloadJob} disabled={isOffline}>
					Download…
				</Button>
				<HelpTooltip text="Downloads an S3 bucket or prefix to a folder on your device." />
				<Button danger icon={<DeleteOutlined />} onClick={onOpenDeleteJob} disabled={isOffline}>
					New delete job
				</Button>
				<HelpTooltip text="Queues a background delete job for a bucket or prefix. Use Objects for copy or move jobs." />
			</div>
		</Empty>
	)
}
