import { Alert, Button, Descriptions, Divider, Input, Modal, Space, Spin, Typography } from 'antd'

import type { ObjectIndexSummaryResponse } from '../../api/types'
import { formatBytes } from '../../lib/transfer'

type ObjectsDeletePrefixConfirmModalProps = {
	open: boolean
	dryRun: boolean
	bucket: string
	prefix: string
	confirmText: string
	onConfirmTextChange: (value: string) => void
	hasProfile: boolean
	hasBucket: boolean
	isConfirming: boolean
	onConfirm: () => void | Promise<void>
	onCancel: () => void
	isSummaryFetching: boolean
	summary: ObjectIndexSummaryResponse | null
	summaryNotIndexed: boolean
	isSummaryError: boolean
	summaryErrorMessage: string
	onIndexPrefix: () => void
}

export function ObjectsDeletePrefixConfirmModal(props: ObjectsDeletePrefixConfirmModalProps) {
	const confirmDisabled =
		!props.hasProfile ||
		!props.hasBucket ||
		!props.prefix ||
		(!props.dryRun && props.confirmText !== 'DELETE')
	const indexDisabled = !props.hasProfile || !props.hasBucket || !props.prefix

	return (
		<Modal
			open={props.open}
			title={props.dryRun ? 'Preview delete folder' : 'Delete folder'}
			okText={props.dryRun ? 'Run preview' : 'Delete folder'}
			okType={props.dryRun ? 'primary' : 'danger'}
			okButtonProps={{
				danger: !props.dryRun,
				loading: props.isConfirming,
				disabled: confirmDisabled,
			}}
			onOk={props.onConfirm}
			onCancel={props.onCancel}
			destroyOnHidden
		>
			<Space orientation="vertical" size="small" style={{ width: '100%' }}>
				<Typography.Text>
					Bucket: <Typography.Text code>{props.bucket || '-'}</Typography.Text>
				</Typography.Text>
				<Typography.Text>
					Folder: <Typography.Text code>{props.prefix || '-'}</Typography.Text>
				</Typography.Text>

				<Alert
					type={props.dryRun ? 'info' : 'warning'}
					showIcon
					title={props.dryRun ? 'Dry run' : 'Danger zone'}
					description={
						props.dryRun
							? 'This runs a preview (no changes) and shows what would be deleted.'
							: 'This starts a background delete task and will permanently delete objects.'
					}
				/>

				{props.isSummaryFetching && !props.summary ? (
					<div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
						<Spin />
					</div>
				) : props.summaryNotIndexed ? (
					<Alert
						type="warning"
						showIcon
						title="Impact preview unavailable (index not found)"
						description="Run an index job to preview object count and size before deleting."
						action={
							<Button size="small" onClick={props.onIndexPrefix} disabled={indexDisabled}>
								Index prefix
							</Button>
						}
					/>
				) : props.isSummaryError ? (
					<Alert type="error" showIcon title="Failed to load impact preview" description={props.summaryErrorMessage} />
				) : props.summary ? (
					<>
						<Descriptions size="small" bordered column={1}>
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

				{props.dryRun ? null : (
					<>
						<Divider style={{ marginBlock: 8 }} />
						<Typography.Text type="secondary">Type DELETE to confirm</Typography.Text>
						<Input
							placeholder="DELETE…"
							value={props.confirmText}
							onChange={(e) => props.onConfirmTextChange(e.target.value)}
							autoComplete="off"
						/>
					</>
				)}
			</Space>
		</Modal>
	)
}
