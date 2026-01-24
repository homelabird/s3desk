import type { FormInstance } from 'antd'
import { Alert, Checkbox, Form, Modal, Typography } from 'antd'

import { LocalDevicePathInput } from '../../components/LocalDevicePathInput'
import { getDevicePickerSupport } from '../../lib/deviceFs'

type UploadFolderForm = {
	localFolder: string
	moveAfterUpload: boolean
	cleanupEmptyDirs: boolean
}

type ObjectsUploadFolderModalProps = {
	open: boolean
	destinationLabel: string
	form: FormInstance<UploadFolderForm>
	defaultMoveAfterUpload: boolean
	defaultCleanupEmptyDirs: boolean
	isSubmitting: boolean
	onCancel: () => void
	onFinish: (values: UploadFolderForm) => void
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
			onOk={() => props.form.submit()}
			onCancel={props.onCancel}
			destroyOnClose
		>
			<Alert
				type="info"
				showIcon
				message="Uploads from this device"
				description="Files are uploaded by the browser and appear in Transfers (not as server jobs)."
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
				initialValues={{
					localFolder: '',
					moveAfterUpload: props.defaultMoveAfterUpload,
					cleanupEmptyDirs: props.defaultCleanupEmptyDirs,
				}}
				onFinish={props.onFinish}
				onValuesChange={(_, values) => {
					props.onDefaultsChange?.({
						moveAfterUpload: values.moveAfterUpload,
						cleanupEmptyDirs: values.cleanupEmptyDirs,
					})
				}}
			>
				<Form.Item label="Destination">
					<Typography.Text code>{props.destinationLabel}</Typography.Text>
				</Form.Item>
				<Form.Item name="localFolder" label="Local folder" rules={[{ required: true }]}>
					<LocalDevicePathInput
						placeholder="Select a folder…"
						disabled={!support.ok}
						onPick={props.onPickFolder}
					/>
				</Form.Item>
				<Form.Item name="moveAfterUpload" valuePropName="checked">
					<Checkbox>Move after upload (delete local files after the job succeeds)</Checkbox>
				</Form.Item>
				<Form.Item shouldUpdate={(prev, next) => prev.moveAfterUpload !== next.moveAfterUpload} noStyle>
					{({ getFieldValue }) => (
						<Form.Item name="cleanupEmptyDirs" valuePropName="checked">
							<Checkbox disabled={!getFieldValue('moveAfterUpload')}>Auto-clean empty folders</Checkbox>
						</Form.Item>
					)}
				</Form.Item>
			</Form>
		</Modal>
	)
}
