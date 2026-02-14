import { Alert, Button, Checkbox, Input, Modal, Typography } from 'antd'

type ObjectsNewFolderModalProps = {
	open: boolean
	parentLabel: string
	parentPrefix: string
	errorMessage?: string | null
	partialKey?: string | null
	onOpenPrefix: (prefix: string) => void
	values: { name: string; allowPath: boolean }
	onValuesChange: (values: { name: string; allowPath: boolean }) => void
	isSubmitting: boolean
	onCancel: () => void
	onFinish: (values: { name: string; allowPath: boolean }) => void
}

export function ObjectsNewFolderModal(props: ObjectsNewFolderModalProps) {
	const rawInput = typeof props.values.name === 'string' ? props.values.name.trim().replace(/\/+$/, '').replace(/^\/+/, '') : ''
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
			onOk={() => props.onFinish(props.values)}
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

			<form
				onSubmit={(e) => {
					e.preventDefault()
					props.onFinish(props.values)
				}}
			>
				<div style={{ marginBottom: 12 }}>
					<div style={{ fontWeight: 700, marginBottom: 6 }}>Parent</div>
					<Typography.Text
						code
						ellipsis={{ tooltip: props.parentLabel }}
						copyable
						style={{ maxWidth: '100%', display: 'inline-block' }}
					>
						{props.parentLabel}
					</Typography.Text>
				</div>

				<div style={{ marginBottom: 12 }}>
					<label htmlFor="objectsNewFolderName" style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>
						Folder name
					</label>
					<Input
						id="objectsNewFolderName"
						value={props.values.name}
						onChange={(e) => props.onValuesChange({ ...props.values, name: e.target.value })}
						placeholder="new-folder…"
						autoComplete="off"
						autoFocus
					/>
				</div>

				<Checkbox
					checked={props.values.allowPath}
					onChange={(e) => props.onValuesChange({ ...props.values, allowPath: e.target.checked })}
				>
					Allow nested path (a/b/c)
				</Checkbox>
			</form>
		</Modal>
	)
}
