import { Alert, Button, Input, Typography } from 'antd'

import { DialogModal } from '../../components/DialogModal'
import { FormField } from '../../components/FormField'
import styles from './ObjectsDialogs.module.css'

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
	const canSubmit = !!props.source && !!props.values.name.trim() && !props.isSubmitting
	const submit = () => {
		if (!canSubmit) return
		props.onFinish(props.values)
	}

	return (
		<DialogModal
			open={props.open}
			title={isPrefix ? 'Rename folder…' : 'Rename object…'}
			onClose={props.onCancel}
			closeDisabled={props.isSubmitting}
			initialFocusSelector="#objectsRenameInput"
			width={640}
			footer={
				<>
					<Button onClick={props.onCancel} disabled={props.isSubmitting}>Cancel</Button>
					<Button type="primary" danger loading={props.isSubmitting} disabled={!canSubmit} onClick={submit}>
						Rename
					</Button>
				</>
			}
		>
			<div className={styles.alertStack}>
				<Alert
					type="warning"
					showIcon
					title={isPrefix ? 'Folder rename moves all objects under it' : 'Rename is destructive'}
					description="This creates a move job (copy then delete source)."
				/>
			</div>

			<form
				className={styles.form}
				onSubmit={(e) => {
					e.preventDefault()
					submit()
				}}
			>
				<FormField label="Source">
					<Typography.Text code className={styles.sourceCode}>
						{sourceLabel}
					</Typography.Text>
				</FormField>

				<FormField label="New name" htmlFor="objectsRenameInput">
					<Input
						id="objectsRenameInput"
						value={props.values.name}
						onChange={(e) => props.onValuesChange({ ...props.values, name: e.target.value })}
						placeholder={isPrefix ? 'folder-name' : 'file-name'}
						autoComplete="off"
						disabled={props.isSubmitting}
					/>
				</FormField>

				<FormField label='Type "RENAME" to confirm' htmlFor="objectsRenameConfirm">
					<Input
						id="objectsRenameConfirm"
						value={props.values.confirm}
						onChange={(e) => props.onValuesChange({ ...props.values, confirm: e.target.value })}
						placeholder="RENAME…"
						autoComplete="off"
						disabled={props.isSubmitting}
					/>
				</FormField>
			</form>
		</DialogModal>
	)
}
