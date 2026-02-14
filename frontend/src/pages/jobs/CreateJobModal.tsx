import { Alert, AutoComplete, Button, Checkbox, Drawer, Grid, Input, Space, message } from 'antd'
import { useState } from 'react'

import { LocalDevicePathInput } from '../../components/LocalDevicePathInput'
import { getDevicePickerSupport } from '../../lib/deviceFs'

export function CreateJobModal(props: {
	profileId: string | null
	open: boolean
	onCancel: () => void
	onSubmit: (payload: {
		bucket: string
		prefix: string
		dirHandle: FileSystemDirectoryHandle
		label?: string
		moveAfterUpload?: boolean
		cleanupEmptyDirs?: boolean
	}) => void
	loading: boolean
	isOffline: boolean
	uploadSupported?: boolean
	uploadUnsupportedReason?: string | null
	bucket: string
	setBucket: (v: string) => void
	bucketOptions: { label: string; value: string }[]
	defaultMoveAfterUpload: boolean
	defaultCleanupEmptyDirs: boolean
	onDefaultsChange?: (values: { moveAfterUpload: boolean; cleanupEmptyDirs: boolean }) => void
}) {
	const screens = Grid.useBreakpoint()
	const drawerWidth = screens.md ? 520 : '100%'
	const [bucket, setBucket] = useState(props.bucket)
	const [prefix, setPrefix] = useState('')
	const [localFolder, setLocalFolder] = useState('')
	const [moveAfterUpload, setMoveAfterUpload] = useState(props.defaultMoveAfterUpload)
	const [cleanupEmptyDirs, setCleanupEmptyDirs] = useState(props.defaultCleanupEmptyDirs)
	const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
	const [dirLabel, setDirLabel] = useState('')
	const support = getDevicePickerSupport()
	const uploadSupported = props.uploadSupported ?? true

	const reset = () => {
		setBucket(props.bucket)
		setPrefix('')
		setLocalFolder('')
		setMoveAfterUpload(props.defaultMoveAfterUpload)
		setCleanupEmptyDirs(props.defaultCleanupEmptyDirs)
		setDirHandle(null)
		setDirLabel('')
	}

	const canSubmit = !!dirHandle && !!bucket.trim() && support.ok && !props.isOffline && uploadSupported

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
		if (!dirHandle) {
			message.info('Select a local folder first')
			return
		}
		props.setBucket(trimmedBucket)
		props.onSubmit({
			bucket: trimmedBucket,
			prefix,
			dirHandle,
			label: dirLabel || dirHandle.name,
			moveAfterUpload,
			cleanupEmptyDirs: moveAfterUpload ? cleanupEmptyDirs : false,
		})
	}

	const handleCancel = () => {
		reset()
		props.onCancel()
	}

	return (
		<Drawer
			open={props.open}
			onClose={handleCancel}
			title="Upload local folder (device → S3)"
			width={drawerWidth}
			destroyOnHidden
			extra={
				<Space>
					<Button onClick={handleCancel}>Close</Button>
					<Button type="primary" loading={props.loading} onClick={handleSubmit} disabled={!canSubmit}>
						Upload
					</Button>
				</Space>
			}
		>
			{!support.ok ? (
				<Alert
					type="warning"
					showIcon
					title="Local folder access is not available"
					description={support.reason ?? 'Use HTTPS or localhost in a supported browser.'}
					style={{ marginBottom: 12 }}
				/>
			) : null}
			{!uploadSupported ? (
				<Alert
					type="info"
					showIcon
					title="Uploads are not available for this provider"
					description={props.uploadUnsupportedReason ?? 'This provider does not support upload transfers.'}
					style={{ marginBottom: 12 }}
				/>
			) : null}
			<Alert
				type="info"
				showIcon
				title="Uploads from this device"
				description="Files are uploaded by the browser and appear in Transfers (not as server jobs)."
				style={{ marginBottom: 12 }}
			/>

			<form
				onSubmit={(e) => {
					e.preventDefault()
					handleSubmit()
				}}
			>
				<div style={{ marginBottom: 12 }}>
					<div style={{ fontWeight: 700, marginBottom: 6 }}>Bucket</div>
					<AutoComplete
						value={bucket}
						options={props.bucketOptions}
						onChange={(value) => setBucket(String(value))}
						filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
					>
						<Input placeholder="my-bucket…" />
					</AutoComplete>
				</div>

				<div style={{ marginBottom: 12 }}>
					<div style={{ fontWeight: 700, marginBottom: 6 }}>Prefix (optional)</div>
					<Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="path/…" />
				</div>

				<div style={{ marginBottom: 12 }}>
					<div style={{ fontWeight: 700, marginBottom: 6 }}>Local folder</div>
					<LocalDevicePathInput
						value={localFolder}
						onChange={setLocalFolder}
						placeholder="Select a folder…"
						disabled={!support.ok || props.isOffline || !uploadSupported}
						onPick={(handle) => {
							setDirHandle(handle)
							setDirLabel(handle.name)
						}}
					/>
				</div>

				<div style={{ marginBottom: 10 }}>
					<Checkbox
						checked={moveAfterUpload}
						onChange={(e) => {
							const checked = e.target.checked
							setMoveAfterUpload(checked)
							if (!checked) setCleanupEmptyDirs(false)
							props.onDefaultsChange?.({
								moveAfterUpload: checked,
								cleanupEmptyDirs: checked ? cleanupEmptyDirs : false,
							})
						}}
					>
						Move after upload (delete local files after the job succeeds)
					</Checkbox>
				</div>

				<Checkbox
					checked={cleanupEmptyDirs}
					disabled={!moveAfterUpload}
					onChange={(e) => {
						const checked = e.target.checked
						setCleanupEmptyDirs(checked)
						props.onDefaultsChange?.({ moveAfterUpload, cleanupEmptyDirs: checked })
					}}
				>
					Auto-clean empty folders
				</Checkbox>
			</form>
		</Drawer>
	)
}
