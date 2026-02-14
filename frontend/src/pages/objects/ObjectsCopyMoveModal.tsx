import type { SelectProps } from 'antd'
import { Alert, Input, Modal, Select, Switch, Typography } from 'antd'

import { FormField } from '../../components/FormField'

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
	bucketOptions: SelectProps['options']
	isBucketsLoading: boolean
	isSubmitting: boolean
	onCancel: () => void
	onFinish: (values: CopyMoveValues) => void
}

export function ObjectsCopyMoveModal(props: ObjectsCopyMoveModalProps) {
	const isMove = props.mode === 'move'

	return (
		<Modal
			open={props.open}
			title={isMove ? 'Move/Rename object…' : 'Copy object…'}
			okText={isMove ? 'Start move' : 'Start copy'}
			okButtonProps={{ loading: props.isSubmitting, danger: isMove }}
			onOk={() => props.onFinish(props.values)}
			onCancel={props.onCancel}
			destroyOnHidden
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
					props.onFinish(props.values)
				}}
			>
				<FormField label="Source">
					<Typography.Text code>
						{props.srcKey ? `s3://${props.bucket}/${props.srcKey}` : '-'}
					</Typography.Text>
				</FormField>

				<FormField label="Destination bucket" required>
					<Select
						showSearch
						options={props.bucketOptions}
						value={props.values.dstBucket}
						onChange={(value) => props.onValuesChange({ ...props.values, dstBucket: String(value) })}
						placeholder="bucket…"
						loading={props.isBucketsLoading}
						optionFilterProp="label"
						aria-label="Destination bucket"
					/>
				</FormField>

				<FormField label="Destination key" required>
					<Input
						value={props.values.dstKey}
						onChange={(e) => props.onValuesChange({ ...props.values, dstKey: e.target.value })}
						placeholder="path/to/object…"
						autoComplete="off"
					/>
				</FormField>

				<FormField label="Dry run (no changes)">
					<Switch
						checked={props.values.dryRun}
						onChange={(checked) => props.onValuesChange({ ...props.values, dryRun: checked })}
						aria-label="Dry run"
					/>
				</FormField>

				{isMove && !props.values.dryRun ? (
					<FormField label='Type "MOVE" to confirm' required>
						<Input
							value={props.values.confirm}
							onChange={(e) => props.onValuesChange({ ...props.values, confirm: e.target.value })}
							placeholder="MOVE…"
							autoComplete="off"
						/>
					</FormField>
				) : null}
			</form>
		</Modal>
	)
}
