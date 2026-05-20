import { Alert, Button, Input, Typography } from 'antd'

import { DialogModal } from '../../components/DialogModal'
import { FormField } from '../../components/FormField'
import { DatalistInput } from '../../components/DatalistInput'
import { ToggleSwitch } from '../../components/ToggleSwitch'

type CopyMoveValues = {
	dstBucket: string
	dstKey: string
	dryRun: boolean
	confirm: string
}

type ObjectsCopyMoveModalProps = {
	open: boolean
	mode: 'copy' | 'move'
	bucket: string
	srcKey: string | null
	values: CopyMoveValues
	onValuesChange: (values: CopyMoveValues) => void
	bucketOptions: Array<{ label: string; value: string }>
	isBucketsLoading: boolean
	isSubmitting: boolean
	onCancel: () => void
	onFinish: (values: CopyMoveValues) => void
}

export function ObjectsCopyMoveModal(props: ObjectsCopyMoveModalProps) {
	const isMove = props.mode === 'move'
	const destinationBucketInputId = 'objects-copy-move-destination-bucket'
	const destinationKeyInputId = 'objects-copy-move-destination-key'
	const moveConfirmInputId = 'objects-copy-move-confirm'
	const submit = () => {
		if (props.isSubmitting) return
		props.onFinish(props.values)
	}

	return (
		<DialogModal
			open={props.open}
			title={isMove ? 'Move/Rename object…' : 'Copy object…'}
			onClose={props.onCancel}
			closeDisabled={props.isSubmitting}
			initialFocusSelector={`#${destinationBucketInputId}`}
			width={640}
			footer={
				<>
					<Button onClick={props.onCancel} disabled={props.isSubmitting}>Cancel</Button>
					<Button type="primary" danger={isMove} loading={props.isSubmitting} onClick={submit}>
						{isMove ? 'Start move' : 'Start copy'}
					</Button>
				</>
			}
		>
			{isMove ? (
				<Alert
					type="warning"
					showIcon
					title="Move/Rename is destructive"
					description="This uses transfer move (copy then delete source)."
					style={{ marginBottom: 12 }}
				/>
			) : (
				<Alert
					type="info"
					showIcon
					title="Copy within S3"
					description="This uses transfer copy (server-side copy)."
					style={{ marginBottom: 12 }}
				/>
			)}

			<form
				onSubmit={(e) => {
					e.preventDefault()
					submit()
				}}
			>
				<FormField label="Source">
					<Typography.Text code>
						{props.srcKey ? `s3://${props.bucket}/${props.srcKey}` : '-'}
					</Typography.Text>
				</FormField>

				<FormField label="Destination bucket" htmlFor={destinationBucketInputId} required>
					<DatalistInput
						id={destinationBucketInputId}
						value={props.values.dstBucket}
						onChange={(value) => props.onValuesChange({ ...props.values, dstBucket: value })}
						placeholder="bucket…"
						ariaLabel="Destination bucket"
						allowClear
						disabled={props.isSubmitting || (props.isBucketsLoading && props.bucketOptions.length === 0)}
						options={props.bucketOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
					/>
				</FormField>

				<FormField label="Destination key" htmlFor={destinationKeyInputId} required>
					<Input
						id={destinationKeyInputId}
						value={props.values.dstKey}
						onChange={(e) => props.onValuesChange({ ...props.values, dstKey: e.target.value })}
						placeholder="path/to/object…"
						autoComplete="off"
						disabled={props.isSubmitting}
					/>
				</FormField>

				<FormField label="Dry run (no changes)">
					<ToggleSwitch
						checked={props.values.dryRun}
						onChange={(checked) => props.onValuesChange({ ...props.values, dryRun: checked })}
						ariaLabel="Dry run"
						disabled={props.isSubmitting}
					/>
				</FormField>

				{isMove && !props.values.dryRun ? (
					<FormField label='Type "MOVE" to confirm' htmlFor={moveConfirmInputId} required>
						<Input
							id={moveConfirmInputId}
							value={props.values.confirm}
							onChange={(e) => props.onValuesChange({ ...props.values, confirm: e.target.value })}
							placeholder="MOVE…"
							autoComplete="off"
							disabled={props.isSubmitting}
						/>
					</FormField>
				) : null}
			</form>
		</DialogModal>
	)
}
