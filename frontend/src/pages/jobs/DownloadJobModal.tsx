import { Alert, Button, Drawer, Grid, Input, Space, message } from 'antd'
import { useState } from 'react'

import { LocalDevicePathInput } from '../../components/LocalDevicePathInput'
import { DatalistInput } from '../../components/DatalistInput'
import { getDevicePickerSupport } from '../../lib/deviceFs'

export function DownloadJobModal(props: {
	profileId: string | null
	open: boolean
	onCancel: () => void
	onSubmit: (payload: { bucket: string; prefix: string; dirHandle: FileSystemDirectoryHandle; label?: string }) => void
	loading: boolean
	isOffline: boolean
	bucket: string
	setBucket: (v: string) => void
	bucketOptions: { label: string; value: string }[]
}) {
	const screens = Grid.useBreakpoint()
	const drawerWidth = screens.md ? 520 : '100%'
	const [bucket, setBucket] = useState(props.bucket)
	const [prefix, setPrefix] = useState('')
	const [localFolder, setLocalFolder] = useState('')
	const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
	const [dirLabel, setDirLabel] = useState('')
	const support = getDevicePickerSupport()

	const reset = () => {
		setBucket(props.bucket)
		setPrefix('')
		setLocalFolder('')
		setDirHandle(null)
		setDirLabel('')
	}

	const canSubmit = !!dirHandle && !!bucket.trim() && support.ok && !props.isOffline

	const handleSubmit = () => {
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
			title="Download folder (S3 → device)"
			width={drawerWidth}
			destroyOnHidden
			extra={
				<Space>
					<Button onClick={handleCancel}>Close</Button>
					<Button type="primary" loading={props.loading} onClick={handleSubmit} disabled={!canSubmit}>
						Download
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
			<Alert
				type="info"
				showIcon
				title="Downloads to this device"
				description="Files are saved by the browser and appear in Transfers (not as server jobs)."
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
					<DatalistInput
							value={bucket}
							onChange={setBucket}
							placeholder="my-bucket…"
							ariaLabel="Bucket"
							allowClear
							options={props.bucketOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
						/>
				</div>

				<div style={{ marginBottom: 12 }}>
					<div style={{ fontWeight: 700, marginBottom: 6 }}>Prefix (optional)</div>
					<Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="path/…" />
				</div>

				<div style={{ marginBottom: 12 }}>
					<div style={{ fontWeight: 700, marginBottom: 6 }}>Local destination folder</div>
					<LocalDevicePathInput
						value={localFolder}
						onChange={setLocalFolder}
						placeholder="Select a folder…"
						disabled={!support.ok || props.isOffline}
						onPick={(handle) => {
							setDirHandle(handle)
							setDirLabel(handle.name)
						}}
					/>
				</div>
			</form>
		</Drawer>
	)
}
