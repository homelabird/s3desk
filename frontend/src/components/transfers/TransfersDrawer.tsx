import { Badge, Button, Drawer, Empty, Space, Tag, Typography } from 'antd'
import { CloudUploadOutlined, DownloadOutlined } from '@ant-design/icons'

import { AppTabs } from '../AppTabs'
import type { DownloadTask, TransfersTab, UploadTask } from './transferTypes'
import { TransferDownloadRow } from './TransferDownloadRow'
import { TransferUploadRow } from './TransferUploadRow'

type TransfersDrawerProps = {
	open: boolean
	onClose: () => void
	tab: TransfersTab
	onTabChange: (tab: TransfersTab) => void
	activeDownloadCount: number
	activeUploadCount: number
	activeTransferCount: number
	downloadTasks: DownloadTask[]
	uploadTasks: UploadTask[]
	downloadSummaryText: string
	uploadSummaryText: string
	hasCompletedDownloads: boolean
	hasCompletedUploads: boolean
	onClearCompletedDownloads: () => void
	onClearCompletedUploads: () => void
	onClearAll: () => void
	onCancelDownload: (taskId: string) => void
	onRetryDownload: (taskId: string) => void
	onRemoveDownload: (taskId: string) => void
	onCancelUpload: (taskId: string) => void
	onRetryUpload: (taskId: string) => void
	onRemoveUpload: (taskId: string) => void
	onOpenJobs: () => void
}

export function TransfersDrawer(props: TransfersDrawerProps) {
	return (
		<Drawer
			open={props.open}
			onClose={props.onClose}
			title={
				<Space size="small">
					<Typography.Text strong>Transfers</Typography.Text>
					{props.activeTransferCount > 0 ? <Tag color="processing">{props.activeTransferCount} active</Tag> : null}
				</Space>
			}
			placement="bottom"
			height={440}
			extra={
				<Space>
					<Button
						size="small"
						onClick={props.tab === 'downloads' ? props.onClearCompletedDownloads : props.onClearCompletedUploads}
						disabled={props.tab === 'downloads' ? !props.hasCompletedDownloads : !props.hasCompletedUploads}
					>
						Clear done
					</Button>
					<Button
						size="small"
						danger
						onClick={props.onClearAll}
						disabled={props.downloadTasks.length + props.uploadTasks.length === 0}
					>
						Clear all
					</Button>
				</Space>
			}
		>
			<AppTabs
				size="small"
				activeKey={props.tab}
				onChange={(key) => props.onTabChange(key as TransfersTab)}
				items={[
					{
						key: 'downloads',
						label: (
							<Space size={8}>
								<Badge count={props.activeDownloadCount} size="small" showZero={false}>
									<DownloadOutlined />
								</Badge>
								Downloads
							</Space>
						),
						children: (
							<div style={{ paddingTop: 8 }}>
								{props.downloadTasks.length === 0 ? (
									<Empty description="No downloads yet" />
								) : (
									<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
										{props.downloadSummaryText ? (
											<Typography.Text type="secondary">{props.downloadSummaryText}</Typography.Text>
										) : null}
										{props.downloadTasks.map((t) => (
											<TransferDownloadRow
												key={t.id}
												task={t}
												onCancel={props.onCancelDownload}
												onRetry={props.onRetryDownload}
												onRemove={props.onRemoveDownload}
												onOpenJobs={props.onOpenJobs}
											/>
										))}
									</div>
								)}
							</div>
						),
					},
					{
						key: 'uploads',
						label: (
							<Space size={8}>
								<Badge count={props.activeUploadCount} size="small" showZero={false}>
									<CloudUploadOutlined />
								</Badge>
								Uploads
							</Space>
						),
						children: (
							<div style={{ paddingTop: 8 }}>
								{props.uploadTasks.length === 0 ? (
									<Empty
										description={
											<Space orientation="vertical" size={4} align="center">
												<span>No uploads yet</span>
												<Typography.Text type="secondary">
													Tip: drag & drop files into the object list to queue uploads.
												</Typography.Text>
											</Space>
										}
									/>
								) : (
									<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
										{props.uploadSummaryText ? (
											<Typography.Text type="secondary">{props.uploadSummaryText}</Typography.Text>
										) : null}
										{props.uploadTasks.map((t) => (
											<TransferUploadRow
												key={t.id}
												task={t}
												onOpenJobs={props.onOpenJobs}
												onCancel={props.onCancelUpload}
												onRetry={props.onRetryUpload}
												onRemove={props.onRemoveUpload}
											/>
										))}
									</div>
								)}
							</div>
						),
					},
				]}
			/>
		</Drawer>
	)
}
