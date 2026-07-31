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
	canOpenPicker: boolean
	queueDisabledReason: string | null
	selectedFiles: File[]
	destinationLabel: string
	selectionKind: UploadSelectionKind
}

export type UploadsSelectionSectionProps = Props

export function UploadsSelectionSection(props: Props) {
	const { canOpenPicker, destinationLabel, onOpenPicker, queueDisabledReason, selectedFiles, selectionKind } = props

	const selectedFileCount = selectedFiles.length
	const selectedTotalBytes = selectedFiles.reduce((sum, file) => sum + (file.size || 0), 0)
	const previewFiles = buildUploadPreviewFiles(selectedFiles)
	const remainingPreviewCount = Math.max(0, selectedFileCount - previewFiles.length)
	const hasSelection = selectedFileCount > 0
	const selectionTypeLabel =
		selectionKind === 'folder' ? 'Folder' : selectionKind === 'collection' ? 'Mixed roots' : selectionKind === 'files' ? 'Files' : 'Not selected'

	return (
		<PageSection
			title="Selection"
			description="Start here. Add files or folders from this device, then review the destination below."
		>
			<div className={styles.selectionStack}>
				<div className={styles.selectionActions}>
					<Button
						icon={<UploadOutlined />}
						disabled={!canOpenPicker}
						size="large"
						type={hasSelection ? 'default' : 'primary'}
						onClick={onOpenPicker}
					>
						Add from device…
					</Button>
				</div>
				<Typography.Text type="secondary" className={styles.selectionHint}>
					{queueDisabledReason ?? 'Ready to queue this selection.'}
				</Typography.Text>

				{hasSelection ? (
					<div className={styles.summaryGrid} role="status" aria-live="polite" aria-atomic="true">
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
				) : null}

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
							Choose files or a folder to preview what will be uploaded.
						</Typography.Text>
					</div>
				)}
			</div>
		</PageSection>
	)
}
