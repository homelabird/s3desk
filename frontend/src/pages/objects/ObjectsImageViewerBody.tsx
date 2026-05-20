import { Alert, Empty, Spin, Typography } from 'antd'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react'

import type { ObjectMeta } from '../../api/types'
import { formatDateTime } from '../../lib/format'
import { formatBytes } from '../../lib/transfer'
import { IMAGE_PREVIEW_MAX_BYTES } from './objectPreviewLimits'
import { getObjectMediaStateDescriptor, getObjectPreviewDescriptor } from './objectsMediaState'
import type { ObjectPreview } from './objectsTypes'
import styles from './ObjectsImageViewer.module.css'
import type { ImageViewerDragState, ImageViewerPanOffset } from './useObjectsImageViewerPanZoom'

type ObjectsImageViewerBodyProps = {
	detailsSize: number | null
	dragState: ImageViewerDragState | null
	handlePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
	handlePointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void
	handlePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void
	handleStageKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
	imagePreviewTooLarge: boolean
	imageRef: RefObject<HTMLImageElement | null>
	isMetaFetching: boolean
	isMobile: boolean
	objectKey: string | null
	objectMeta: ObjectMeta | null
	offset: ImageViewerPanOffset
	open: boolean
	preview: ObjectPreview | null
	scale: number
	stageRef: RefObject<HTMLDivElement | null>
	supportsVisualPreview: boolean
	thumbnail?: ReactNode
	visualPreviewReady: boolean
}

export function ObjectsImageViewerBody({
	detailsSize,
	dragState,
	handlePointerDown,
	handlePointerEnd,
	handlePointerMove,
	handleStageKeyDown,
	imagePreviewTooLarge,
	imageRef,
	isMetaFetching,
	isMobile,
	objectKey,
	objectMeta,
	offset,
	open,
	preview,
	scale,
	stageRef,
	supportsVisualPreview,
	thumbnail,
	visualPreviewReady,
}: ObjectsImageViewerBodyProps) {
	if (!objectKey) {
		return <Empty description="Select an object to open the viewer." />
	}
	if (isMetaFetching && !objectMeta) {
		return (
			<div className={styles.imageViewerLoadingState} role="status" aria-live="polite" aria-label="Loading preview metadata">
				<Spin size="large" />
				<Typography.Text type="secondary">Loading preview metadata…</Typography.Text>
			</div>
		)
	}
	if (!supportsVisualPreview) {
		const descriptor = getObjectMediaStateDescriptor('preview-unsupported')
		return (
			<Empty
				description={
					<div className={styles.imageViewerEmptyState}>
						<Typography.Text>{descriptor.title}</Typography.Text>
						<Typography.Text type="secondary">{descriptor.recoveryHint}</Typography.Text>
					</div>
				}
			/>
		)
	}
	if (imagePreviewTooLarge) {
		const descriptor = getObjectMediaStateDescriptor('preview-blocked')
		const fallbackDescriptor = getObjectMediaStateDescriptor('fallback-thumbnail-shown')
		return (
			<div className={styles.imageViewerStateStack}>
				<Alert
					type="info"
					showIcon
					title={descriptor.title}
					description={
						<div className={styles.imageViewerStateDescription}>
							<Typography.Text>
								Image previews are limited to {formatBytes(IMAGE_PREVIEW_MAX_BYTES)}. This object is {formatBytes(detailsSize ?? 0)}.
							</Typography.Text>
							<Typography.Text type="secondary">{descriptor.recoveryHint}</Typography.Text>
						</div>
					}
				/>
				{thumbnail ? (
					<div className={styles.imageViewerFallbackFrame}>
						<div className={styles.imageViewerFallbackInner}>{thumbnail}</div>
						<Typography.Text type="secondary">{fallbackDescriptor.title}</Typography.Text>
					</div>
				) : null}
			</div>
		)
	}
	if (preview?.status === 'blocked') {
		const descriptor = getObjectPreviewDescriptor(preview)
		return (
			<div className={styles.imageViewerStateStack}>
				<Alert
					type="info"
					showIcon
					title={descriptor.title}
					description={
						<div className={styles.imageViewerStateDescription}>
							{preview.error ? <Typography.Text>{preview.error}</Typography.Text> : null}
							<Typography.Text type="secondary">{descriptor.recoveryHint}</Typography.Text>
						</div>
					}
				/>
				{thumbnail ? <div className={styles.imageViewerFallbackInner}>{thumbnail}</div> : null}
			</div>
		)
	}
	if (preview?.status === 'error') {
		const descriptor = getObjectPreviewDescriptor(preview)
		return (
			<div className={styles.imageViewerStateStack}>
				<Alert
					type="error"
					showIcon
					title={descriptor.title}
					description={
						<div className={styles.imageViewerStateDescription}>
							<Typography.Text>{preview.error ?? 'Unknown error.'}</Typography.Text>
							<Typography.Text type="secondary">{descriptor.recoveryHint}</Typography.Text>
						</div>
					}
				/>
				{thumbnail ? <div className={styles.imageViewerFallbackInner}>{thumbnail}</div> : null}
			</div>
		)
	}

	const metaSummaryItems = [
		detailsSize != null ? formatBytes(detailsSize) : null,
		objectMeta?.contentType ?? null,
		objectMeta?.lastModified ? formatDateTime(objectMeta.lastModified, { showSeconds: false }) : null,
		visualPreviewReady ? `${Math.round(scale * 100)}%` : null,
	].filter((value): value is string => Boolean(value))

	return (
		<div className={styles.imageViewerShell}>
			<div className={styles.imageViewerMetaRow}>
				<div className={styles.imageViewerMetaStats} data-testid="objects-image-viewer-meta">
					{metaSummaryItems.map((item) => (
						<Typography.Text key={item} type="secondary" className={styles.imageViewerMetaBadge}>
							{item}
						</Typography.Text>
					))}
				</div>
			</div>
			<div
				ref={stageRef}
				data-testid="objects-image-viewer-stage"
				role="region"
				aria-label={`Preview stage for ${objectKey}`}
				className={`${styles.imageViewerStage} ${dragState ? styles.imageViewerStageDragging : ''}`}
				style={{ minHeight: isMobile ? 'calc(100dvh - 268px)' : 420 }}
				tabIndex={visualPreviewReady ? 0 : undefined}
				onKeyDown={handleStageKeyDown}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerEnd}
				onPointerCancel={handlePointerEnd}
			>
				{thumbnail && !visualPreviewReady ? <div className={styles.imageViewerThumbnailLayer}>{thumbnail}</div> : null}
				{preview?.status === 'loading' || (open && !preview && !visualPreviewReady) ? (
					<div className={styles.imageViewerLoadingOverlay} role="status" aria-live="polite" aria-label={getObjectMediaStateDescriptor('preview-loading').title}>
						<Spin size="large" />
						<Typography.Text type="secondary">{getObjectMediaStateDescriptor('preview-loading').recoveryHint}</Typography.Text>
					</div>
				) : null}
				{visualPreviewReady && preview?.url ? (
					<img
						ref={imageRef}
						data-testid="objects-image-viewer-image"
						src={preview.url}
						alt={objectKey}
						className={styles.imageViewerImage}
						style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})` }}
						draggable={false}
					/>
				) : null}
			</div>
		</div>
	)
}
