import type { FormInstance } from 'antd'
import { Alert, Form, Input, Modal, Typography } from 'antd'

type RenameForm = {
	name: string
	confirm: string
}

type ObjectsRenameModalProps = {
	open: boolean
	kind: 'object' | 'prefix'
	source: string | null
	bucket: string
	form: FormInstance<RenameForm>
	isSubmitting: boolean
	onCancel: () => void
	onFinish: (values: RenameForm) => void
}

export function ObjectsRenameModal(props: ObjectsRenameModalProps) {
	const isPrefix = props.kind === 'prefix'
	const sourceLabel = props.bucket && props.source ? `s3://${props.bucket}/${isPrefix ? `${props.source}*` : props.source}` : '-'

	return (
		<Modal
			open={props.open}
			title={isPrefix ? 'Rename folder…' : 'Rename object…'}
			okText="Rename"
			okButtonProps={{ loading: props.isSubmitting, danger: true, disabled: !props.source }}
			onOk={() => props.form.submit()}
			onCancel={props.onCancel}
			destroyOnClose
		>
			<Alert
				type="warning"
				showIcon
				title={isPrefix ? 'Folder rename moves all objects under it' : 'Rename is destructive'}
				description="This creates a move job (copy then delete source)."
				style={{ marginBottom: 12 }}
			/>

			<Form form={props.form} layout="vertical" initialValues={{ name: '', confirm: '' }} onFinish={props.onFinish}>
				<Form.Item label="Source">
					<Typography.Text code>{sourceLabel}</Typography.Text>
				</Form.Item>
				<Form.Item
					name="name"
					label="New name"
					rules={[
						{ required: true, message: 'name is required' },
						{
							validator: async (_, v: string) => {
								const raw = typeof v === 'string' ? v.trim().replace(/\/+$/, '') : ''
								if (!raw) throw new Error('name is required')
								if (raw === '.' || raw === '..') throw new Error('invalid name')
								if (raw.includes('/')) throw new Error("name must not contain '/'")
								if (raw.includes('\u0000')) throw new Error('invalid name')
							},
						},
					]}
				>
					<Input id="objectsRenameInput" placeholder={isPrefix ? 'folder-name' : 'file-name'} autoComplete="off" />
				</Form.Item>

				<Form.Item
					name="confirm"
					label='Type "RENAME" to confirm'
					rules={[
						{
							validator: async (_, v: string) => {
								if (v === 'RENAME') return
								throw new Error('Type RENAME to proceed')
							},
						},
					]}
				>
					<Input placeholder="RENAME…" autoComplete="off" />
				</Form.Item>
			</Form>
		</Modal>
	)
}
