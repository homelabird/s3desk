import { Alert, Button, Checkbox, Input, Modal, Typography } from 'antd'

import { FormField } from '../../components/FormField'
import styles from './ObjectsDialogs.module.css'

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
						<div className={styles.errorDescription}>
							<div>{props.errorMessage}</div>
							{partialKey ? (
								<Typography.Text type="secondary" className={styles.partialKeyNote}>
									Some intermediate folders may already exist: <Typography.Text code>{partialKey}</Typography.Text>
								</Typography.Text>
							) : null}
							<div className={styles.partialKeyActions}>
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
					className={styles.alertBlock}
				/>
			) : null}

			<details className={styles.detailsHint}>
				<summary className={styles.detailsSummary}>About “folders” in S3</summary>
				<Alert
					type="info"
					showIcon
					title="Creates a folder marker object"
					description="S3 folders are prefixes; this creates a zero-byte object whose key ends with '/'."
					className={styles.detailsAlert}
				/>
			</details>

			<form
				className={styles.form}
				onSubmit={(e) => {
					e.preventDefault()
					props.onFinish(props.values)
				}}
			>
				<FormField label="Parent">
					<Typography.Text
						code
						ellipsis={{ tooltip: props.parentLabel }}
						copyable
						className={styles.sourceCode}
					>
						{props.parentLabel}
					</Typography.Text>
				</FormField>

				<FormField label="Folder name" htmlFor="objectsNewFolderName">
					<Input
						id="objectsNewFolderName"
						value={props.values.name}
						onChange={(e) => props.onValuesChange({ ...props.values, name: e.target.value })}
						placeholder="new-folder…"
						autoComplete="off"
						autoFocus
					/>
				</FormField>

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
