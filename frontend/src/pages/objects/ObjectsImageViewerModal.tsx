import { DownloadOutlined, LinkOutlined, MinusOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Space, Spin, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

import type { ObjectMeta } from '../../api/types'
import { DialogModal } from '../../components/DialogModal'
import { formatBytes } from '../../lib/transfer'
import styles from './objects.module.css'
import { clampNumber, guessPreviewKind } from './objectsListUtils'
import type { ObjectPreview } from './objectsTypes'
import { IMAGE_PREVIEW_MAX_BYTES } from './useObjectPreview'

const MIN_SCALE = 1
const MAX_SCALE = 4
const SCALE_STEP = 0.5

type PanOffset = {
	x: number
	y: number
}

type ObjectsImageViewerModalProps = {
	open: boolean
	isMobile: boolean
	objectKey: string | null
	objectMeta: ObjectMeta | null
	isMetaFetching: boolean
	thumbnail?: ReactNode
	preview: ObjectPreview | null
	onLoadPreview: () => void
	onCancelPreview: () => void
	canCancelPreview: boolean
	onClose: () => void
	onDownload: () => void
	showPresignAction?: boolean
	onPresign: () => void
	isPresignLoading: boolean
}

function clampPanOffset(scale: number, offset: PanOffset, stageEl: HTMLDivElement | null, imageEl: HTMLImageElement | null): PanOffset {
	if (!stageEl || !imageEl || scale <= MIN_SCALE) return { x: 0, y: 0 }
	const stageWidth = stageEl.clientWidth
	const stageHeight = stageEl.clientHeight
	const baseWidth = imageEl.clientWidth
	const baseHeight = imageEl.clientHeight
	const maxX = Math.max(0, (baseWidth * scale - stageWidth) / 2)
	const maxY = Math.max(0, (baseHeight * scale - stageHeight) / 2)
	return {
		x: clampNumber(offset.x, -maxX, maxX),
		y: clampNumber(offset.y, -maxY, maxY),
	}
}

export function ObjectsImageViewerModal(props: ObjectsImageViewerModalProps) {
	const viewerSessionKey = `${props.open ? 'open' : 'closed'}:${props.objectKey ?? ''}`
	return <ObjectsImageViewerModalSession key={viewerSessionKey} {...props} />
}

function ObjectsImageViewerModalSession(props: ObjectsImageViewerModalProps) {
	const {
		open,
		isMobile,
		objectKey,
		objectMeta,
		isMetaFetching,
		thumbnail,
		preview,
		onLoadPreview,
		onCancelPreview,
		canCancelPreview,
		onClose,
		onDownload,
		showPresignAction,
		onPresign,
		isPresignLoading,
	} = props
	const [scale, setScale] = useState(MIN_SCALE)
	const [offset, setOffset] = useState<PanOffset>({ x: 0, y: 0 })
	const [dragState, setDragState] = useState<{ pointerId: number; startX: number; startY: number; origin: PanOffset } | null>(null)
	const previewAutoRequestedKeyRef = useRef<string | null>(null)
	const stageRef = useRef<HTMLDivElement | null>(null)
	const imageRef = useRef<HTMLImageElement | null>(null)

	const objectPreviewKind = useMemo(() => {
		if (objectMeta) return guessPreviewKind(objectMeta.contentType, objectMeta.key)
		if (objectKey) return guessPreviewKind(null, objectKey)
		return 'unsupported'
	}, [objectKey, objectMeta])
	const supportsVisualPreview = objectPreviewKind === 'image' || objectPreviewKind === 'video'
	const isImageObject = objectPreviewKind === 'image'
	const isVideoObject = objectPreviewKind === 'video'
	const detailsSize = typeof objectMeta?.size === 'number' && Number.isFinite(objectMeta.size) ? objectMeta.size : null
	const imagePreviewTooLarge = isImageObject && detailsSize != null && detailsSize > IMAGE_PREVIEW_MAX_BYTES
	const visualPreviewReady = preview?.status === 'ready' && (preview.kind === 'image' || preview.kind === 'video') && !!preview.url

	const resetView = useCallback(() => {
		setScale(MIN_SCALE)
		setOffset({ x: 0, y: 0 })
		setDragState(null)
	}, [])

	useEffect(() => {
		if (!open || !objectMeta || !supportsVisualPreview || imagePreviewTooLarge) return
		if (preview?.status === 'loading' || visualPreviewReady) return
		if (previewAutoRequestedKeyRef.current === objectMeta.key) return
		previewAutoRequestedKeyRef.current = objectMeta.key
		void onLoadPreview()
	}, [imagePreviewTooLarge, objectMeta, onLoadPreview, open, preview?.status, supportsVisualPreview, visualPreviewReady])

	useEffect(() => {
		setOffset((current) => clampPanOffset(scale, current, stageRef.current, imageRef.current))
	}, [scale])

	useEffect(() => {
		if (typeof document === 'undefined') return
		if (open) {
			document.body.dataset.objectsImageViewerOpen = 'true'
			return () => {
				delete document.body.dataset.objectsImageViewerOpen
			}
		}
		delete document.body.dataset.objectsImageViewerOpen
	}, [open])

	const updateScale = useCallback((nextScale: number) => {
		const normalized = Math.round(nextScale * 100) / 100
		setScale(clampNumber(normalized, MIN_SCALE, MAX_SCALE))
	}, [])

	const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		if (scale <= MIN_SCALE || !visualPreviewReady) return
		event.preventDefault()
		event.currentTarget.setPointerCapture(event.pointerId)
		setDragState({
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			origin: offset,
		})
	}, [offset, scale, visualPreviewReady])

	const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		if (!dragState || dragState.pointerId !== event.pointerId) return
		event.preventDefault()
		const next = clampPanOffset(
			scale,
			{
				x: dragState.origin.x + (event.clientX - dragState.startX),
				y: dragState.origin.y + (event.clientY - dragState.startY),
			},
			stageRef.current,
			imageRef.current,
		)
		setOffset(next)
	}, [dragState, scale])

	const handlePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		if (!dragState || dragState.pointerId !== event.pointerId) return
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId)
		}
		setDragState(null)
	}, [dragState])

	const modalTitle = objectMeta ? (
		<Space orientation="vertical" size={0}>
			<Typography.Text strong>Large preview</Typography.Text>
			<Typography.Text code ellipsis={{ tooltip: objectMeta.key }}>
				{objectMeta.key}
			</Typography.Text>
		</Space>
	) : (
		'Large preview'
	)

	const zoomControls = visualPreviewReady ? (
		<Space wrap>
			<Button data-testid="objects-image-viewer-zoom-out" onClick={() => updateScale(scale - SCALE_STEP)} disabled={scale <= MIN_SCALE} icon={<MinusOutlined />}>
				Zoom out
			</Button>
			<Button data-testid="objects-image-viewer-reset" onClick={resetView}>
				Fit
			</Button>
			<Button data-testid="objects-image-viewer-zoom-in" onClick={() => updateScale(scale + SCALE_STEP)} disabled={scale >= MAX_SCALE} icon={<PlusOutlined />}>
				Zoom in
			</Button>
		</Space>
	) : null

	const footer = (
		<Space wrap size={[8, 8]} style={{ width: '100%', justifyContent: 'space-between' }}>
			{zoomControls ?? <span />}
			<Space wrap>
				<Button icon={<DownloadOutlined />} onClick={onDownload}>
					Download
				</Button>
				{showPresignAction !== false ? (
					<Button icon={<LinkOutlined />} onClick={onPresign} loading={isPresignLoading}>
						URL
					</Button>
				) : null}
				{!imagePreviewTooLarge ? (
					preview?.status === 'loading' ? (
						<Button onClick={onCancelPreview} disabled={!canCancelPreview}>
							Cancel preview
						</Button>
					) : (
						<Button icon={<ReloadOutlined />} onClick={onLoadPreview} disabled={!objectMeta}>
							Reload preview
						</Button>
					)
				) : null}
			</Space>
		</Space>
	)

	const metaSummary = (
		<Space wrap size={[8, 8]}>
			{detailsSize != null ? <Typography.Text type="secondary">{formatBytes(detailsSize)}</Typography.Text> : null}
			{objectMeta?.contentType ? <Typography.Text type="secondary">{objectMeta.contentType}</Typography.Text> : null}
			{visualPreviewReady ? <Typography.Text type="secondary">{Math.round(scale * 100)}%</Typography.Text> : null}
		</Space>
	)

	let bodyContent: ReactNode
	if (!objectKey) {
		bodyContent = <Empty description="Select an object to open the viewer." />
	} else if (isMetaFetching && !objectMeta) {
		bodyContent = (
			<div className={styles.imageViewerLoadingState}>
				<Spin size="large" />
				<Typography.Text type="secondary">Loading preview metadata…</Typography.Text>
			</div>
		)
	} else if (!supportsVisualPreview) {
		bodyContent = <Empty description="Large preview is only available for image and video objects." />
	} else if (imagePreviewTooLarge) {
		bodyContent = (
			<div className={styles.imageViewerStateStack}>
				<Alert
					type="info"
					showIcon
					message="Large preview unavailable"
					description={`Image previews are limited to ${formatBytes(IMAGE_PREVIEW_MAX_BYTES)}. This object is ${formatBytes(detailsSize ?? 0)}.`}
				/>
				{thumbnail ? (
					<div className={styles.imageViewerFallbackFrame}>
						<div className={styles.imageViewerFallbackInner}>{thumbnail}</div>
						<Typography.Text type="secondary">Fallback thumbnail</Typography.Text>
					</div>
				) : null}
				<Typography.Text type="secondary">Use Download or URL to view the original file.</Typography.Text>
			</div>
		)
	} else if (preview?.status === 'blocked') {
		bodyContent = (
			<div className={styles.imageViewerStateStack}>
				<Alert type="info" showIcon message="Preview unavailable" description={preview.error ?? 'Preview is not currently available.'} />
				{thumbnail ? <div className={styles.imageViewerFallbackInner}>{thumbnail}</div> : null}
			</div>
		)
	} else if (preview?.status === 'error') {
		bodyContent = (
			<div className={styles.imageViewerStateStack}>
				<Alert type="error" showIcon message="Preview failed" description={preview.error ?? 'unknown error'} />
				{thumbnail ? <div className={styles.imageViewerFallbackInner}>{thumbnail}</div> : null}
			</div>
		)
	} else {
		bodyContent = (
			<div className={styles.imageViewerShell}>
				<div className={styles.imageViewerMetaRow}>{metaSummary}</div>
				<div
					ref={stageRef}
					data-testid="objects-image-viewer-stage"
					className={`${styles.imageViewerStage} ${dragState ? styles.imageViewerStageDragging : ''}`}
					style={{ minHeight: isMobile ? 'calc(100vh - 300px)' : 420 }}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerEnd}
					onPointerCancel={handlePointerEnd}
				>
					{thumbnail && !visualPreviewReady ? <div className={styles.imageViewerThumbnailLayer}>{thumbnail}</div> : null}
					{preview?.status === 'loading' || (open && !preview && !visualPreviewReady) ? (
						<div className={styles.imageViewerLoadingOverlay}>
							<Spin size="large" />
							<Typography.Text type="secondary">
								{isVideoObject ? 'Loading extracted video thumbnail…' : 'Loading full image preview…'}
							</Typography.Text>
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

	return (
		<DialogModal
			open={open}
			onClose={onClose}
			title={modalTitle}
			footer={footer}
			width={isMobile ? 'calc(100vw - 16px)' : 980}
			dataTestId="objects-image-viewer-modal"
		>
			<div className={styles.imageViewerModalBody}>
				{bodyContent}
			</div>
		</DialogModal>
	)
}
