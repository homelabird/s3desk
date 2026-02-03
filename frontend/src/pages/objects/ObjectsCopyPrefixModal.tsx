import type { FormInstance, SelectProps } from 'antd'
import { Alert, Button, Descriptions, Form, Input, Modal, Select, Spin, Switch, Typography } from 'antd'

import type { ObjectIndexSummaryResponse } from '../../api/types'
import { formatBytes } from '../../lib/transfer'

type CopyPrefixForm = {
	dstBucket: string
	dstPrefix: string
	include: string
	exclude: string
	dryRun: boolean
	confirm: string
}

type ObjectsCopyPrefixModalProps = {
	open: boolean
	mode: 'copy' | 'move'
	bucket: string
	srcPrefix: string
	sourceLabel: string
	form: FormInstance<CopyPrefixForm>
	bucketOptions: SelectProps['options']
	isBucketsLoading: boolean
	isSubmitting: boolean
	onCancel: () => void
	onFinish: (values: CopyPrefixForm) => void
	isSummaryFetching: boolean
	summary: ObjectIndexSummaryResponse | null
	summaryNotIndexed: boolean
	isSummaryError: boolean
	summaryErrorMessage: string
	onIndexPrefix: () => void
	normalizePrefix: (value: string) => string
}

export function ObjectsCopyPrefixModal(props: ObjectsCopyPrefixModalProps) {
	const isMove = props.mode === 'move'
	const indexDisabled = !props.bucket || !props.srcPrefix

	return (
		<Modal
			open={props.open}
			title={isMove ? 'Move folder…' : 'Copy folder…'}
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
					title="Move folder is destructive"
					description="This creates a move job (copy then delete source)."
					style={{ marginBottom: 12 }}
				/>
			) : (
				<Alert
					type="info"
					showIcon
					title="Copy this folder to another folder"
					description="This creates a copy job and may copy many objects."
					style={{ marginBottom: 12 }}
				/>
			)}

			{props.isSummaryFetching && !props.summary ? (
				<div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
					<Spin />
				</div>
			) : props.summaryNotIndexed ? (
				<Alert
					type="warning"
					showIcon
					title="Impact preview unavailable (index not found)"
					description="Run an index job to preview object count and size before copying/moving."
					action={
						<Button size="small" onClick={props.onIndexPrefix} disabled={indexDisabled}>
							Index prefix
						</Button>
					}
					style={{ marginBottom: 12 }}
				/>
			) : props.isSummaryError ? (
				<Alert
					type="error"
					showIcon
					title="Failed to load impact preview"
					description={props.summaryErrorMessage}
					style={{ marginBottom: 12 }}
				/>
			) : props.summary ? (
				<>
					<Descriptions size="small" bordered column={1} style={{ marginBottom: 12 }}>
						<Descriptions.Item label="Objects">{props.summary.objectCount}</Descriptions.Item>
						<Descriptions.Item label="Total size">{formatBytes(props.summary.totalBytes)}</Descriptions.Item>
						<Descriptions.Item label="Indexed at">
							{props.summary.indexedAt ? (
								<Typography.Text code>{props.summary.indexedAt}</Typography.Text>
							) : (
								<Typography.Text type="secondary">-</Typography.Text>
							)}
						</Descriptions.Item>
					</Descriptions>
					{props.summary.sampleKeys?.length ? (
						<>
							<Typography.Text type="secondary">Sample keys</Typography.Text>
							<Input.TextArea value={props.summary.sampleKeys.join('\n')} readOnly autoSize={{ minRows: 3, maxRows: 6 }} />
						</>
					) : null}
				</>
			) : null}

			<Form
				form={props.form}
				layout="vertical"
				initialValues={{ dstBucket: props.bucket, dstPrefix: '', include: '', exclude: '', dryRun: false, confirm: '' }}
				onFinish={props.onFinish}
			>
				<Form.Item label="Source">
					<Typography.Text code>{props.sourceLabel}</Typography.Text>
				</Form.Item>

				<Form.Item name="dstBucket" label="Destination bucket" rules={[{ required: true }]}>
					<Select
						showSearch
						options={props.bucketOptions}
						placeholder="bucket…"
						loading={props.isBucketsLoading}
						optionFilterProp="label"
						aria-label="Destination bucket"
					/>
				</Form.Item>

				<Form.Item
					name="dstPrefix"
					label="Destination folder"
					rules={[
						{ required: true },
						{
							validator: async (_, v: string) => {
								const dstPrefix = props.normalizePrefix(typeof v === 'string' ? v : '')
								if (!dstPrefix) throw new Error('destination prefix is required')
								if (dstPrefix.includes('*')) throw new Error('wildcards are not allowed')

								const dstBucket = (props.form.getFieldValue('dstBucket') ?? '') as string
								if (dstBucket === props.bucket) {
									if (dstPrefix === props.srcPrefix) throw new Error('destination must be different')
									if (dstPrefix.startsWith(props.srcPrefix)) throw new Error('destination must not be under source')
								}
							},
						},
					]}
				>
					<Input placeholder="target-folder/…" />
				</Form.Item>

				{isMove ? (
					<Form.Item
						name="confirm"
						label='Type "MOVE" to confirm'
						rules={[
							{ required: true },
							{
								validator: async (_, v: string) => {
									if (v === 'MOVE') return
									throw new Error('Type MOVE to proceed')
								},
							},
						]}
					>
						<Input placeholder="MOVE…" />
					</Form.Item>
				) : null}

				<Form.Item name="dryRun" label="Dry run (no changes)" valuePropName="checked">
					<Switch aria-label="Dry run" />
				</Form.Item>

				<Form.Item name="include" label="Include patterns (one per line)">
					<Input.TextArea rows={4} placeholder="*.log…" />
				</Form.Item>
				<Form.Item name="exclude" label="Exclude patterns (one per line)">
					<Input.TextArea rows={4} placeholder="tmp_*…" />
				</Form.Item>
			</Form>
		</Modal>
	)
}
