import { Alert, Input, Modal, Typography } from 'antd'

type RenameForm = {
	name: string
	confirm: string
}

type ObjectsRenameModalProps = {
	open: boolean
	kind: 'object' | 'prefix'
	source: string | null
	bucket: string
	values: RenameForm
	onValuesChange: (values: RenameForm) => void
	isSubmitting: boolean
	onCancel: () => void
	onFinish: (values: RenameForm) => void
}

export function ObjectsRenameModal(props: ObjectsRenameModalProps) {
	const isPrefix = props.kind === 'prefix'
	const sourceLabel = props.bucket && props.source ? `s3://${props.bucket}/${isPrefix ? `${props.source}*` : props.source}` : '-'
	const canSubmit = !!props.source && !!props.values.name.trim()

	return (
		<Modal
			open={props.open}
			title={isPrefix ? 'Rename folder…' : 'Rename object…'}
			okText="Rename"
			okButtonProps={{ loading: props.isSubmitting, danger: true, disabled: !canSubmit }}
			onOk={() => props.onFinish(props.values)}
			onCancel={props.onCancel}
			destroyOnHidden
		>
			<Alert
				type="warning"
				showIcon
				title={isPrefix ? 'Folder rename moves all objects under it' : 'Rename is destructive'}
				description="This creates a move job (copy then delete source)."
				style={{ marginBottom: 12 }}
			/>

			<form
				onSubmit={(e) => {
					e.preventDefault()
					props.onFinish(props.values)
				}}
			>
				<div style={{ marginBottom: 12 }}>
					<div style={{ fontWeight: 700, marginBottom: 6 }}>Source</div>
					<Typography.Text code>{sourceLabel}</Typography.Text>
				</div>

				<div style={{ marginBottom: 12 }}>
					<label htmlFor="objectsRenameInput" style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>
						New name
					</label>
					<Input
						id="objectsRenameInput"
						value={props.values.name}
						onChange={(e) => props.onValuesChange({ ...props.values, name: e.target.value })}
						placeholder={isPrefix ? 'folder-name' : 'file-name'}
						autoComplete="off"
					/>
				</div>

				<div style={{ marginBottom: 12 }}>
					<label htmlFor="objectsRenameConfirm" style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>
						Type &quot;RENAME&quot; to confirm
					</label>
					<Input
						id="objectsRenameConfirm"
						value={props.values.confirm}
						onChange={(e) => props.onValuesChange({ ...props.values, confirm: e.target.value })}
						placeholder="RENAME…"
						autoComplete="off"
					/>
				</div>
			</form>
		</Modal>
	)
}
