import { Alert, Button, Typography } from 'antd'

import { DialogModal } from '../../components/DialogModal'
import { FormField } from '../../components/FormField'
import { LocalDevicePathInput } from '../../components/LocalDevicePathInput'
import { getDevicePickerSupport } from '../../lib/deviceFs'
import { localDeviceAccessBrowserHint, localFolderAccessUnavailableTitle } from '../../lib/secureContext'
import styles from './ObjectsDialogs.module.css'

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
	const localDestinationInputId = 'objects-download-prefix-local-input'
	const submit = () => {
		if (props.isSubmitting || !props.canSubmit) return
		props.onFinish(props.values)
	}

	return (
		<DialogModal
			open={props.open}
			title="Download to this device"
			onClose={props.onCancel}
			closeDisabled={props.isSubmitting}
			width={640}
			footer={
				<>
					<Button onClick={props.onCancel} disabled={props.isSubmitting}>Cancel</Button>
					<Button type="primary" loading={props.isSubmitting} disabled={!props.canSubmit} onClick={submit}>
						Start download
					</Button>
				</>
			}
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
				<FormField label="Source">
					<Typography.Text code className={styles.dialogCodeValue}>
						{props.sourceLabel}
					</Typography.Text>
				</FormField>

				<FormField label="Local destination folder" htmlFor={localDestinationInputId} required>
					<LocalDevicePathInput
						id={localDestinationInputId}
						value={props.values.localFolder}
						onChange={(value) => props.onValuesChange({ ...props.values, localFolder: value })}
						placeholder="Select a folder…"
						disabled={props.isSubmitting || !support.ok}
						pickerMode="readwrite"
						onPick={props.onPickFolder}
					/>
				</FormField>
			</form>
		</DialogModal>
	)
}
