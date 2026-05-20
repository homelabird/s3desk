import { memo } from 'react'
import { Button, Progress, Tag, Typography } from 'antd'
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons'

import type { UploadTask } from './transferTypes'
import { formatBytes, formatDurationSeconds } from '../../lib/transfer'
import styles from './transferRows.module.css'
import { buildUploadRecoveryDescriptor } from './uploadRecoveryDescriptor'

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
	const progressPercent = t.status === 'queued' ? 0 : percent
	const status =
		t.status === 'failed'
			? 'exception'
			: t.status === 'succeeded'
				? 'success'
				: t.status === 'staging' || t.status === 'commit' || t.status === 'waiting_job'
					? 'active'
					: 'normal'
	const tagColor =
		t.status === 'staging' || t.status === 'commit' || t.status === 'waiting_job'
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
				: null
	const subtitle = `s3://${t.bucket}/${normalizePrefix(t.prefix)}`
	const recovery = buildUploadRecoveryDescriptor(t)
	const isFinalizingCommit = t.status === 'commit'
	const uploadActionContext = `upload ${t.label}`
	const rowLabel = `Upload ${t.label}, ${tagText}, ${subtitle}`

	return (
		<div
			className={styles.rowCard}
			data-testid="transfer-upload-row"
			data-transfer-row-kind="upload"
			role="listitem"
			aria-label={rowLabel}
		>
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
							<Tag color={tagColor} aria-live="polite" aria-atomic="true">
								{tagText}
							</Tag>
							{recovery.modeTagLabel ? <Tag>{recovery.modeTagLabel}</Tag> : null}
							{recovery.showFallbackTag ? <Tag color="gold">Fallback</Tag> : null}
							{preview ? <Tag color="blue">Local preview</Tag> : null}
							{t.jobId ? (
								<Tag className={styles.jobIdTag} title={t.jobId} aria-label={`Job ${t.jobId}`}>
									{formatJobIdForTag(t.jobId)}
								</Tag>
							) : null}
						</div>
						<div className={styles.rowSubtitle}>
							<Typography.Text type="secondary" code title={subtitle} className={styles.rowDestination}>
								{subtitle}
							</Typography.Text>
						</div>
						{recovery.lines.length > 0 ? (
							<div className={styles.rowRecovery} data-testid="transfer-upload-recovery">
								{recovery.lines.map((line) => (
									<Typography.Text key={line.text} type={line.tone}>
										{line.text}
									</Typography.Text>
								))}
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
						<Button
							size="small"
							type="link"
							aria-label={`Jobs for ${uploadActionContext}`}
							onClick={props.onOpenJobs}
						>
							Jobs
						</Button>
					) : null}
					{t.status === 'queued' || t.status === 'staging' || t.status === 'waiting_job' ? (
						<Button
							size="small"
							aria-label={`Cancel ${uploadActionContext}`}
							onClick={() => props.onCancel(t.id)}
						>
							Cancel
						</Button>
					) : null}
					{t.status === 'failed' || t.status === 'canceled' ? (
						<Button
							size="small"
							icon={<ReloadOutlined />}
							aria-label={`Retry ${uploadActionContext}`}
							title={
								recovery.retryRequiresFileSelection
									? 'Retry opens the file picker so you can select the same files or folder.'
									: undefined
							}
							onClick={() => props.onRetry(t.id)}
						>
							Retry
						</Button>
					) : null}
					{isFinalizingCommit ? (
						<Typography.Text type="secondary" className={styles.rowActionHint}>
							Finalizing upload…
						</Typography.Text>
					) : (
						<Button
							size="small"
							danger
							icon={<DeleteOutlined />}
							aria-label={`Remove ${uploadActionContext}`}
							onClick={() => props.onRemove(t.id)}
						>
							Remove
						</Button>
					)}
				</div>
			</div>

			<div className={styles.rowProgress}>
				<Progress
					aria-label={`Upload progress for ${t.label}`}
					percent={progressPercent}
					status={status}
					showInfo={t.status !== 'queued'}
				/>
				{progressText ? (
					<Typography.Text type="secondary">
						{progressText}
					</Typography.Text>
				) : null}
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

function formatJobIdForTag(jobId: string): string {
	if (jobId.length <= 24) return jobId
	return `${jobId.slice(0, 12)}...${jobId.slice(-8)}`
}
