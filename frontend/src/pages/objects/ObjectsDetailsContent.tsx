import { CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, LinkOutlined, ReloadOutlined, SnippetsOutlined } from '@ant-design/icons'
import { Alert, Button, Descriptions, Divider, Empty, Spin, Typography } from 'antd'
import type { ReactNode } from 'react'

import type { ObjectMeta } from '../../api/types'
import { formatDateTime } from '../../lib/format'
import { formatBytes } from '../../lib/transfer'
import styles from './objects.module.css'
import { guessPreviewKind } from './objectsListUtils'
import type { ObjectPreview } from './objectsTypes'

export type ObjectsDetailsContentProps = {
	hasProfile: boolean
	hasBucket: boolean
	isAdvanced: boolean
	selectedCount: number
	detailsKey: string | null
	detailsMeta: ObjectMeta | null
	isMetaFetching: boolean
	isMetaError: boolean
	metaErrorMessage: string
	onRetryMeta: () => void
	onCopyKey: () => void
	onDownload: () => void
	showPresignAction?: boolean
	onPresign: () => void
	isPresignLoading: boolean
	onCopyMove: (mode: 'copy' | 'move') => void
	onDelete: () => void
	isDeleteLoading: boolean
	thumbnail?: ReactNode
	previewThumbnail?: ReactNode
	preview: ObjectPreview | null
	onLoadPreview: () => void
	onCancelPreview: () => void
	canCancelPreview: boolean
	onOpenLargePreview: () => void
}

export function ObjectsDetailsContent(props: ObjectsDetailsContentProps) {
	const previewKind = props.detailsMeta ? guessPreviewKind(props.detailsMeta.contentType, props.detailsMeta.key) : null
	const isImageObject = previewKind === 'image'
	const isVideoObject = previewKind === 'video'
	const canOpenLargePreview = isImageObject || isVideoObject
	const previewFallbackThumbnail = props.previewThumbnail ?? props.thumbnail
	const showThumbnailHeaderOpenLarge = isImageObject

	if (!props.hasProfile) {
		return <Typography.Text type="secondary">Select a profile first.</Typography.Text>
	}
	if (!props.hasBucket) {
		return <Typography.Text type="secondary">Select a bucket first.</Typography.Text>
	}
	if (props.selectedCount === 0) {
		return <Empty description="Select an object to see details" />
	}
	if (props.selectedCount > 1) {
		return (
			<div className={styles.detailsMessageStack}>
				<Typography.Text strong>{props.selectedCount} selected</Typography.Text>
				<Typography.Text type="secondary">Use the selection bar for bulk actions.</Typography.Text>
			</div>
		)
	}
	if (!props.detailsKey) {
		return <Typography.Text type="secondary">Select an object to load metadata.</Typography.Text>
	}

	return (
		<div className={styles.detailsContent}>
			<div className={styles.detailsActionRow}>
				<Button size="small" icon={<CopyOutlined />} onClick={props.onCopyKey}>
					Copy key
				</Button>
				<Button size="small" icon={<DownloadOutlined />} onClick={props.onDownload}>
					Download (client)
				</Button>
				{props.showPresignAction !== false ? (
					<Button size="small" icon={<LinkOutlined />} onClick={props.onPresign} loading={props.isPresignLoading}>
						URL
					</Button>
				) : null}
				{props.isAdvanced ? (
					<>
						<Button size="small" icon={<SnippetsOutlined />} onClick={() => props.onCopyMove('copy')}>
							Copy
						</Button>
						<Button size="small" icon={<EditOutlined />} onClick={() => props.onCopyMove('move')}>
							Move
						</Button>
					</>
				) : null}
				<Button size="small" danger icon={<DeleteOutlined />} onClick={props.onDelete} loading={props.isDeleteLoading}>
					Delete
				</Button>
			</div>

			{props.isMetaFetching && !props.detailsMeta ? (
				<div className={styles.detailsFeedback}>
					<Spin />
				</div>
			) : props.isMetaError ? (
				<Alert
					type="error"
					showIcon
					title="Failed to load metadata"
					description={props.metaErrorMessage}
					action={
						<Button size="small" onClick={props.onRetryMeta} disabled={!props.detailsKey}>
							Retry
						</Button>
					}
				/>
			) : props.detailsMeta ? (
				<>
					<Descriptions size="small" bordered column={1}>
						<Descriptions.Item label="Key">
							<Typography.Text code>{props.detailsMeta.key}</Typography.Text>
						</Descriptions.Item>
						<Descriptions.Item label="Size">
							{typeof props.detailsMeta.size === 'number' && Number.isFinite(props.detailsMeta.size) ? (
								formatBytes(props.detailsMeta.size)
							) : (
								<Typography.Text type="secondary">-</Typography.Text>
							)}
						</Descriptions.Item>
						<Descriptions.Item label="ETag">
							{props.detailsMeta.etag ? (
								<Typography.Text code>{props.detailsMeta.etag}</Typography.Text>
							) : (
								<Typography.Text type="secondary">-</Typography.Text>
							)}
						</Descriptions.Item>
						<Descriptions.Item label="Last Modified">
							{props.detailsMeta.lastModified ? (
								<Typography.Text code>{formatDateTime(props.detailsMeta.lastModified)}</Typography.Text>
							) : (
								<Typography.Text type="secondary">-</Typography.Text>
							)}
						</Descriptions.Item>
						<Descriptions.Item label="Content Type">
							{props.detailsMeta.contentType ? (
								<Typography.Text code>{props.detailsMeta.contentType}</Typography.Text>
							) : (
								<Typography.Text type="secondary">-</Typography.Text>
							)}
						</Descriptions.Item>
					</Descriptions>

					{props.detailsMeta.metadata && Object.keys(props.detailsMeta.metadata).length ? (
						<Descriptions size="small" bordered column={1} title="Metadata">
							{Object.entries(props.detailsMeta.metadata).map(([k, v]) => (
								<Descriptions.Item key={k} label={k}>
									<Typography.Text code>{v}</Typography.Text>
								</Descriptions.Item>
							))}
						</Descriptions>
					) : (
						<Typography.Text type="secondary">No user metadata</Typography.Text>
					)}

					{props.thumbnail ? (
						<div className={styles.detailsSection}>
							<div className={styles.detailsSectionHeader}>
								<Typography.Text strong>Thumbnail</Typography.Text>
								{showThumbnailHeaderOpenLarge ? (
									<Button data-testid="objects-details-thumbnail-open-large" size="small" type="text" onClick={props.onOpenLargePreview}>
										Open large
									</Button>
								) : null}
							</div>
							<div className={styles.detailsMediaCenter}>
								{canOpenLargePreview ? (
									<button type="button" className={styles.previewTriggerButton} onClick={props.onOpenLargePreview} aria-label={`Open large preview for ${props.detailsKey}`}>
										{props.thumbnail}
									</button>
								) : (
									props.thumbnail
								)}
							</div>
						</div>
					) : null}

					<Divider className={styles.detailsDivider} />

					<div className={styles.detailsSection}>
						<div className={styles.detailsSectionHeader}>
							<Typography.Text strong>Preview</Typography.Text>
							<div className={styles.detailsSectionActions}>
								{props.preview?.status === 'loading' ? (
									<Button size="small" onClick={props.onCancelPreview} disabled={!props.canCancelPreview}>
										Cancel
									</Button>
								) : null}
								{canOpenLargePreview ? (
									<Button data-testid="objects-details-preview-open-large" size="small" onClick={props.onOpenLargePreview} disabled={!props.detailsMeta}>
										Open large
									</Button>
								) : null}
								<Button data-testid="objects-details-preview-load" size="small" icon={<ReloadOutlined />} onClick={props.onLoadPreview} disabled={!props.detailsMeta}>
									{props.preview ? 'Reload' : 'Load'}
								</Button>
							</div>
						</div>

						{props.preview?.status === 'loading' ? (
							<div className={styles.detailsFeedback}>
								<Spin />
							</div>
						) : props.preview?.status === 'blocked' ? (
							<Alert type="info" showIcon title="Preview unavailable" description={props.preview.error ?? 'Preview is not currently available.'} />
						) : props.preview?.status === 'error' ? (
							<Alert type="error" showIcon title="Preview failed" description={props.preview.error ?? 'unknown error'} />
						) : props.preview?.status === 'unsupported' ? (
							<Empty description={props.preview.error ?? 'Preview not available for this type'} />
						) : props.preview?.status === 'ready' && props.preview.kind === 'image' && props.preview.url ? (
							<button type="button" className={styles.previewTriggerButton} onClick={props.onOpenLargePreview} aria-label={`Open large preview for ${props.detailsKey}`}>
								<div className={styles.previewFrame}>
									<img
										src={props.preview.url}
										alt={props.detailsKey}
										width={360}
										height={360}
										className={styles.detailsPreviewImage}
									/>
								</div>
							</button>
						) : props.preview?.status === 'ready' && props.preview.kind === 'video' && props.preview.url ? (
							<button type="button" className={styles.previewTriggerButton} onClick={props.onOpenLargePreview} aria-label={`Open large preview for ${props.detailsKey}`}>
								<div className={styles.previewFrame}>
									<img
										src={props.preview.url}
										alt={`Thumbnail preview of ${props.detailsKey}`}
										width={360}
										height={360}
										className={styles.detailsPreviewImage}
									/>
									<Typography.Text type="secondary" className={styles.detailsPreviewCaption}>
										Video preview shows an extracted thumbnail frame.
									</Typography.Text>
								</div>
							</button>
						) : props.preview?.status === 'ready' && (props.preview.kind === 'text' || props.preview.kind === 'json') ? (
							<div className={styles.detailsCodePreview}>
								<pre className={styles.detailsCodePre}>
									{props.preview.text}
									{props.preview.truncated ? '\n\n…(truncated)…' : ''}
								</pre>
							</div>
						) : isVideoObject && previewFallbackThumbnail ? (
							<div className={styles.previewFrame}>
								<div className={styles.detailsMediaCenter}>{previewFallbackThumbnail}</div>
								<Typography.Text type="secondary" className={styles.detailsPreviewCaption}>
									Load to fetch a larger thumbnail frame for this video.
								</Typography.Text>
							</div>
						) : (
							<Typography.Text type="secondary">Click “Load” to fetch a larger preview.</Typography.Text>
						)}
					</div>
				</>
			) : (
				<Typography.Text type="secondary">Select an object to load metadata.</Typography.Text>
			)}
		</div>
	)
}
