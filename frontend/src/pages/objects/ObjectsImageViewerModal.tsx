import { Space, Typography } from 'antd'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'

import type { ObjectMeta } from '../../api/types'
import { DialogModal } from '../../components/DialogModal'
import { IMAGE_PREVIEW_MAX_BYTES } from './objectPreviewLimits'
import { ObjectsImageViewerBody } from './ObjectsImageViewerBody'
import { ObjectsImageViewerFooter } from './ObjectsImageViewerFooter'
import styles from './ObjectsImageViewer.module.css'
import { guessPreviewKind } from './objectsListUtils'
import type { ObjectPreview } from './objectsTypes'
import { useObjectsImageViewerPanZoom } from './useObjectsImageViewerPanZoom'

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

export function ObjectsImageViewerModal(props: ObjectsImageViewerModalProps) {
	const viewerSessionKey = `${props.open ? 'open' : 'closed'}:${props.objectKey ?? ''}`
	return <ObjectsImageViewerModalSession key={viewerSessionKey} {...props} />
}

function ObjectsImageViewerModalSession({
	canCancelPreview,
	isMetaFetching,
	isMobile,
	isPresignLoading,
	objectKey,
	objectMeta,
	onCancelPreview,
	onClose,
	onDownload,
	onLoadPreview,
	onPresign,
	open,
	preview,
	showPresignAction,
	thumbnail,
}: ObjectsImageViewerModalProps) {
	const previewAutoRequestedKeyRef = useRef<string | null>(null)

	const objectPreviewKind = useMemo(() => {
		if (objectMeta) return guessPreviewKind(objectMeta.contentType, objectMeta.key)
		if (objectKey) return guessPreviewKind(null, objectKey)
		return 'unsupported'
	}, [objectKey, objectMeta])
	const supportsVisualPreview = objectPreviewKind === 'image' || objectPreviewKind === 'video'
	const isImageObject = objectPreviewKind === 'image'
	const detailsSize = typeof objectMeta?.size === 'number' && Number.isFinite(objectMeta.size) ? objectMeta.size : null
	const imagePreviewTooLarge = isImageObject && detailsSize != null && detailsSize > IMAGE_PREVIEW_MAX_BYTES
	const visualPreviewReady = preview?.status === 'ready' && (preview.kind === 'image' || preview.kind === 'video') && !!preview.url
	const buttonSize = isMobile ? 'small' : 'middle'
	const panZoom = useObjectsImageViewerPanZoom(visualPreviewReady)

	useEffect(() => {
		if (!open || !objectMeta || !supportsVisualPreview || imagePreviewTooLarge) return
		if (preview?.status === 'loading' || visualPreviewReady) return
		if (previewAutoRequestedKeyRef.current === objectMeta.key) return
		previewAutoRequestedKeyRef.current = objectMeta.key
		void onLoadPreview()
	}, [imagePreviewTooLarge, objectMeta, onLoadPreview, open, preview?.status, supportsVisualPreview, visualPreviewReady])

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

	return (
		<DialogModal
			open={open}
			onClose={onClose}
			title={modalTitle}
			footer={
				<ObjectsImageViewerFooter
					buttonSize={buttonSize}
					canCancelPreview={canCancelPreview}
					imagePreviewTooLarge={imagePreviewTooLarge}
					isPresignLoading={isPresignLoading}
					objectMeta={objectMeta}
					onCancelPreview={onCancelPreview}
					onDownload={onDownload}
					onLoadPreview={onLoadPreview}
					onPresign={onPresign}
					preview={preview}
					resetView={panZoom.resetView}
					scale={panZoom.scale}
					showPresignAction={showPresignAction}
					updateScale={panZoom.updateScale}
					visualPreviewReady={visualPreviewReady}
				/>
			}
			width={isMobile ? 'calc(100vw - 16px)' : 980}
			dataTestId="objects-image-viewer-modal"
		>
			<div className={styles.imageViewerModalBody}>
				<ObjectsImageViewerBody
					detailsSize={detailsSize}
					dragState={panZoom.dragState}
					handlePointerDown={panZoom.handlePointerDown}
					handlePointerEnd={panZoom.handlePointerEnd}
					handlePointerMove={panZoom.handlePointerMove}
					handleStageKeyDown={panZoom.handleStageKeyDown}
					handleTouchEnd={panZoom.handleTouchEnd}
					handleTouchMove={panZoom.handleTouchMove}
					handleTouchStart={panZoom.handleTouchStart}
					imagePreviewTooLarge={imagePreviewTooLarge}
					imageRef={panZoom.imageRef}
					isMetaFetching={isMetaFetching}
					isMobile={isMobile}
					objectKey={objectKey}
					objectMeta={objectMeta}
					offset={panZoom.offset}
					open={open}
					preview={preview}
					scale={panZoom.scale}
					stageRef={panZoom.stageRef}
					supportsVisualPreview={supportsVisualPreview}
					thumbnail={thumbnail}
					visualPreviewReady={visualPreviewReady}
				/>
			</div>
		</DialogModal>
	)
}
