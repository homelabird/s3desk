import { Button, Typography } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { useEffect, useRef } from 'react'

import { PageSection } from '../../components/PageSection'
import { formatBytes } from '../../lib/transfer'
import styles from '../UploadsPage.module.css'
import { buildUploadPreviewFiles, clearSelectedFileInput, getSelectedFiles, setDirectorySelectionMode } from './uploadsFileSelection'

type Props = {
	onFilesChange: (files: File[]) => void
	isOffline: boolean
	uploadsSupported: boolean
	queueDisabledReason: string | null
	selectedFiles: File[]
	destinationLabel: string
	folderMode: boolean
}

export function UploadsSelectionSection(props: Props) {
	const { destinationLabel, folderMode, isOffline, onFilesChange, queueDisabledReason, selectedFiles, uploadsSupported } = props
	const fileInputRef = useRef<HTMLInputElement | null>(null)

	useEffect(() => {
		setDirectorySelectionMode(fileInputRef.current, folderMode)
		clearSelectedFileInput(fileInputRef.current)
		onFilesChange([])
	}, [folderMode, onFilesChange])

	const selectedFileCount = selectedFiles.length
	const selectedTotalBytes = selectedFiles.reduce((sum, file) => sum + (file.size || 0), 0)
	const previewFiles = buildUploadPreviewFiles(selectedFiles)
	const remainingPreviewCount = Math.max(0, selectedFileCount - previewFiles.length)

	return (
		<PageSection
				title="Selection"
				description={
					folderMode
						? 'Choose a folder to preserve relative paths. The queue will upload every file under that root.'
						: 'Choose one or more files from this device. You can review the first few items before queuing.'
				}
		>
			<div className={styles.selectionStack}>
				<div className={styles.selectionActions}>
					<input
						ref={fileInputRef}
						type="file"
						multiple
						hidden
						onClick={(event) => {
							const input = event.currentTarget
							input.value = ''
						}}
						onChange={(event) => onFilesChange(getSelectedFiles(event.currentTarget))}
					/>
					<Button
						icon={<UploadOutlined />}
						disabled={isOffline || !uploadsSupported}
						size="large"
						onClick={() => fileInputRef.current?.click()}
					>
						{folderMode ? 'Select folder' : 'Select files'}
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
						<Typography.Text strong>{folderMode ? 'No folder selected.' : 'No files selected.'}</Typography.Text>
						<Typography.Text type="secondary">
							Select {folderMode ? 'a folder' : 'files'} to preview the queue contents before creating a job.
						</Typography.Text>
					</div>
				)}
			</div>
		</PageSection>
	)
}
