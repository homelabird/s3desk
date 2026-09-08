import { Button, Typography } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { useMemo } from 'react'
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
	const { canOpenPicker, onOpenPicker, queueDisabledReason, selectedFiles, selectionKind } = props

	const selectedFileCount = selectedFiles.length
	const selectedTotalBytes = useMemo(
		() => selectedFiles.reduce((sum, file) => sum + (file.size || 0), 0),
		[selectedFiles],
	)
	const previewFiles = useMemo(() => buildUploadPreviewFiles(selectedFiles), [selectedFiles])
	const remainingPreviewCount = Math.max(0, selectedFileCount - previewFiles.length)
	const hasSelection = selectedFileCount > 0
	const selectionTypeLabel =
		selectionKind === 'folder' ? 'Folder' : selectionKind === 'collection' ? 'Mixed roots' : selectionKind === 'files' ? 'Files' : 'Not selected'

	return (
		<PageSection
			title="Selection"
			description="Add files or folders from this device."
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
						{hasSelection ? 'Replace selection…' : 'Add from device…'}
					</Button>
				</div>
				{hasSelection || !canOpenPicker ? (
					<Typography.Text type="secondary" className={styles.selectionHint}>
						{queueDisabledReason ?? 'Choosing new files or a folder replaces this selection.'}
					</Typography.Text>
				) : null}

				{hasSelection ? (
					<Typography.Text role="status" aria-live="polite" aria-atomic="true">
						{selectedFileCount.toLocaleString()} item(s) · {formatBytes(selectedTotalBytes)} · {selectionTypeLabel}
					</Typography.Text>
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
				) : null}
			</div>
		</PageSection>
	)
}
