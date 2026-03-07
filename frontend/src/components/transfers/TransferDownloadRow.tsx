import { memo } from 'react'
import { Button, Progress, Tag, Typography } from 'antd'
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons'

import type { DownloadTask } from './transferTypes'
import { formatBytes, formatDurationSeconds } from '../../lib/transfer'
import styles from './transferRows.module.css'

type TransferDownloadRowProps = {
	task: DownloadTask
	onCancel: (taskId: string) => void
	onRetry: (taskId: string) => void
	onRemove: (taskId: string) => void
	onOpenJobs?: () => void
}

export const TransferDownloadRow = memo(function TransferDownloadRow(props: TransferDownloadRowProps) {
	const t = props.task
	const percent = t.totalBytes && t.totalBytes > 0 ? Math.floor((t.loadedBytes / t.totalBytes) * 100) : 0
	const status = t.status === 'failed' ? 'exception' : t.status === 'succeeded' ? 'success' : t.status === 'running' ? 'active' : 'normal'
	const tagColor =
		t.status === 'running'
			? 'processing'
			: t.status === 'queued'
				? 'default'
				: t.status === 'waiting'
					? 'processing'
					: t.status === 'succeeded'
						? 'success'
						: t.status === 'failed'
							? 'error'
							: 'default'
	const tagText =
		t.status === 'queued'
			? 'Queued'
			: t.status === 'waiting'
				? 'Waiting'
				: t.status === 'running'
					? 'Downloading'
					: t.status === 'succeeded'
						? 'Done'
						: t.status === 'failed'
							? 'Failed'
							: 'Canceled'
	const progressText =
		t.status === 'queued'
			? null
			: t.status === 'waiting'
				? 'Waiting for job to finish…'
				: `${formatBytes(t.loadedBytes)}${t.totalBytes != null ? `/${formatBytes(t.totalBytes)}` : ''} · ${
						t.speedBps ? `${formatBytes(t.speedBps)}/s` : '-'
					} · ${t.etaSeconds ? `${formatDurationSeconds(t.etaSeconds)} eta` : '-'}`
	const subtitle =
		t.kind === 'object'
			? `s3://${t.bucket}/${t.key}`
			: t.kind === 'object_device'
				? `s3://${t.bucket}/${t.key} → ${(t.targetLabel ?? 'device')}/${t.targetPath}`
				: `job ${t.jobId} artifact`

	return (
		<div className={styles.rowCard}>
			<div className={styles.rowTop}>
				<div className={styles.rowCopy}>
					<div className={styles.rowHeader}>
						<Typography.Text strong ellipsis={{ tooltip: t.label }} className={styles.rowTitle}>
							{t.label}
						</Typography.Text>
						<Tag color={tagColor}>{tagText}</Tag>
					</div>
					<div className={styles.rowSubtitle}>
						<Typography.Text type="secondary" code ellipsis={{ tooltip: subtitle }} className={styles.rowTitle}>
							{subtitle}
						</Typography.Text>
					</div>
					{t.error ? (
						<div className={styles.rowError}>
							<Typography.Text type="danger">{t.error}</Typography.Text>
						</div>
					) : null}
				</div>

				<div className={styles.rowActions}>
					{t.kind === 'job_artifact' && props.onOpenJobs ? (
						<Button size="small" type="link" onClick={props.onOpenJobs}>
							Jobs
						</Button>
					) : null}
					{t.status === 'running' || t.status === 'queued' || t.status === 'waiting' ? (
						<Button size="small" onClick={() => props.onCancel(t.id)}>
							Cancel
						</Button>
					) : null}
					{t.status === 'failed' || t.status === 'canceled' ? (
						<Button size="small" icon={<ReloadOutlined />} onClick={() => props.onRetry(t.id)}>
							Retry
						</Button>
					) : null}
					<Button size="small" danger icon={<DeleteOutlined />} onClick={() => props.onRemove(t.id)}>
						Remove
					</Button>
				</div>
			</div>

			<div className={styles.rowProgress}>
				<Progress percent={t.status === 'succeeded' ? 100 : percent} status={status} showInfo={t.status !== 'queued' && t.status !== 'waiting'} />
				{progressText ? <Typography.Text type="secondary">{progressText}</Typography.Text> : null}
			</div>
		</div>
	)
})

TransferDownloadRow.displayName = 'TransferDownloadRow'
