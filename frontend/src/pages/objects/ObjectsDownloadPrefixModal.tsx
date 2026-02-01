import type { FormInstance } from 'antd'
import { Alert, Form, Modal, Typography } from 'antd'

import { LocalDevicePathInput } from '../../components/LocalDevicePathInput'
import { getDevicePickerSupport } from '../../lib/deviceFs'

type DownloadPrefixForm = {
	localFolder: string
}

type ObjectsDownloadPrefixModalProps = {
	open: boolean
	sourceLabel: string
	form: FormInstance<DownloadPrefixForm>
	isSubmitting: boolean
	onCancel: () => void
	onFinish: (values: DownloadPrefixForm) => void
	onPickFolder: (handle: FileSystemDirectoryHandle) => void
	canSubmit: boolean
}

export function ObjectsDownloadPrefixModal(props: ObjectsDownloadPrefixModalProps) {
	const support = getDevicePickerSupport()

	return (
		<Modal
			open={props.open}
			title="Download to this device"
			okText="Start download"
			okButtonProps={{ loading: props.isSubmitting, disabled: !props.canSubmit }}
			onOk={() => props.form.submit()}
			onCancel={props.onCancel}
			destroyOnClose
		>
			<Alert
				type="info"
				showIcon
				message="Downloads objects to your device"
				description="Files are saved to the folder you select in this browser session."
				style={{ marginBottom: 12 }}
			/>

			{!support.ok ? (
				<Alert
					type="warning"
					showIcon
					message="Local folder access is not available"
					description={support.reason ?? 'Use HTTPS or localhost in a supported browser.'}
					style={{ marginBottom: 12 }}
				/>
			) : null}

			<Form
				form={props.form}
				layout="vertical"
				initialValues={{ localFolder: '' }}
				onFinish={props.onFinish}
			>
				<Form.Item label="Source">
					<Typography.Text code>{props.sourceLabel}</Typography.Text>
				</Form.Item>
				<Form.Item name="localFolder" label="Local destination folder" rules={[{ required: true }]}>
					<LocalDevicePathInput
						placeholder="Select a folder…"
						disabled={!support.ok}
						onPick={props.onPickFolder}
					/>
				</Form.Item>
			</Form>
		</Modal>
	)
}
