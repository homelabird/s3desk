import { memo } from 'react'
import { Button, Progress, Tag, Typography } from 'antd'
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons'

import type { UploadTask } from './transferTypes'
import { formatBytes, formatDurationSeconds } from '../../lib/transfer'
import styles from './transferRows.module.css'

type TransferUploadRowProps = {
	task: UploadTask
	onOpenJobs?: () => void
	onCancel: (taskId: string) => void
	onRetry: (taskId: string) => void
	onRemove: (taskId: string) => void
}

export const TransferUploadRow = memo(function TransferUploadRow(props: TransferUploadRowProps) {
	const t = props.task
	const preview = t.preview
	const percent = t.totalBytes > 0 ? Math.floor((t.loadedBytes / t.totalBytes) * 100) : 0
	const status =
		t.status === 'failed'
			? 'exception'
			: t.status === 'succeeded'
				? 'success'
				: t.status === 'staging' || t.status === 'commit' || t.status === 'waiting_job' || t.status === 'cleanup'
					? 'active'
					: 'normal'
	const tagColor =
		t.status === 'staging' || t.status === 'commit' || t.status === 'waiting_job' || t.status === 'cleanup'
			? 'processing'
			: t.status === 'queued'
				? 'default'
				: t.status === 'succeeded'
					? 'success'
					: t.status === 'failed'
						? 'error'
						: 'default'
	const tagText =
		t.status === 'queued'
			? 'Queued'
			: t.status === 'staging'
				? 'Uploading'
				: t.status === 'commit'
					? 'Committing'
					: t.status === 'waiting_job'
						? 'Transferring'
						: t.status === 'cleanup'
							? 'Cleaning'
							: t.status === 'succeeded'
								? 'Done'
								: t.status === 'failed'
									? 'Failed'
									: 'Canceled'
	const transferMetricsText = `${formatBytes(t.loadedBytes)}/${formatBytes(t.totalBytes)} · ${t.speedBps ? `${formatBytes(t.speedBps)}/s` : '-'} · ${
		t.etaSeconds ? `${formatDurationSeconds(t.etaSeconds)} eta` : '-'
	}`
	const hasTransferMetrics = t.totalBytes > 0 || t.loadedBytes > 0 || t.speedBps > 0 || t.etaSeconds > 0
	const progressText =
		t.status === 'staging'
			? transferMetricsText
			: t.status === 'commit'
				? 'Committing…'
				: t.status === 'waiting_job'
					? hasTransferMetrics
						? transferMetricsText
						: 'Starting upload job…'
					: t.status === 'cleanup'
						? 'Removing local files…'
				: null
	const subtitle = `s3://${t.bucket}/${normalizePrefix(t.prefix)}`

	return (
		<div className={styles.rowCard} data-testid="transfer-upload-row" data-transfer-row-kind="upload">
			<div className={styles.rowTop}>
				<div className={`${styles.rowCopy} ${styles.rowCopyWithPreview}`}>
					{preview ? (
						<div className={styles.rowPreview}>
							<img
								src={preview.url}
								alt={`Local preview of ${preview.label}`}
								data-testid="transfer-upload-preview"
								className={styles.rowPreviewImage}
							/>
						</div>
					) : null}
					<div className={styles.rowCopy}>
						<div className={styles.rowHeader}>
							<Typography.Text strong ellipsis={{ tooltip: t.label }} className={styles.rowTitle}>
								{t.label}
							</Typography.Text>
							<Tag color={tagColor}>{tagText}</Tag>
							{t.uploadMode ? <Tag>{uploadModeLabel(t.uploadMode)}</Tag> : null}
							{t.moveAfterUpload ? <Tag color="gold">Move</Tag> : null}
							{preview ? <Tag color="blue">Local preview</Tag> : null}
							{t.jobId ? <Tag>{t.jobId}</Tag> : null}
						</div>
						<div className={styles.rowSubtitle}>
							<Typography.Text type="secondary" code ellipsis={{ tooltip: subtitle }} className={styles.rowTitle}>
								{subtitle}
							</Typography.Text>
						</div>
						{preview ? (
							<div className={styles.rowPreviewLabel}>
								<Typography.Text type="secondary">Preview frame: {preview.label}</Typography.Text>
							</div>
						) : null}
						{t.error ? (
							<div className={styles.rowError}>
								<Typography.Text type="danger">{t.error}</Typography.Text>
							</div>
						) : null}
					</div>
				</div>

				<div className={styles.rowActions}>
					{t.jobId && props.onOpenJobs ? (
						<Button size="small" type="link" onClick={props.onOpenJobs}>
							Jobs
						</Button>
					) : null}
					{t.status === 'queued' || t.status === 'staging' ? (
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
				<Progress percent={t.status === 'queued' ? 0 : percent} status={status} showInfo={t.status !== 'queued'} />
				{progressText ? <Typography.Text type="secondary">{progressText}</Typography.Text> : null}
			</div>
		</div>
	)
})

TransferUploadRow.displayName = 'TransferUploadRow'

function normalizePrefix(p: string): string {
	const trimmed = p.trim()
	if (!trimmed) return ''
	return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function uploadModeLabel(mode: UploadTask['uploadMode']): string {
	if (mode === 'presigned') return 'Presigned'
	if (mode === 'direct') return 'Direct'
	return 'Staging'
}
