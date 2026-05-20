import { ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Spin, Typography } from 'antd'
import type { ReactNode } from 'react'

import type { ObjectMeta } from '../../api/types'
import styles from './ObjectsDetails.module.css'
import {
	getObjectMediaStateDescriptor,
	getObjectPreviewDescriptor,
	getObjectPreviewLoadActionLabel,
	getObjectPreviewLoadButtonText,
	type ObjectMediaStateDescriptor,
} from './objectsMediaState'
import type { ObjectPreview } from './objectsTypes'

type ObjectsDetailsThumbnailSectionProps = {
	canOpenLargePreview: boolean
	detailsKey: string
	isImageObject: boolean
	onOpenLargePreview: () => void
	thumbnail?: ReactNode
}

type ObjectsDetailsPreviewSectionProps = {
	canCancelPreview: boolean
	canOpenLargePreview: boolean
	detailsKey: string
	detailsMeta: ObjectMeta
	isVideoObject: boolean
	onCancelPreview: () => void
	onLoadPreview: () => void
	onOpenLargePreview: () => void
	preview: ObjectPreview | null
	previewFallbackThumbnail?: ReactNode
}

export function ObjectsDetailsThumbnailSection({
	canOpenLargePreview,
	detailsKey,
	isImageObject,
	onOpenLargePreview,
	thumbnail,
}: ObjectsDetailsThumbnailSectionProps) {
	if (!thumbnail) return null

	return (
		<div className={styles.detailsSection}>
			<div className={styles.detailsSectionHeader}>
				<Typography.Text strong>Thumbnail</Typography.Text>
				{isImageObject ? (
					<Button
						data-testid="objects-details-thumbnail-open-large"
						size="small"
						type="text"
						onClick={onOpenLargePreview}
						className={styles.detailsSectionActionButton}
						aria-label="Open large"
						title="Open large"
					>
						Open large
					</Button>
				) : null}
			</div>
			<div className={styles.detailsMediaCenter}>
				{canOpenLargePreview ? (
					<button type="button" className={styles.previewTriggerButton} onClick={onOpenLargePreview} aria-label={`Open large preview for ${detailsKey}`}>
						{thumbnail}
					</button>
				) : (
					thumbnail
				)}
			</div>
		</div>
	)
}

export function ObjectsDetailsPreviewSection({
	canCancelPreview,
	canOpenLargePreview,
	detailsKey,
	detailsMeta,
	isVideoObject,
	onCancelPreview,
	onLoadPreview,
	onOpenLargePreview,
	preview,
	previewFallbackThumbnail,
}: ObjectsDetailsPreviewSectionProps) {
	const previewActionButtonProps = { className: styles.detailsSectionActionButton }
	const loadActionLabel = getObjectPreviewLoadActionLabel(preview)
	const loadButtonText = getObjectPreviewLoadButtonText(preview)

	return (
		<div className={styles.detailsSection} data-testid="objects-details-preview-section">
			<div className={styles.detailsSectionHeader}>
				<Typography.Text strong>Preview</Typography.Text>
				<div className={styles.detailsSectionActions} data-testid="objects-details-preview-actions">
					{preview?.status === 'loading' ? (
						<Button
							size="small"
							onClick={onCancelPreview}
							disabled={!canCancelPreview}
							aria-label="Cancel preview"
							title="Cancel preview"
							{...previewActionButtonProps}
						>
							Cancel
						</Button>
					) : null}
					{canOpenLargePreview ? (
						<Button
							data-testid="objects-details-preview-open-large"
							size="small"
							onClick={onOpenLargePreview}
							disabled={!detailsMeta}
							aria-label="Open large"
							title="Open large"
							{...previewActionButtonProps}
						>
							Open large
						</Button>
					) : null}
					<Button
						data-testid="objects-details-preview-load"
						size="small"
						icon={<ReloadOutlined />}
						onClick={onLoadPreview}
						disabled={!detailsMeta}
						aria-label={loadActionLabel}
						title={loadActionLabel}
						{...previewActionButtonProps}
					>
						{loadButtonText}
					</Button>
				</div>
			</div>

			<ObjectsDetailsPreviewBody
				detailsKey={detailsKey}
				isVideoObject={isVideoObject}
				onOpenLargePreview={onOpenLargePreview}
				preview={preview}
				previewFallbackThumbnail={previewFallbackThumbnail}
			/>
		</div>
	)
}

function ObjectsDetailsPreviewBody({
	detailsKey,
	isVideoObject,
	onOpenLargePreview,
	preview,
	previewFallbackThumbnail,
}: Pick<
	ObjectsDetailsPreviewSectionProps,
	'detailsKey' | 'isVideoObject' | 'onOpenLargePreview' | 'preview' | 'previewFallbackThumbnail'
>) {
	if (preview?.status === 'loading') {
		const descriptor = getObjectPreviewDescriptor(preview)
		return (
			<div className={styles.detailsFeedback} role="status" aria-live="polite" aria-label={descriptor.title}>
				<Spin />
				<span className="sr-only">{descriptor.title}</span>
			</div>
		)
	}
	if (preview?.status === 'blocked') {
		const descriptor = getObjectPreviewDescriptor(preview)
		return (
			<Alert
				type="info"
				showIcon
				title={descriptor.title}
				description={<PreviewStateDescription descriptor={descriptor} detail={preview.error} />}
			/>
		)
	}
	if (preview?.status === 'error') {
		const descriptor = getObjectPreviewDescriptor(preview)
		return (
			<Alert
				type="error"
				showIcon
				title={descriptor.title}
				description={<PreviewStateDescription descriptor={descriptor} detail={preview.error ?? 'Unknown error.'} />}
			/>
		)
	}
	if (preview?.status === 'unsupported') {
		const descriptor = getObjectPreviewDescriptor(preview)
		return (
			<Empty
				description={
					<div className={styles.detailsPreviewEmptyState}>
						<Typography.Text>{descriptor.title}</Typography.Text>
						<Typography.Text type="secondary">{descriptor.recoveryHint}</Typography.Text>
					</div>
				}
			/>
		)
	}
	if (preview?.status === 'ready' && preview.kind === 'image' && preview.url) {
		const descriptor = getObjectPreviewDescriptor(preview)
		return (
			<button type="button" className={styles.previewTriggerButton} onClick={onOpenLargePreview} aria-label={`Open large preview for ${detailsKey}`}>
				<div className={styles.previewFrame}>
					<img src={preview.url} alt={detailsKey} width={360} height={360} className={styles.detailsPreviewImage} />
					<Typography.Text type="secondary" className={styles.detailsPreviewCaption}>
						{descriptor.recoveryHint}
					</Typography.Text>
				</div>
			</button>
		)
	}
	if (preview?.status === 'ready' && preview.kind === 'video' && preview.url) {
		const descriptor = getObjectPreviewDescriptor(preview)
		return (
			<button type="button" className={styles.previewTriggerButton} onClick={onOpenLargePreview} aria-label={`Open large preview for ${detailsKey}`}>
				<div className={styles.previewFrame}>
					<img src={preview.url} alt={`Thumbnail preview of ${detailsKey}`} width={360} height={360} className={styles.detailsPreviewImage} />
					<Typography.Text type="secondary" className={styles.detailsPreviewCaption}>
						{descriptor.recoveryHint}
					</Typography.Text>
				</div>
			</button>
		)
	}
	if (preview?.status === 'ready' && (preview.kind === 'text' || preview.kind === 'json')) {
		return (
			<div className={styles.detailsCodePreview}>
				<pre className={styles.detailsCodePre}>
					{preview.text}
					{preview.truncated ? '\n\n…(truncated)…' : ''}
				</pre>
			</div>
		)
	}
	if (isVideoObject && previewFallbackThumbnail) {
		const descriptor = getObjectMediaStateDescriptor('fallback-thumbnail-shown')
		return (
			<div className={styles.previewFrame}>
				<div className={styles.detailsMediaCenter}>{previewFallbackThumbnail}</div>
				<Typography.Text type="secondary" className={styles.detailsPreviewCaption}>
					{descriptor.recoveryHint}
				</Typography.Text>
			</div>
		)
	}
	const descriptor = getObjectPreviewDescriptor(null)
	return (
		<div className={styles.detailsPreviewEmptyState}>
			<Typography.Text type="secondary">{descriptor.title}</Typography.Text>
			<Typography.Text type="secondary">{descriptor.recoveryHint}</Typography.Text>
		</div>
	)
}

function PreviewStateDescription({
	descriptor,
	detail,
}: {
	descriptor: ObjectMediaStateDescriptor
	detail?: string | null
}) {
	return (
		<div className={styles.detailsPreviewStateDescription}>
			{detail ? <Typography.Text>{detail}</Typography.Text> : null}
			<Typography.Text type="secondary">{descriptor.recoveryHint}</Typography.Text>
		</div>
	)
}
