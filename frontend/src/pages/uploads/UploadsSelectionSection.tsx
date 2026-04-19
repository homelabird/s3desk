import { Button, Typography } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import type { UploadSelectionKind } from '../../lib/uploadSelection'

import { PageSection } from '../../components/PageSection'
import { formatBytes } from '../../lib/transfer'
import styles from '../UploadsPage.module.css'
import { buildUploadPreviewFiles } from './uploadsFileSelection'

type Props = {
	onOpenPicker: () => void
	isOffline: boolean
	uploadsSupported: boolean
	queueDisabledReason: string | null
	selectedFiles: File[]
	destinationLabel: string
	selectionKind: UploadSelectionKind
}

export type UploadsSelectionSectionProps = Props

export function UploadsSelectionSection(props: Props) {
	const { destinationLabel, isOffline, onOpenPicker, queueDisabledReason, selectedFiles, selectionKind, uploadsSupported } = props

	const selectedFileCount = selectedFiles.length
	const selectedTotalBytes = selectedFiles.reduce((sum, file) => sum + (file.size || 0), 0)
	const previewFiles = buildUploadPreviewFiles(selectedFiles)
	const remainingPreviewCount = Math.max(0, selectedFileCount - previewFiles.length)
	const selectionTypeLabel =
		selectionKind === 'folder' ? 'Folder' : selectionKind === 'collection' ? 'Mixed roots' : selectionKind === 'files' ? 'Files' : 'Not selected'

	return (
		<PageSection
				title="Selection"
				description="Add files or folders from this device. Relative paths preserve folder structure."
		>
			<div className={styles.selectionStack}>
				<div className={styles.selectionActions}>
					<Button
						icon={<UploadOutlined />}
						disabled={isOffline || !uploadsSupported}
						size="large"
						onClick={onOpenPicker}
					>
						Add from device…
					</Button>
					<Typography.Text type="secondary" className={styles.selectionHint}>
						{queueDisabledReason ?? 'Ready to queue this selection.'}
					</Typography.Text>
				</div>

				<div className={styles.summaryGrid}>
					<div className={styles.summaryCard}>
						<span className={styles.summaryLabel}>Selection</span>
						<strong className={styles.summaryValue}>{selectedFileCount.toLocaleString()} item(s)</strong>
					</div>
					<div className={styles.summaryCard}>
						<span className={styles.summaryLabel}>Total size</span>
						<strong className={styles.summaryValue}>{formatBytes(selectedTotalBytes)}</strong>
					</div>
					<div className={styles.summaryCard}>
						<span className={styles.summaryLabel}>Destination</span>
						<strong className={styles.summaryValue}>{destinationLabel}</strong>
					</div>
					<div className={styles.summaryCard}>
						<span className={styles.summaryLabel}>Detected type</span>
						<strong className={styles.summaryValue}>{selectionTypeLabel}</strong>
					</div>
				</div>

				{previewFiles.length > 0 ? (
					<div className={styles.previewWrap}>
						<ul className={styles.previewList}>
							{previewFiles.map((file) => (
								<li key={`${file.name}-${file.size}`} className={styles.previewItem}>
									<div className={styles.previewName}>{file.name}</div>
									<div className={styles.previewMeta}>{formatBytes(file.size)}</div>
								</li>
							))}
						</ul>
						{remainingPreviewCount > 0 ? (
							<Typography.Text type="secondary">+ {remainingPreviewCount.toLocaleString()} more item(s) selected</Typography.Text>
						) : null}
					</div>
				) : (
					<div className={styles.emptyPreview}>
						<Typography.Text strong>No files or folders selected.</Typography.Text>
						<Typography.Text type="secondary">
							Choose files or a folder to preview the queued upload contents.
						</Typography.Text>
					</div>
				)}
			</div>
		</PageSection>
	)
}
