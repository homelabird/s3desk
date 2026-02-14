import { Alert, Checkbox, Modal, Typography } from 'antd'

import { FormField } from '../../components/FormField'
import { LocalDevicePathInput } from '../../components/LocalDevicePathInput'
import { getDevicePickerSupport } from '../../lib/deviceFs'

type UploadFolderValues = {
	localFolder: string
	moveAfterUpload: boolean
	cleanupEmptyDirs: boolean
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
	onDefaultsChange?: (values: { moveAfterUpload: boolean; cleanupEmptyDirs: boolean }) => void
}

export function ObjectsUploadFolderModal(props: ObjectsUploadFolderModalProps) {
	const support = getDevicePickerSupport()

	return (
		<Modal
			open={props.open}
			title="Upload folder from this device"
			okText="Start upload"
			okButtonProps={{ loading: props.isSubmitting, disabled: !props.canSubmit }}
			onOk={() => props.onFinish(props.values)}
			onCancel={props.onCancel}
			destroyOnHidden
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
						onPick={props.onPickFolder}
					/>
				</FormField>

				<div style={{ marginBottom: 10 }}>
					<Checkbox
						checked={props.values.moveAfterUpload}
						onChange={(e) => {
							const moveAfterUpload = e.target.checked
							const cleanupEmptyDirs = moveAfterUpload ? props.values.cleanupEmptyDirs : false
							props.onValuesChange({ ...props.values, moveAfterUpload, cleanupEmptyDirs })
							props.onDefaultsChange?.({ moveAfterUpload, cleanupEmptyDirs })
						}}
					>
						Move after upload (delete local files after the job succeeds)
					</Checkbox>
				</div>

				<Checkbox
					checked={props.values.cleanupEmptyDirs}
					disabled={!props.values.moveAfterUpload}
					onChange={(e) => {
						const cleanupEmptyDirs = e.target.checked
						props.onValuesChange({ ...props.values, cleanupEmptyDirs })
						props.onDefaultsChange?.({ moveAfterUpload: props.values.moveAfterUpload, cleanupEmptyDirs })
					}}
				>
					Auto-clean empty folders
				</Checkbox>
			</form>
		</Modal>
	)
}
