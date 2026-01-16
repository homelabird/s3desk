import { Alert, AutoComplete, Button, Drawer, Form, Grid, Input, Space, message } from 'antd'
import { useState } from 'react'

import { LocalDevicePathInput } from '../../components/LocalDevicePathInput'
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
	const [form] = Form.useForm<{
		bucket: string
		prefix: string
		localFolder: string
	}>()
	const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
	const [dirLabel, setDirLabel] = useState('')
	const support = getDevicePickerSupport()

	const canSubmit = !!dirHandle && support.ok && !props.isOffline

	return (
		<Drawer
			open={props.open}
			onClose={props.onCancel}
			title="Download folder (S3 → device)"
			width={drawerWidth}
			destroyOnClose
			extra={
				<Space>
					<Button onClick={props.onCancel}>Close</Button>
					<Button type="primary" loading={props.loading} onClick={() => form.submit()} disabled={!canSubmit}>
						Download
					</Button>
				</Space>
			}
		>
			{!support.ok ? (
				<Alert
					type="warning"
					showIcon
					message="Local folder access is not available"
					description={support.reason ?? 'Use HTTPS or localhost in a supported browser.'}
					style={{ marginBottom: 12 }}
				/>
			) : null}
			<Alert
				type="info"
				showIcon
				message="Downloads to this device"
				description="Files are saved by the browser and appear in Transfers (not as server jobs)."
				style={{ marginBottom: 12 }}
			/>

			<Form
				form={form}
				layout="vertical"
				initialValues={{
					bucket: props.bucket,
					prefix: '',
					localFolder: '',
				}}
				onFinish={(values) => {
					if (!dirHandle) {
						message.info('Select a local folder first')
						return
					}
					props.setBucket(values.bucket)
					props.onSubmit({
						bucket: values.bucket,
						prefix: values.prefix,
						dirHandle,
						label: dirLabel || dirHandle.name,
					})
				}}
			>
				<Form.Item name="bucket" label="Bucket" rules={[{ required: true }]}>
					<AutoComplete
						options={props.bucketOptions}
						filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
					>
						<Input placeholder="my-bucket" />
					</AutoComplete>
				</Form.Item>
				<Form.Item name="prefix" label="Prefix (optional)">
					<Input placeholder="path/" />
				</Form.Item>
				<Form.Item name="localFolder" label="Local destination folder" rules={[{ required: true }]}>
					<LocalDevicePathInput
						placeholder="Select a folder"
						disabled={!support.ok || props.isOffline}
						onPick={(handle) => {
							setDirHandle(handle)
							setDirLabel(handle.name)
						}}
					/>
				</Form.Item>
			</Form>
		</Drawer>
	)
}
