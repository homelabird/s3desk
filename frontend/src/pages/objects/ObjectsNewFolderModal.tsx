import type { FormInstance } from 'antd'
import { Alert, Form, Input, Modal, Typography } from 'antd'

type ObjectsNewFolderModalProps = {
	open: boolean
	parentLabel: string
	form: FormInstance<{ name: string }>
	isSubmitting: boolean
	onCancel: () => void
	onFinish: (values: { name: string }) => void
}

export function ObjectsNewFolderModal(props: ObjectsNewFolderModalProps) {
	return (
		<Modal
			open={props.open}
			title="New folder"
			okText="Create folder"
			okButtonProps={{ loading: props.isSubmitting }}
			onOk={() => props.form.submit()}
			onCancel={props.onCancel}
			destroyOnClose
		>
			<Alert
				type="info"
				showIcon
				message="Creates a folder marker object"
				description="S3 folders are prefixes; this creates a zero-byte object whose key ends with '/'."
				style={{ marginBottom: 12 }}
			/>

			<Form form={props.form} layout="vertical" initialValues={{ name: '' }} onFinish={props.onFinish}>
				<Form.Item label="Parent">
					<Typography.Text code>{props.parentLabel}</Typography.Text>
				</Form.Item>
				<Form.Item
					name="name"
					label="Folder name"
					rules={[
						{ required: true, message: 'folder name is required' },
						{
							validator: async (_, v: string) => {
								const raw = typeof v === 'string' ? v.trim().replace(/\/+$/, '') : ''
								if (!raw) throw new Error('folder name is required')
								if (raw === '.' || raw === '..') throw new Error('invalid folder name')
								if (raw.includes('/')) throw new Error("folder name must not contain '/'")
								if (raw.includes('\u0000')) throw new Error('invalid folder name')
							},
						},
					]}
				>
					<Input id="objectsNewFolderInput" placeholder="new-folder" autoComplete="off" />
				</Form.Item>
			</Form>
		</Modal>
	)
}
