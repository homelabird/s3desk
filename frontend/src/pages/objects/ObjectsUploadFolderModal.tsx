import { Alert, Button, Typography } from 'antd'

import { DialogModal } from '../../components/DialogModal'
import { FormField } from '../../components/FormField'
import { LocalDevicePathInput } from '../../components/LocalDevicePathInput'
import { getDevicePickerSupport } from '../../lib/deviceFs'

type UploadFolderValues = {
	localFolder: string
}

type ObjectsUploadFolderModalProps = {
	open: boolean
	destinationLabel: string
	values: UploadFolderValues
	onValuesChange: (values: UploadFolderValues) => void
	isSubmitting: boolean
	onCancel: () => void
	onFinish: (values: UploadFolderValues) => void
	onPickFolder: (handle: FileSystemDirectoryHandle) => void
	canSubmit: boolean
}

export function ObjectsUploadFolderModal(props: ObjectsUploadFolderModalProps) {
	const support = getDevicePickerSupport()

	return (
		<DialogModal
			open={props.open}
			title="Upload folder from this device"
			onClose={props.onCancel}
			width={640}
			footer={
				<>
					<Button onClick={props.onCancel}>Cancel</Button>
					<Button type="primary" loading={props.isSubmitting} disabled={!props.canSubmit} onClick={() => props.onFinish(props.values)}>
						Start upload
					</Button>
				</>
			}
		>
			<Alert
				type="info"
				showIcon
				title="Uploads from this device"
				description="Files are uploaded by the browser and appear in Transfers (not as server jobs)."
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
				<FormField label="Destination">
					<Typography.Text code>{props.destinationLabel}</Typography.Text>
				</FormField>

				<FormField label="Local folder" required>
					<LocalDevicePathInput
						value={props.values.localFolder}
						onChange={(value) => props.onValuesChange({ ...props.values, localFolder: value })}
						placeholder="Select a folder…"
						disabled={!support.ok}
						pickerMode="read"
						onPick={props.onPickFolder}
					/>
				</FormField>
			</form>
		</DialogModal>
	)
}
