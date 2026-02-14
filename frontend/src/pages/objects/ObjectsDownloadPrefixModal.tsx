import { Alert, Modal, Typography } from 'antd'

import { FormField } from '../../components/FormField'
import { LocalDevicePathInput } from '../../components/LocalDevicePathInput'
import { getDevicePickerSupport } from '../../lib/deviceFs'

type DownloadPrefixValues = {
	localFolder: string
}

type ObjectsDownloadPrefixModalProps = {
	open: boolean
	sourceLabel: string
	values: DownloadPrefixValues
	onValuesChange: (values: DownloadPrefixValues) => void
	isSubmitting: boolean
	onCancel: () => void
	onFinish: (values: DownloadPrefixValues) => void
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
			onOk={() => props.onFinish(props.values)}
			onCancel={props.onCancel}
			destroyOnHidden
		>
			<Alert
				type="info"
				showIcon
				title="Downloads objects to your device"
				description="Files are saved to the folder you select in this browser session."
				style={{ marginBottom: 12 }}
			/>

			{!support.ok ? (
				<Alert
					type="warning"
					showIcon
					title="Local folder access is not available"
					description={support.reason ?? 'Use HTTPS or localhost in a supported browser.'}
					style={{ marginBottom: 12 }}
				/>
			) : null}

			<form
				onSubmit={(e) => {
					e.preventDefault()
					props.onFinish(props.values)
				}}
			>
				<FormField label="Source">
					<Typography.Text code>{props.sourceLabel}</Typography.Text>
				</FormField>

				<FormField label="Local destination folder" required>
					<LocalDevicePathInput
						value={props.values.localFolder}
						onChange={(value) => props.onValuesChange({ ...props.values, localFolder: value })}
						placeholder="Select a folder…"
						disabled={!support.ok}
						onPick={props.onPickFolder}
					/>
				</FormField>
			</form>
		</Modal>
	)
}
