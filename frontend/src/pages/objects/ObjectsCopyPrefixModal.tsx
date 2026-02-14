import { Alert, Button, Descriptions, Input, Modal, Spin, Switch, Typography } from 'antd'

import type { ObjectIndexSummaryResponse } from '../../api/types'
import { FormField } from '../../components/FormField'
import { DatalistInput } from '../../components/DatalistInput'
import { formatBytes } from '../../lib/transfer'

type CopyPrefixValues = {
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
	values: CopyPrefixValues
	onValuesChange: (values: CopyPrefixValues) => void
	bucketOptions: Array<{ label: string; value: string }>
	isBucketsLoading: boolean
	isSubmitting: boolean
	onCancel: () => void
	onFinish: (values: CopyPrefixValues) => void
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
			onOk={() => props.onFinish(props.values)}
			onCancel={props.onCancel}
			destroyOnHidden
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

			<form
				onSubmit={(e) => {
					e.preventDefault()
					props.onFinish(props.values)
				}}
			>
				<FormField label="Source">
					<Typography.Text code>{props.sourceLabel}</Typography.Text>
				</FormField>

				<FormField label="Destination bucket" required>
					<DatalistInput
											value={props.values.dstBucket}
											onChange={(value) => props.onValuesChange({ ...props.values, dstBucket: value })}
											placeholder="bucket…"
											ariaLabel="Destination bucket"
											allowClear
											disabled={props.isBucketsLoading && props.bucketOptions.length === 0}
											options={props.bucketOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
										/>
				</FormField>

				<FormField label="Destination folder" required>
					<Input
						value={props.values.dstPrefix}
						onChange={(e) => props.onValuesChange({ ...props.values, dstPrefix: e.target.value })}
						placeholder="target-folder/…"
						autoComplete="off"
					/>
					<div style={{ marginTop: 6, fontSize: 12, opacity: 0.75, lineHeight: 1.35 }}>
						Normalized as: <Typography.Text code>{props.normalizePrefix(props.values.dstPrefix)}</Typography.Text>
					</div>
				</FormField>

				{isMove ? (
					<FormField label='Type "MOVE" to confirm' required>
						<Input
							value={props.values.confirm}
							onChange={(e) => props.onValuesChange({ ...props.values, confirm: e.target.value })}
							placeholder="MOVE…"
							autoComplete="off"
						/>
					</FormField>
				) : null}

				<FormField label="Dry run (no changes)">
					<Switch
						checked={props.values.dryRun}
						onChange={(checked) => props.onValuesChange({ ...props.values, dryRun: checked })}
						aria-label="Dry run"
					/>
				</FormField>

				<FormField label="Include patterns (one per line)">
					<Input.TextArea
						value={props.values.include}
						onChange={(e) => props.onValuesChange({ ...props.values, include: e.target.value })}
						rows={4}
						placeholder="*.log…"
					/>
				</FormField>
				<FormField label="Exclude patterns (one per line)">
					<Input.TextArea
						value={props.values.exclude}
						onChange={(e) => props.onValuesChange({ ...props.values, exclude: e.target.value })}
						rows={4}
						placeholder="tmp_*…"
					/>
				</FormField>
			</form>
		</Modal>
	)
}
