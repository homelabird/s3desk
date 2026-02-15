import { ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Collapse, Descriptions, Drawer, Space, Spin, Tag, Tooltip, Typography } from 'antd'

import type { Job } from '../../api/types'
import { confirmDangerAction } from '../../lib/confirmDangerAction'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { formatDateTime } from '../../lib/format'
import { getJobTypeInfo } from '../../lib/jobTypes'
import { formatBytes } from '../../lib/transfer'
import { formatProgress } from './jobPresentation'
import { formatS3Destination, statusColor } from './jobUtils'
import { JobsUploadDetailsTable } from './JobsUploadDetailsTable'
import type { JobsUploadDetails, JobsUploadTableRow } from './jobsUploadTypes'

type Props = {
	open: boolean
	onClose: () => void
	width: number | string
	isOffline: boolean
	detailsJobId: string | null
	job: Job | undefined
	isFetching: boolean
	isError: boolean
	error: unknown
	onRefresh: () => void
	onDeleteJob: (jobId: string) => Promise<void>
	deleteLoading: boolean
	onOpenLogs: (jobId: string) => void
	uploadDetails: JobsUploadDetails | null
	uploadRootLabel: string | null
	uploadTablePageItems: JobsUploadTableRow[]
	uploadTableDataLength: number
	uploadTablePageSize: number
	uploadTablePageSafe: number
	uploadTableTotalPages: number
	onUploadTablePrevPage: () => void
	onUploadTableNextPage: () => void
	uploadHashesLoading: boolean
	uploadHashFailures: number
	borderColor: string
	backgroundColor: string
	borderRadius: number
}

export function JobsDetailsDrawer(props: Props) {
	return (
		<Drawer
			open={props.open}
			onClose={props.onClose}
			title="Job Details"
			width={props.width}
			destroyOnHidden
			extra={
				<Space>
					<Button icon={<ReloadOutlined />} disabled={!props.detailsJobId || props.isOffline} loading={props.isFetching} onClick={props.onRefresh}>
						Refresh
					</Button>
					<Button
						danger
						disabled={
							props.isOffline ||
							!props.detailsJobId ||
							props.job?.status === 'queued' ||
							props.job?.status === 'running'
						}
						loading={props.deleteLoading}
						onClick={() => {
							if (!props.detailsJobId) return
							confirmDangerAction({
								title: 'Delete job record?',
								description: (
									<Space direction="vertical" style={{ width: '100%' }}>
										<Typography.Text>
											Job ID: <Typography.Text code>{props.detailsJobId}</Typography.Text>
										</Typography.Text>
										<Typography.Text type="secondary">This removes the job record and deletes its log file.</Typography.Text>
									</Space>
								),
								onConfirm: async () => {
									await props.onDeleteJob(props.detailsJobId!)
								},
							})
						}}
					>
						Delete
					</Button>
					<Button
						disabled={!props.detailsJobId || props.isOffline}
						onClick={() => {
							if (!props.detailsJobId) return
							props.onOpenLogs(props.detailsJobId)
						}}
					>
						Open logs
					</Button>
				</Space>
			}
		>
			{props.isError ? <Alert type="error" showIcon title="Failed to load job" description={formatErr(props.error)} /> : null}

			{props.detailsJobId ? (
				props.job ? (
					<>
						<Descriptions size="small" bordered column={1}>
							<Descriptions.Item label="ID">
								<Typography.Text code>{props.job.id}</Typography.Text>
							</Descriptions.Item>
							<Descriptions.Item label="Type">
								{(() => {
									const info = getJobTypeInfo(props.job.type)
									if (!info) return <Typography.Text code>{props.job.type}</Typography.Text>
									return (
										<Space direction="vertical" size={0} style={{ width: '100%' }}>
											<Typography.Text strong>{info.label}</Typography.Text>
											<Typography.Text type="secondary">{info.description}</Typography.Text>
											<Typography.Text code>{props.job.type}</Typography.Text>
										</Space>
									)
								})()}
							</Descriptions.Item>
							<Descriptions.Item label="Status">
								<Tag color={statusColor(props.job.status)}>{props.job.status}</Tag>
							</Descriptions.Item>
							<Descriptions.Item label="Progress">
								{props.job.progress?.objectsDone || props.job.progress?.bytesDone ? (
									<Typography.Text type="secondary">{formatProgress(props.job.progress)}</Typography.Text>
								) : (
									<Typography.Text type="secondary">-</Typography.Text>
								)}
							</Descriptions.Item>
							<Descriptions.Item label="Created">
								<Tooltip title={props.job.createdAt}>
									<Typography.Text code>{formatDateTime(props.job.createdAt)}</Typography.Text>
								</Tooltip>
							</Descriptions.Item>
							<Descriptions.Item label="Started">
								{props.job.startedAt ? (
									<Tooltip title={props.job.startedAt}>
										<Typography.Text code>{formatDateTime(props.job.startedAt)}</Typography.Text>
									</Tooltip>
								) : (
									<Typography.Text type="secondary">-</Typography.Text>
								)}
							</Descriptions.Item>
							<Descriptions.Item label="Finished">
								{props.job.finishedAt ? (
									<Tooltip title={props.job.finishedAt}>
										<Typography.Text code>{formatDateTime(props.job.finishedAt)}</Typography.Text>
									</Tooltip>
								) : (
									<Typography.Text type="secondary">-</Typography.Text>
								)}
							</Descriptions.Item>
							<Descriptions.Item label="Error code">
								{props.job.errorCode ? <Typography.Text code>{props.job.errorCode}</Typography.Text> : <Typography.Text type="secondary">-</Typography.Text>}
							</Descriptions.Item>
							<Descriptions.Item label="Error">
								{props.job.error ? <Typography.Text type="danger">{props.job.error}</Typography.Text> : <Typography.Text type="secondary">-</Typography.Text>}
							</Descriptions.Item>
						</Descriptions>

						<Collapse
							size="small"
							style={{ marginTop: 16 }}
							items={[
								...(props.uploadDetails
									? [
											{
												key: 'upload',
												label: 'Upload details',
												children: (
													<Space direction="vertical" size="middle" style={{ width: '100%' }}>
														<Descriptions size="small" bordered column={1}>
															<Descriptions.Item label="Destination">
																{props.uploadDetails.bucket ? (
																	<Typography.Text code>{formatS3Destination(props.uploadDetails.bucket, props.uploadDetails.prefix ?? '')}</Typography.Text>
																) : (
																	<Typography.Text type="secondary">-</Typography.Text>
																)}
															</Descriptions.Item>
															<Descriptions.Item label="Label">
																{props.uploadDetails.label ? <Typography.Text>{props.uploadDetails.label}</Typography.Text> : <Typography.Text type="secondary">-</Typography.Text>}
															</Descriptions.Item>
															<Descriptions.Item label="Root">
																{props.uploadRootLabel ? <Typography.Text>{props.uploadRootLabel}</Typography.Text> : <Typography.Text type="secondary">-</Typography.Text>}
															</Descriptions.Item>
															<Descriptions.Item label="Total files">
																{props.uploadDetails.totalFiles != null ? <Typography.Text>{props.uploadDetails.totalFiles}</Typography.Text> : <Typography.Text type="secondary">-</Typography.Text>}
															</Descriptions.Item>
															<Descriptions.Item label="Total bytes">
																{props.uploadDetails.totalBytes != null ? (
																	<Typography.Text>{formatBytes(props.uploadDetails.totalBytes)}</Typography.Text>
																) : (
																	<Typography.Text type="secondary">-</Typography.Text>
																)}
															</Descriptions.Item>
														</Descriptions>

														<JobsUploadDetailsTable
															uploadItemsCount={props.uploadDetails.items.length}
															uploadItemsTruncated={props.uploadDetails.itemsTruncated}
															uploadTotalFiles={props.uploadDetails.totalFiles}
															uploadTablePageItems={props.uploadTablePageItems}
															uploadTableDataLength={props.uploadTableDataLength}
															uploadTablePageSize={props.uploadTablePageSize}
															uploadTablePageSafe={props.uploadTablePageSafe}
															uploadTableTotalPages={props.uploadTableTotalPages}
															onUploadTablePrevPage={props.onUploadTablePrevPage}
															onUploadTableNextPage={props.onUploadTableNextPage}
															jobStatus={props.job.status}
															uploadHashesLoading={props.uploadHashesLoading}
															uploadHashFailures={props.uploadHashFailures}
															borderColor={props.borderColor}
															backgroundColor={props.backgroundColor}
															borderRadius={props.borderRadius}
														/>
													</Space>
												),
											},
										]
									: []),
								{
									key: 'payload',
									label: 'Payload (JSON)',
									children: (
										<pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
											{JSON.stringify(props.job.payload, null, 2)}
										</pre>
									),
								},
							]}
						/>
					</>
				) : (
					<div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
						<Spin />
					</div>
				)
			) : (
				<Typography.Text type="secondary">Select a job</Typography.Text>
			)}
		</Drawer>
	)
}
