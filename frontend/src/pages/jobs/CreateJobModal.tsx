import { Alert, Button, Grid, Input, Typography, message } from 'antd'
import { useState } from 'react'

import { DatalistInput } from '../../components/DatalistInput'
import { FormField } from '../../components/FormField'
import { OverlaySheet } from '../../components/OverlaySheet'
import { UploadSourceSheet } from '../../components/UploadSourceSheet'
import { promptForFiles, promptForFolderFiles } from '../../components/transfers/transfersUploadUtils'
import { getDirectorySelectionSupport } from '../../lib/deviceFs'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { describeUploadSelection } from '../../lib/uploadSelection'
import styles from './JobsShared.module.css'

export function CreateJobModal(props: {
	profileId: string | null
	open: boolean
	onCancel: () => void
	onSubmit: (payload: {
		bucket: string
		prefix: string
		files: File[]
		label?: string
	}) => void
	loading: boolean
	isOffline: boolean
	uploadSupported?: boolean
	uploadUnsupportedReason?: string | null
	bucket: string
	setBucket: (v: string) => void
	bucketOptions: { label: string; value: string }[]
}) {
	const screens = Grid.useBreakpoint()
	const drawerWidth = screens.md ? 520 : '100%'
	const [bucket, setBucket] = useState(props.bucket)
	const [prefix, setPrefix] = useState('')
	const [selectedFiles, setSelectedFiles] = useState<File[]>([])
	const [selectionLabel, setSelectionLabel] = useState('')
	const [sourceOpen, setSourceOpen] = useState(false)
	const [sourceBusy, setSourceBusy] = useState(false)
	const support = getDirectorySelectionSupport()
	const uploadSupported = props.uploadSupported ?? true

	const reset = () => {
		setBucket(props.bucket)
		setPrefix('')
		setSelectedFiles([])
		setSelectionLabel('')
		setSourceOpen(false)
		setSourceBusy(false)
	}

	const canSubmit = selectedFiles.length > 0 && !!bucket.trim() && !props.isOffline && uploadSupported

	const handleSubmit = () => {
		if (!uploadSupported) {
			message.warning(props.uploadUnsupportedReason ?? 'This provider does not support upload transfers.')
			return
		}
		const trimmedBucket = bucket.trim()
		if (!trimmedBucket) {
			message.error('Bucket is required')
			return
		}
		if (selectedFiles.length === 0) {
			message.info('Choose files or a folder from this device first')
			return
		}
		props.setBucket(trimmedBucket)
		props.onSubmit({
			bucket: trimmedBucket,
			prefix,
			files: selectedFiles,
			label: selectionLabel || undefined,
		})
	}

	const handleCancel = () => {
		reset()
		props.onCancel()
	}

	const chooseFiles = async () => {
		setSourceBusy(true)
		try {
			setSourceOpen(false)
			const files = await promptForFiles({ multiple: true, directory: false })
			if (!files || files.length === 0) return
			setSelectedFiles(files)
			setSelectionLabel('')
		} catch (err) {
			message.error(formatErr(err))
		} finally {
			setSourceBusy(false)
		}
	}

	const chooseFolder = async () => {
		setSourceBusy(true)
		try {
			setSourceOpen(false)
			const result = await promptForFolderFiles()
			if (!result || result.files.length === 0) return
			setSelectedFiles(result.files)
			setSelectionLabel(result.label ?? '')
		} catch (err) {
			message.error(formatErr(err))
		} finally {
			setSourceBusy(false)
		}
	}

	const selectionSummary = describeUploadSelection(selectedFiles)

	return (
		<OverlaySheet
			open={props.open}
			onClose={handleCancel}
			title="Upload from device"
			placement={screens.md ? 'right' : 'bottom'}
			width={screens.md ? drawerWidth : undefined}
			height={!screens.md ? '100dvh' : undefined}
			extra={
				<div className={styles.drawerExtra}>
					<Button onClick={handleCancel}>Close</Button>
					<Button type="primary" loading={props.loading} onClick={handleSubmit} disabled={!canSubmit}>
						Upload
					</Button>
				</div>
			}
		>
			<div className={styles.alertStack}>
				{!uploadSupported ? (
					<Alert
						type="info"
						showIcon
						title="Uploads are not available for this provider"
						description={props.uploadUnsupportedReason ?? 'This provider does not support upload transfers.'}
					/>
				) : null}
				<Alert
					type="info"
					showIcon
					title="Uploads from this device"
					description="Files and folders are uploaded by the browser and appear in Transfers (not as server jobs). Folder structure is preserved automatically when relative paths are available."
				/>
			</div>

			<form
				className={styles.form}
				onSubmit={(e) => {
					e.preventDefault()
					handleSubmit()
				}}
			>
				<FormField label="Bucket">
					<DatalistInput
						value={bucket}
						onChange={setBucket}
						placeholder="my-bucket…"
						ariaLabel="Bucket"
						allowClear
						options={props.bucketOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
					/>
				</FormField>

				<FormField label="Prefix (optional)">
					<Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="path/…" />
				</FormField>

				<FormField label="Source selection">
					<div className={styles.sourceSummary}>
						<Typography.Text strong>
							{selectedFiles.length === 0
								? 'Nothing selected yet'
								: `${selectedFiles.length.toLocaleString()} item(s) · ${
										selectionSummary.kind === 'folder'
											? `Folder ${selectionSummary.rootName ?? ''}`.trim()
											: selectionSummary.kind === 'collection'
												? 'Multiple roots'
												: 'Files'
									}`}
						</Typography.Text>
						<Button
							onClick={() => setSourceOpen(true)}
							disabled={props.isOffline || !uploadSupported || sourceBusy}
						>
							Choose from device…
						</Button>
					</div>
				</FormField>
			</form>
			<UploadSourceSheet
				open={sourceOpen}
				title="Select upload source"
				destinationLabel={bucket.trim() ? `s3://${bucket.trim()}${prefix.trim() ? `/${prefix.trim().replace(/^\/+/, '')}` : '/'}` : undefined}
				folderSelectionSupported={support.ok}
				folderSelectionReason={support.reason}
				busy={sourceBusy}
				onClose={() => {
					if (sourceBusy) return
					setSourceOpen(false)
				}}
				onSelectFiles={() => void chooseFiles()}
				onSelectFolder={() => void chooseFolder()}
			/>
		</OverlaySheet>
	)
}
