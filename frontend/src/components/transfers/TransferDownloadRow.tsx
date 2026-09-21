import { isDownloadLinkFresh } from './nativeDownloadLink'
import { memo } from 'react'
import { Button, Progress, Tag, Typography } from 'antd'
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons'

import { isTransferFinished, type DownloadTask } from './transferTypes'
import { formatBytes, formatDurationSeconds } from '../../lib/transfer'
import styles from './transferRows.module.css'

type TransferDownloadRowProps = {
	task: DownloadTask
	onCancel: (taskId: string) => void
	onRetry: (taskId: string) => void
	onHandOff?: (taskId: string) => void
	onRemove: (taskId: string) => void
	onOpenJobs?: (profileId: string, jobId: string) => void
}

export const TransferDownloadRow = memo(function TransferDownloadRow(props: TransferDownloadRowProps) {
	const t = props.task
	const percent = t.totalBytes && t.totalBytes > 0 ? Math.floor((t.loadedBytes / t.totalBytes) * 100) : 0
	const progressPercent = t.status === 'succeeded' ? 100 : percent
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
	const tagText = t.status === 'ready' ? 'Ready to save' : t.status === 'handed_off' ? 'Sent to browser' :
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
	const downloadActionContext = `download ${t.label}`
	const rowLabel = `Download ${t.label}, ${tagText}, ${subtitle}`

	return (
		<div
			className={styles.rowCard}
			data-testid="transfer-download-row"
			data-transfer-row-kind="download"
			role="listitem"
			aria-label={rowLabel}
		>
			<div className={styles.rowTop}>
				<div className={styles.rowCopy}>
					<div className={styles.rowHeader}>
						<Typography.Text strong ellipsis={{ tooltip: t.label }} className={styles.rowTitle}>
							{t.label}
						</Typography.Text>
						<Tag color={tagColor} aria-live="polite" aria-atomic="true">
							{tagText}
						</Tag>
					</div>
					<div className={styles.rowSubtitle}>
						<Typography.Text type="secondary" code title={subtitle} className={styles.rowDestination}>
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
					{t.status === 'ready' && t.nativeDownloadUrl ? (
						<Button size="small" type="primary" href={t.nativeDownloadUrl}
							target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
							download={t.filenameHint || t.label}
							aria-label={`Save ${downloadActionContext}`}
							onClick={(event) => {
								if (!isDownloadLinkFresh(t.nativeDownloadExpiresAtMs)) {
									event.preventDefault()
									props.onRetry(t.id)
									return
								}
								// Keep the anchor in the DOM through its default navigation.
								setTimeout(() => props.onHandOff?.(t.id), 0)
							}}>
							Save file
						</Button>
					) : null}
					{t.kind === 'job_artifact'  && props.onOpenJobs ? (
						<Button
							size="small"
							type="link"
							aria-label={`Jobs for ${downloadActionContext}`}
							onClick={() => { if (t.kind === 'job_artifact') props.onOpenJobs?.(t.profileId, t.jobId) }}
						>
							Jobs
						</Button>
					) : null}
					{t.status === 'running' || t.status === 'queued' || t.status === 'waiting' || t.status === 'ready' ? (
						<Button
							size="small"
							aria-label={`Cancel ${downloadActionContext}`}
							onClick={() => props.onCancel(t.id)}
						>
							Cancel
						</Button>
					) : null}
					{t.status === 'failed' || t.status === 'canceled' || t.status === 'ready' || t.status === 'handed_off' ? (
						<Button
							size="small"
							icon={<ReloadOutlined />}
							aria-label={`${t.status === 'handed_off' ? 'Download again' : 'Retry'} ${downloadActionContext}`}
							title={t.status === 'handed_off' ? 'Prepare a new link. Check the browser download manager first to avoid a duplicate.' : undefined}
							onClick={() => props.onRetry(t.id)}
						>
							{t.status === 'handed_off' ? 'Download again' : 'Retry'}
						</Button>
					) : null}
					{isTransferFinished(t.status) ? (
						<Button
							size="small"
							danger
							icon={<DeleteOutlined />}
							aria-label={`Remove ${downloadActionContext}`}
							onClick={() => props.onRemove(t.id)}
						>
							Remove
						</Button>
					) : null}
				</div>
			</div>

			{t.status === 'ready' || t.status === 'handed_off' ? (
				<Typography.Text type="secondary">
					{t.status === 'ready'
						? 'Tap Save file to start the browser download. Links expire after five minutes; Retry renews the link.'
						: 'Sent to the browser download manager. This page cannot confirm disk saving or cancel the browser download. Check the download manager before preparing another link to avoid duplicates.'}
				</Typography.Text>
			) : <div className={styles.rowProgress}>
				<Progress
					aria-label={`Download progress for ${t.label}`}
					percent={progressPercent}
					status={status}
					showInfo={t.status !== 'queued' && t.status !== 'waiting'}
				/>
				{progressText ? (
					<Typography.Text type="secondary">
						{progressText}
					</Typography.Text>
				) : null}
			</div>}
		</div>
	)
})

TransferDownloadRow.displayName = 'TransferDownloadRow'
