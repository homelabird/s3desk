import { Alert, Button, Descriptions, Input, Spin, Typography } from 'antd'

import type { ObjectIndexSummaryResponse } from '../../api/types'
import { DialogModal } from '../../components/DialogModal'
import { FormField } from '../../components/FormField'
import { DatalistInput } from '../../components/DatalistInput'
import { ToggleSwitch } from '../../components/ToggleSwitch'
import { formatBytes } from '../../lib/transfer'
import styles from './ObjectsDialogs.module.css'

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
	const destinationBucketInputId = 'objects-copy-prefix-destination-bucket'
	const destinationFolderInputId = 'objects-copy-prefix-destination-folder'
	const moveConfirmInputId = 'objects-copy-prefix-confirm'
	const includePatternsInputId = 'objects-copy-prefix-include-patterns'
	const excludePatternsInputId = 'objects-copy-prefix-exclude-patterns'
	const submit = () => {
		if (props.isSubmitting) return
		props.onFinish(props.values)
	}

	return (
		<DialogModal
			open={props.open}
			title={isMove ? 'Move folder…' : 'Copy folder…'}
			onClose={props.onCancel}
			closeDisabled={props.isSubmitting}
			initialFocusSelector={`#${destinationBucketInputId}`}
			width={760}
			footer={
				<>
					<Button onClick={props.onCancel} disabled={props.isSubmitting}>Cancel</Button>
					<Button type="primary" danger={isMove} loading={props.isSubmitting} onClick={submit}>
						{isMove ? 'Start move' : 'Start copy'}
					</Button>
				</>
			}
		>
			<div className={styles.alertStack}>
				{isMove ? (
					<Alert
						type="warning"
						showIcon
						title="Move folder is destructive"
						description="This creates a move job (copy then delete source)."
					/>
				) : (
					<Alert
						type="info"
						showIcon
						title="Copy this folder to another folder"
						description="This creates a copy job and may copy many objects."
					/>
				)}
			</div>

			{props.isSummaryFetching && !props.summary ? (
				<div className={styles.loadingState}>
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
					className={styles.alertBlock}
				/>
			) : props.isSummaryError ? (
				<Alert
					type="error"
					showIcon
					title="Failed to load impact preview"
					description={props.summaryErrorMessage}
					className={styles.alertBlock}
				/>
			) : props.summary ? (
				<>
					<Descriptions size="small" bordered column={1} className={styles.summaryDescriptions}>
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
						<div className={styles.sampleKeysBlock}>
							<Typography.Text type="secondary">Sample keys</Typography.Text>
							<Input.TextArea
								value={props.summary.sampleKeys.join('\n')}
								readOnly
								aria-label="Sample keys"
								autoSize={{ minRows: 3, maxRows: 6 }}
							/>
						</div>
					) : null}
				</>
			) : null}

			<form
				className={styles.form}
				onSubmit={(e) => {
					e.preventDefault()
					submit()
				}}
			>
				<FormField label="Source">
					<Typography.Text code className={styles.sourceCode}>{props.sourceLabel}</Typography.Text>
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

				<FormField
					label="Destination folder"
					htmlFor={destinationFolderInputId}
					required
					extra={<span className={styles.summaryNote}>Normalized as: <Typography.Text code>{props.normalizePrefix(props.values.dstPrefix)}</Typography.Text></span>}
				>
					<Input
						id={destinationFolderInputId}
						value={props.values.dstPrefix}
						onChange={(e) => props.onValuesChange({ ...props.values, dstPrefix: e.target.value })}
						placeholder="target-folder/…"
						autoComplete="off"
						disabled={props.isSubmitting}
					/>
				</FormField>

				{isMove ? (
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

				<FormField label="Dry run (no changes)">
					<ToggleSwitch
						checked={props.values.dryRun}
						onChange={(checked) => props.onValuesChange({ ...props.values, dryRun: checked })}
						ariaLabel="Dry run"
						disabled={props.isSubmitting}
					/>
				</FormField>

				<FormField label="Include patterns (one per line)" htmlFor={includePatternsInputId}>
					<Input.TextArea
						id={includePatternsInputId}
						value={props.values.include}
						onChange={(e) => props.onValuesChange({ ...props.values, include: e.target.value })}
						rows={4}
						placeholder="*.log…"
						disabled={props.isSubmitting}
					/>
				</FormField>
				<FormField label="Exclude patterns (one per line)" htmlFor={excludePatternsInputId}>
					<Input.TextArea
						id={excludePatternsInputId}
						value={props.values.exclude}
						onChange={(e) => props.onValuesChange({ ...props.values, exclude: e.target.value })}
						rows={4}
						placeholder="tmp_*…"
						disabled={props.isSubmitting}
					/>
				</FormField>
			</form>
		</DialogModal>
	)
}
