import { Alert, Button, Typography } from 'antd'

import { DialogModal } from '../../components/DialogModal'
import { FormField } from '../../components/FormField'
import { LocalDevicePathInput } from '../../components/LocalDevicePathInput'
import { getDevicePickerSupport } from '../../lib/deviceFs'
import { localDeviceAccessBrowserHint, localFolderAccessUnavailableTitle } from '../../lib/secureContext'
import styles from './ObjectsDialogs.module.css'

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
	const localFolderInputId = 'objects-upload-folder-local-input'
	const submit = () => {
		if (props.isSubmitting || !props.canSubmit) return
		props.onFinish(props.values)
	}

	return (
		<DialogModal
			open={props.open}
			title="Upload folder from this device"
			onClose={props.onCancel}
			closeDisabled={props.isSubmitting}
			width={640}
			footer={
				<>
					<Button onClick={props.onCancel} disabled={props.isSubmitting}>Cancel</Button>
					<Button type="primary" loading={props.isSubmitting} disabled={!props.canSubmit} onClick={submit}>
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
					title={localFolderAccessUnavailableTitle()}
					description={support.reason ?? localDeviceAccessBrowserHint()}
					style={{ marginBottom: 12 }}
				/>
			) : null}

			<form
				onSubmit={(e) => {
					e.preventDefault()
					submit()
				}}
			>
				<FormField label="Destination">
					<Typography.Text code className={styles.dialogCodeValue}>
						{props.destinationLabel}
					</Typography.Text>
				</FormField>

				<FormField label="Local folder" htmlFor={localFolderInputId} required>
					<LocalDevicePathInput
						id={localFolderInputId}
						value={props.values.localFolder}
						onChange={(value) => props.onValuesChange({ ...props.values, localFolder: value })}
						placeholder="Select a folder…"
						disabled={props.isSubmitting || !support.ok}
						pickerMode="read"
						onPick={props.onPickFolder}
					/>
				</FormField>
			</form>
		</DialogModal>
	)
}
