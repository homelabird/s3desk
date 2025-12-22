import type { FormInstance } from 'antd'
import { Alert, Form, Modal, Switch, Typography } from 'antd'

import type { APIClient } from '../../api/client'
import { LocalPathInput } from '../../components/LocalPathInput'

type DownloadPrefixForm = {
	localPath: string
	deleteExtraneous: boolean
	dryRun: boolean
}

type ObjectsDownloadPrefixModalProps = {
	open: boolean
	api: APIClient
	profileId: string | null
	hasProfile: boolean
	sourceLabel: string
	form: FormInstance<DownloadPrefixForm>
	isSubmitting: boolean
	onCancel: () => void
	onBrowse: () => void
	onFinish: (values: DownloadPrefixForm) => void
}

export function ObjectsDownloadPrefixModal(props: ObjectsDownloadPrefixModalProps) {
	return (
		<Modal
			open={props.open}
			title="Download to server (backup)"
			okText="Start download"
			okButtonProps={{ loading: props.isSubmitting }}
			onOk={() => props.form.submit()}
			onCancel={props.onCancel}
			destroyOnClose
		>
			<Alert
				type="info"
				showIcon
				message="Downloads objects to the server (backup)"
				description="Runs in the background (S3 → server local). The destination path is on the server."
				style={{ marginBottom: 12 }}
			/>

			<Form
				form={props.form}
				layout="vertical"
				initialValues={{ localPath: '', deleteExtraneous: false, dryRun: false }}
				onFinish={props.onFinish}
			>
				<Form.Item label="Source">
					<Typography.Text code>{props.sourceLabel}</Typography.Text>
				</Form.Item>
				<Form.Item name="localPath" label="Server destination path" rules={[{ required: true }]}>
					<LocalPathInput
						api={props.api}
						profileId={props.profileId}
						placeholder="/path/to/folder"
						onBrowse={props.onBrowse}
						disabled={!props.hasProfile}
						browseDisabled={!props.hasProfile}
					/>
				</Form.Item>
				<Form.Item name="deleteExtraneous" label="Delete extraneous local files (s5cmd --delete)" valuePropName="checked">
					<Switch />
				</Form.Item>
				<Form.Item name="dryRun" label="Dry run (no changes)" valuePropName="checked">
					<Switch />
				</Form.Item>
			</Form>
		</Modal>
	)
}
