import type { FormInstance, SelectProps } from 'antd'
import { Alert, Form, Input, Modal, Select, Switch, Typography } from 'antd'

type CopyMoveForm = {
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
	form: FormInstance<CopyMoveForm>
	bucketOptions: SelectProps['options']
	isBucketsLoading: boolean
	isSubmitting: boolean
	onCancel: () => void
	onFinish: (values: CopyMoveForm) => void
}

export function ObjectsCopyMoveModal(props: ObjectsCopyMoveModalProps) {
	const isMove = props.mode === 'move'

	return (
		<Modal
			open={props.open}
			title={isMove ? 'Move/Rename object…' : 'Copy object…'}
			okText={isMove ? 'Start move' : 'Start copy'}
			okButtonProps={{ loading: props.isSubmitting, danger: isMove }}
			onOk={() => props.form.submit()}
			onCancel={props.onCancel}
			destroyOnClose
		>
			{isMove ? (
				<Alert
					type="warning"
					showIcon
					message="Move/Rename is destructive"
					description="This uses transfer move (copy then delete source)."
					style={{ marginBottom: 12 }}
				/>
			) : (
				<Alert
					type="info"
					showIcon
					message="Copy within S3"
					description="This uses transfer copy (server-side copy)."
					style={{ marginBottom: 12 }}
				/>
			)}

			<Form
				form={props.form}
				layout="vertical"
				initialValues={{ dstBucket: props.bucket, dstKey: props.srcKey ?? '', dryRun: false, confirm: '' }}
				onFinish={props.onFinish}
			>
				<Form.Item label="Source">
					<Typography.Text code>{props.srcKey ? `s3://${props.bucket}/${props.srcKey}` : '-'}</Typography.Text>
				</Form.Item>

				<Form.Item name="dstBucket" label="Destination bucket" rules={[{ required: true }]}>
					<Select
						showSearch
						options={props.bucketOptions}
						placeholder="bucket"
						loading={props.isBucketsLoading}
						optionFilterProp="label"
						aria-label="Destination bucket"
					/>
				</Form.Item>

				<Form.Item
					name="dstKey"
					label="Destination key"
					rules={[
						{ required: true },
						{
							validator: async (_, v: string) => {
								const dstKey = typeof v === 'string' ? v.trim() : ''
								if (!dstKey) throw new Error('destination key is required')
								if (dstKey.includes('*')) throw new Error('wildcards are not allowed')

								const dstBucket = (props.form.getFieldValue('dstBucket') ?? '') as string
								const srcBucket = props.bucket
								const srcKey = props.srcKey ?? ''
								if (dstBucket === srcBucket && dstKey === srcKey) throw new Error('destination must be different')
							},
						},
					]}
				>
					<Input placeholder="path/to/object" />
				</Form.Item>

				<Form.Item name="dryRun" label="Dry run (no changes)" valuePropName="checked">
					<Switch aria-label="Dry run" />
				</Form.Item>

				{isMove ? (
					<Form.Item shouldUpdate={(prev, next) => prev.dryRun !== next.dryRun} noStyle>
						{({ getFieldValue }) =>
							getFieldValue('dryRun') ? null : (
								<Form.Item
									name="confirm"
									label='Type "MOVE" to confirm'
									rules={[
										{
											validator: async (_, v: string) => {
												if (v === 'MOVE') return
												throw new Error('Type MOVE to proceed')
											},
										},
									]}
								>
									<Input placeholder="MOVE" autoComplete="off" />
								</Form.Item>
							)
						}
					</Form.Item>
				) : null}
			</Form>
		</Modal>
	)
}
