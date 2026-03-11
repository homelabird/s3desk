import {
	DeleteOutlined,
	DownloadOutlined,
	FileTextOutlined,
	InfoCircleOutlined,
	MoreOutlined,
	RedoOutlined,
	StopOutlined,
} from '@ant-design/icons'
import { Button, Space, Typography, type MenuProps } from 'antd'

import type { Job } from '../../api/types'
import { MenuPopover } from '../../components/MenuPopover'
import { confirmDangerAction } from '../../lib/confirmDangerAction'

type QueueDownloadJobArtifactArgs = {
	profileId: string
	jobId: string
	label: string
	filenameHint: string
	waitForJob: boolean
}

type Props = {
	job: Job
	isOffline: boolean
	isLogsLoading: boolean
	activeLogJobId: string | null
	cancelingJobId: string | null
	retryingJobId: string | null
	deletingJobId: string | null
	cancelPending: boolean
	retryPending: boolean
	deletePending: boolean
	profileId: string | null
	jobSummary: string | null
	onOpenDetails: (jobId: string) => void
	onOpenLogs: (jobId: string) => void
	onRequestCancelJob: (jobId: string) => void
	onRequestRetryJob: (jobId: string) => void
	onRequestDeleteJob: (jobId: string) => Promise<void>
	onQueueDownloadJobArtifact: (args: QueueDownloadJobArtifactArgs) => void
}

export function JobsRowActions({
	job,
	isOffline,
	isLogsLoading,
	activeLogJobId,
	cancelingJobId,
	retryingJobId,
	deletingJobId,
	cancelPending,
	retryPending,
	deletePending,
	profileId,
	jobSummary,
	onOpenDetails,
	onOpenLogs,
	onRequestCancelJob,
	onRequestRetryJob,
	onRequestDeleteJob,
	onQueueDownloadJobArtifact,
}: Props) {
	const isZipJob = job.type === 's3_zip_prefix' || job.type === 's3_zip_objects'
	const canDownloadArtifact = isZipJob && job.status !== 'failed' && job.status !== 'canceled'
	const isCancelDisabled =
		isOffline ||
		(job.status !== 'queued' && job.status !== 'running') ||
		(cancelPending && cancelingJobId === job.id)
	const isRetryDisabled =
		isOffline ||
		(job.status !== 'failed' && job.status !== 'canceled') ||
		(retryPending && retryingJobId === job.id)
	const isDeleteDisabled =
		isOffline ||
		job.status === 'queued' ||
		job.status === 'running' ||
		(deletePending && deletingJobId === job.id)

	const label = jobSummary ? `Artifact: ${jobSummary}` : `Job artifact: ${job.id}`
	const menuItems: MenuProps['items'] = []

	if (isZipJob) {
		menuItems.push({
			key: 'download',
			icon: <DownloadOutlined />,
			label: 'Download ZIP',
			disabled: isOffline || !canDownloadArtifact || !profileId,
			onClick: () => {
				if (!profileId) return
				onQueueDownloadJobArtifact({
					profileId,
					jobId: job.id,
					label,
					filenameHint: `job-${job.id}.zip`,
					waitForJob: job.status !== 'succeeded',
				})
			},
		})
	}

	menuItems.push({
		key: 'retry',
		icon: <RedoOutlined />,
		label: 'Retry',
		disabled: isRetryDisabled,
		onClick: () => onRequestRetryJob(job.id),
	})
	menuItems.push({
		key: 'cancel',
		icon: <StopOutlined />,
		label: 'Cancel',
		danger: true,
		disabled: isCancelDisabled,
		onClick: () => onRequestCancelJob(job.id),
	})
	menuItems.push({ type: 'divider' })
	menuItems.push({
		key: 'delete',
		icon: <DeleteOutlined />,
		label: 'Delete record',
		danger: true,
		disabled: isDeleteDisabled,
		onClick: () => {
			confirmDangerAction({
				title: 'Delete job record?',
				description: (
					<Space orientation="vertical" style={{ width: '100%' }}>
						<Typography.Text>
							Job ID: <Typography.Text code>{job.id}</Typography.Text>
						</Typography.Text>
						<Typography.Text type="secondary">This removes the job record and deletes its log file.</Typography.Text>
					</Space>
				),
				onConfirm: async () => {
					await onRequestDeleteJob(job.id)
				},
			})
		},
	})

	return (
		<Space size={4} wrap>
			<Button type="text" size="small" icon={<InfoCircleOutlined />} aria-label="Details" disabled={isOffline} onClick={() => onOpenDetails(job.id)}>
				Details
			</Button>
			<Button
				type="text"
				size="small"
				icon={<FileTextOutlined />}
				aria-label="Logs"
				disabled={isOffline || (isLogsLoading && activeLogJobId === job.id)}
				onClick={() => onOpenLogs(job.id)}
			>
				Logs
			</Button>
			<MenuPopover menu={{ items: menuItems }} align="end">
				{({ toggle }) => (
					<Button type="text" size="small" icon={<MoreOutlined />} aria-label="Open actions menu" onClick={toggle}>
						Actions
					</Button>
				)}
			</MenuPopover>
		</Space>
	)
}
