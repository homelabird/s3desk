import { Alert, Button, Input, Typography } from 'antd'

import { DialogModal } from '../../components/DialogModal'
import { DatalistInput } from '../../components/DatalistInput'
import { FormField } from '../../components/FormField'
import { ObjectsOverlaySheet } from './ObjectsOverlaySheet'
import type { MoveSelectionValues } from './useObjectsSelectionMove'
import styles from './ObjectsDialogs.module.css'

type ObjectsMoveSelectionSheetProps = {
	open: boolean
	useBottomSheet: boolean
	selectedCount: number
	bucket: string
	prefix: string
	values: MoveSelectionValues
	onValuesChange: (values: MoveSelectionValues) => void
	bucketOptions: Array<{ label: string; value: string }>
	isBucketsLoading: boolean
	isSubmitting: boolean
	onCancel: () => void
	onFinish: (values: MoveSelectionValues) => void
}

function Content(props: ObjectsMoveSelectionSheetProps) {
	return (
		<>
			<Alert
				type="warning"
				showIcon
				title="Move is destructive"
				description="This starts a background move job (copy then delete source). Leave destination folder blank to move to the bucket root."
				className={styles.alertBlock}
			/>

			<form
				className={styles.form}
				onSubmit={(event) => {
					event.preventDefault()
					props.onFinish(props.values)
				}}
			>
				<FormField label="Selection">
					<Typography.Text>{props.selectedCount} item(s)</Typography.Text>
				</FormField>

				<FormField label="Current location">
					<Typography.Text code className={styles.sourceCode}>
						{props.bucket ? `s3://${props.bucket}/${props.prefix}` : '-'}
					</Typography.Text>
				</FormField>

				<FormField label="Destination bucket" required>
					<DatalistInput
						value={props.values.dstBucket}
						onChange={(value) => props.onValuesChange({ ...props.values, dstBucket: value })}
						placeholder="bucket…"
						ariaLabel="Destination bucket"
						allowClear
						disabled={props.isBucketsLoading && props.bucketOptions.length === 0}
						options={props.bucketOptions.map((option) => ({ value: option.value, label: option.label }))}
					/>
				</FormField>

				<FormField label="Destination folder">
					<Input
						value={props.values.dstPrefix}
						onChange={(event) => props.onValuesChange({ ...props.values, dstPrefix: event.target.value })}
						placeholder="folder/subfolder/"
						aria-label="Destination folder"
						autoComplete="off"
					/>
				</FormField>

				<FormField label='Type "MOVE" to confirm' required>
					<Input
						value={props.values.confirm}
						onChange={(event) => props.onValuesChange({ ...props.values, confirm: event.target.value })}
						placeholder="MOVE…"
						aria-label='Type "MOVE" to confirm'
						autoComplete="off"
					/>
				</FormField>
			</form>
		</>
	)
}

export function ObjectsMoveSelectionSheet(props: ObjectsMoveSelectionSheetProps) {
	const actions = (
		<div className={styles.sheetActions}>
			<Button onClick={props.onCancel}>Cancel</Button>
			<Button type="primary" danger loading={props.isSubmitting} onClick={() => props.onFinish(props.values)}>
				Start move
			</Button>
		</div>
	)

	if (props.useBottomSheet) {
		return (
			<ObjectsOverlaySheet
				open={props.open}
				onClose={props.onCancel}
				title={`Move ${props.selectedCount} item(s)…`}
				placement="bottom"
				height="min(82dvh, 640px)"
				dataTestId="objects-move-selection-sheet"
				bodyClassName={styles.sheetBody}
			>
				<Content {...props} />
				{actions}
			</ObjectsOverlaySheet>
		)
	}

	return (
		<DialogModal
			open={props.open}
			title={`Move ${props.selectedCount} item(s)…`}
			onClose={props.onCancel}
			width={640}
			footer={actions}
		>
			<Content {...props} />
		</DialogModal>
	)
}
