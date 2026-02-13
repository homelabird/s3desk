import type { FormInstance } from 'antd'
import { Alert, Button, Checkbox, Form, Input, Modal, Typography } from 'antd'

type ObjectsNewFolderModalProps = {
	open: boolean
	parentLabel: string
	parentPrefix: string
	errorMessage?: string | null
	partialKey?: string | null
	onOpenPrefix: (prefix: string) => void
	form: FormInstance<{ name: string; allowPath?: boolean }>
	isSubmitting: boolean
	onCancel: () => void
	onFinish: (values: { name: string; allowPath?: boolean }) => void
}

export function ObjectsNewFolderModal(props: ObjectsNewFolderModalProps) {
	const rawName = props.form.getFieldValue('name')
	const rawInput = typeof rawName === 'string' ? rawName.trim().replace(/\/+$/, '').replace(/^\/+/, '') : ''
	const parent = props.parentPrefix.trim()
	const parentNormalized = !parent ? '' : parent.endsWith('/') ? parent : `${parent}/`
	const typedKey = rawInput ? `${parentNormalized}${rawInput}/` : ''
	const partialKey = (props.partialKey ?? '').trim()

	const openPrefix = (target: string) => {
		props.onCancel()
		props.onOpenPrefix(target)
	}

	return (
		<Modal
			open={props.open}
			title="New folder"
			okText="Create folder"
			okButtonProps={{ loading: props.isSubmitting }}
			onOk={() => props.form.submit()}
			onCancel={props.onCancel}
			destroyOnHidden
		>
			{props.errorMessage ? (
				<Alert
					type="error"
					showIcon
					title="Failed to create folder"
					description={
						<div>
							<div>{props.errorMessage}</div>
							{partialKey ? (
								<div style={{ marginTop: 6 }}>
									<Typography.Text type="secondary">
										Some intermediate folders may already exist: <Typography.Text code>{partialKey}</Typography.Text>
									</Typography.Text>
								</div>
							) : null}
							<div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
								<Button size="small" onClick={() => openPrefix(props.parentPrefix)}>
									Open parent
								</Button>
								<Button size="small" disabled={!typedKey} onClick={() => typedKey && openPrefix(typedKey)}>
									Open typed path
								</Button>
								{partialKey ? (
									<Button size="small" onClick={() => openPrefix(partialKey)}>
										Open last created
									</Button>
								) : null}
							</div>
						</div>
					}
					style={{ marginBottom: 12 }}
				/>
			) : null}

			<details style={{ marginBottom: 12 }}>
				<summary style={{ cursor: 'pointer', userSelect: 'none' }}>About “folders” in S3</summary>
				<Alert
					type="info"
					showIcon
					title="Creates a folder marker object"
					description="S3 folders are prefixes; this creates a zero-byte object whose key ends with '/'."
					style={{ marginTop: 8 }}
				/>
			</details>

			<Form form={props.form} layout="vertical" initialValues={{ name: '', allowPath: false }} onFinish={props.onFinish}>
				<Form.Item label="Parent">
					<Typography.Text
						code
						ellipsis={{ tooltip: props.parentLabel }}
						copyable
						style={{ maxWidth: '100%', display: 'inline-block' }}
					>
						{props.parentLabel}
					</Typography.Text>
				</Form.Item>
				<Form.Item
					name="name"
					label="Folder name"
					dependencies={['allowPath']}
					rules={[
						{ required: true, message: 'folder name is required' },
						{
							validator: async (_, v: string) => {
								const allowPath = !!props.form.getFieldValue('allowPath')
								const rawInput = typeof v === 'string' ? v.trim().replace(/\/+$/, '').replace(/^\/+/, '') : ''
								if (!rawInput) throw new Error('folder name is required')
								if (rawInput.includes('\u0000')) throw new Error('invalid folder name')
								const parts = rawInput.split('/').filter(Boolean)
								if (parts.length === 0) throw new Error('folder name is required')
								if (!allowPath && parts.length > 1) throw new Error("folder name must not contain '/'")
								for (const part of parts) {
									if (part === '.' || part === '..') throw new Error('invalid folder name')
								}
							},
						},
					]}
				>
					<Input placeholder="new-folder…" autoComplete="off" autoFocus />
				</Form.Item>

				<Form.Item name="allowPath" valuePropName="checked">
					<Checkbox>Allow nested path (a/b/c)</Checkbox>
				</Form.Item>
			</Form>
		</Modal>
	)
}
