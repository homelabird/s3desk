import { DownloadOutlined, LinkOutlined, MinusOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button } from 'antd'

import type { ObjectMeta } from '../../api/types'
import { getObjectPreviewLoadActionLabel } from './objectsMediaState'
import type { ObjectPreview } from './objectsTypes'
import styles from './ObjectsImageViewer.module.css'
import {
	IMAGE_VIEWER_MAX_SCALE,
	IMAGE_VIEWER_MIN_SCALE,
	IMAGE_VIEWER_SCALE_STEP,
} from './useObjectsImageViewerPanZoom'

type ObjectsImageViewerFooterProps = {
	buttonSize: 'small' | 'middle'
	canCancelPreview: boolean
	imagePreviewTooLarge: boolean
	isPresignLoading: boolean
	objectMeta: ObjectMeta | null
	onCancelPreview: () => void
	onDownload: () => void
	onLoadPreview: () => void
	onPresign: () => void
	preview: ObjectPreview | null
	resetView: () => void
	scale: number
	showPresignAction?: boolean
	updateScale: (nextScale: number) => void
	visualPreviewReady: boolean
}

export function ObjectsImageViewerFooter({
	buttonSize,
	canCancelPreview,
	imagePreviewTooLarge,
	isPresignLoading,
	objectMeta,
	onCancelPreview,
	onDownload,
	onLoadPreview,
	onPresign,
	preview,
	resetView,
	scale,
	showPresignAction,
	updateScale,
	visualPreviewReady,
}: ObjectsImageViewerFooterProps) {
	const previewLoadActionLabel = getObjectPreviewLoadActionLabel(preview)
	const zoomControls = visualPreviewReady ? (
		<div className={styles.imageViewerFooterGroup}>
			<Button
				data-testid="objects-image-viewer-zoom-out"
				size={buttonSize}
				className={styles.imageViewerToolbarButton}
				onClick={() => updateScale(scale - IMAGE_VIEWER_SCALE_STEP)}
				disabled={scale <= IMAGE_VIEWER_MIN_SCALE}
				icon={<MinusOutlined />}
			>
				Zoom out
			</Button>
			<Button
				data-testid="objects-image-viewer-reset"
				size={buttonSize}
				className={styles.imageViewerToolbarButton}
				onClick={resetView}
			>
				Fit
			</Button>
			<Button
				data-testid="objects-image-viewer-zoom-in"
				size={buttonSize}
				className={styles.imageViewerToolbarButton}
				onClick={() => updateScale(scale + IMAGE_VIEWER_SCALE_STEP)}
				disabled={scale >= IMAGE_VIEWER_MAX_SCALE}
				icon={<PlusOutlined />}
			>
				Zoom in
			</Button>
		</div>
	) : null

	return (
		<div className={styles.imageViewerFooter} data-testid="objects-image-viewer-footer">
			{zoomControls ?? <span />}
			<div className={styles.imageViewerFooterGroup}>
				<Button size={buttonSize} className={styles.imageViewerToolbarButton} icon={<DownloadOutlined />} onClick={onDownload}>
					Download
				</Button>
				{showPresignAction !== false ? (
					<Button size={buttonSize} className={styles.imageViewerToolbarButton} icon={<LinkOutlined />} onClick={onPresign} loading={isPresignLoading}>
						URL
					</Button>
				) : null}
				{!imagePreviewTooLarge ? (
					preview?.status === 'loading' ? (
						<Button size={buttonSize} className={styles.imageViewerToolbarButton} onClick={onCancelPreview} disabled={!canCancelPreview}>
							Cancel preview
						</Button>
					) : (
						<Button
							size={buttonSize}
							className={styles.imageViewerToolbarButton}
							icon={<ReloadOutlined />}
							onClick={onLoadPreview}
							disabled={!objectMeta}
						>
							{previewLoadActionLabel}
						</Button>
					)
				) : null}
			</div>
		</div>
	)
}
