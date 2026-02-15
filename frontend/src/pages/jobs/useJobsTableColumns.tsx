import {
	DeleteOutlined,
	DownloadOutlined,
	FileTextOutlined,
	InfoCircleOutlined,
	MoreOutlined,
	RedoOutlined,
	StopOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Space, Tag, Tooltip, Typography, type MenuProps } from 'antd'
import { useCallback, useMemo, type ReactNode } from 'react'

import type { Job, JobStatus } from '../../api/types'
import { confirmDangerAction } from '../../lib/confirmDangerAction'
import { formatDateTime, toTimestamp } from '../../lib/format'
import { getJobTypeInfo } from '../../lib/jobTypes'
import { formatBytes } from '../../lib/transfer'
import { compareNumber, compareText, getProgressSortValue } from './jobPresentation'
import { statusColor } from './jobUtils'
import type { JobsVirtualTableColumn } from './JobsVirtualTable'
import type { ColumnKey } from './useJobsColumnsVisibility'

type QueueDownloadJobArtifactArgs = {
	profileId: string
	jobId: string
	label: string
	filenameHint: string
	waitForJob: boolean
}

type UseJobsTableColumnsArgs = {
	mergedColumnVisibility: Record<ColumnKey, boolean>
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
	getJobSummary: (job: Job) => string | null
	openDetailsForJob: (jobId: string) => void
	openLogsForJob: (jobId: string) => void
	requestCancelJob: (jobId: string) => void
	requestRetryJob: (jobId: string) => void
	requestDeleteJob: (jobId: string) => Promise<void>
	queueDownloadJobArtifact: (args: QueueDownloadJobArtifactArgs) => void
}

export function useJobsTableColumns({
	mergedColumnVisibility,
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
	getJobSummary,
	openDetailsForJob,
	openLogsForJob,
	requestCancelJob,
	requestRetryJob,
	requestDeleteJob,
	queueDownloadJobArtifact,
}: UseJobsTableColumnsArgs): JobsVirtualTableColumn<Job>[] {
	const clampTextStyle = useMemo(
		() =>
			({
				display: '-webkit-box',
				WebkitBoxOrient: 'vertical',
				WebkitLineClamp: 2,
				overflow: 'hidden',
				whiteSpace: 'normal',
				wordBreak: 'break-word',
			}) as const,
		[],
	)

	const renderClampedText = useCallback(
		(
			value: string | null | undefined,
			tone?: 'secondary' | 'danger',
			options?: { code?: boolean; tooltip?: ReactNode; forceTooltip?: boolean },
		) => {
			if (!value) return <Typography.Text type="secondary">-</Typography.Text>
			const content = (
				<Typography.Text type={tone} style={clampTextStyle} code={options?.code}>
					{value}
				</Typography.Text>
			)
			const showTooltip = (options?.forceTooltip ?? false) || value.length > 32 || value.includes('\n')
			if (!showTooltip) return content
			return <Tooltip title={options?.tooltip ?? value}>{content}</Tooltip>
		},
		[clampTextStyle],
	)

	return useMemo(() => {
		const columnDefs: JobsVirtualTableColumn<Job>[] = [
			{
				key: 'id',
				title: 'ID',
				dataIndex: 'id',
				width: 220,
				render: (value: unknown) => renderClampedText(typeof value === 'string' ? value : null, undefined, { code: true }),
				sorter: (a: Job, b: Job) => compareText(a.id, b.id),
			},
			{
				key: 'type',
				title: 'Type',
				dataIndex: 'type',
				width: 240,
				render: (value: unknown) => {
					const typeValue = typeof value === 'string' ? value : ''
					const info = getJobTypeInfo(typeValue)
					if (!info) return renderClampedText(typeValue)
					const tooltip = (
						<Space direction="vertical" size={4} style={{ maxWidth: 420 }}>
							<Typography.Text strong>{info.label}</Typography.Text>
							<Typography.Text type="secondary">{info.description}</Typography.Text>
							<Typography.Text code>{typeValue}</Typography.Text>
						</Space>
					)
					return renderClampedText(info.label, undefined, { tooltip, forceTooltip: true })
				},
				sorter: (a: Job, b: Job) =>
					compareText(getJobTypeInfo(a.type)?.label ?? a.type, getJobTypeInfo(b.type)?.label ?? b.type),
			},
			{
				key: 'summary',
				title: 'Summary',
				width: 420,
				render: (_: unknown, row: Job) => renderClampedText(getJobSummary(row), 'secondary'),
				sorter: (a: Job, b: Job) => compareText(getJobSummary(a), getJobSummary(b)),
			},
			{
				key: 'status',
				title: 'Status',
				dataIndex: 'status',
				width: 140,
				render: (value: unknown) => {
					const status = typeof value === 'string' ? (value as JobStatus) : 'queued'
					return <Tag color={statusColor(status)}>{status}</Tag>
				},
				sorter: (a: Job, b: Job) => compareText(a.status, b.status),
			},
			{
				key: 'progress',
				title: 'Progress',
				width: 180,
				render: (_: unknown, row: Job) => {
					const ops = row.progress?.objectsDone ?? 0
					const bytes = row.progress?.bytesDone ?? 0
					const speed = row.progress?.speedBps ?? 0
					if (!ops && !bytes) return <Typography.Text type="secondary">-</Typography.Text>
					const parts = []
					if (ops) parts.push(`${ops} ops`)
					if (bytes) parts.push(formatBytes(bytes))
					if (speed) parts.push(`${formatBytes(speed)}/s`)
					return <Typography.Text type="secondary">{parts.join(' · ')}</Typography.Text>
				},
				sorter: (a: Job, b: Job) => compareNumber(getProgressSortValue(a), getProgressSortValue(b)),
			},
			{
				key: 'errorCode',
				title: 'Error code',
				dataIndex: 'errorCode',
				width: 160,
				render: (value: unknown) => renderClampedText(typeof value === 'string' ? value : null, 'secondary'),
				sorter: (a: Job, b: Job) => compareText(a.errorCode ?? '', b.errorCode ?? ''),
			},
			{
				key: 'error',
				title: 'Error',
				dataIndex: 'error',
				width: 240,
				render: (value: unknown) => renderClampedText(typeof value === 'string' ? value : null, 'danger'),
				sorter: (a: Job, b: Job) => compareText(a.error ?? '', b.error ?? ''),
			},
			{
				key: 'createdAt',
				title: 'Created',
				dataIndex: 'createdAt',
				width: 220,
				render: (value: unknown) => {
					const createdAt = typeof value === 'string' ? value : ''
					return renderClampedText(createdAt ? formatDateTime(createdAt) : null, 'secondary', {
						code: true,
						tooltip: createdAt,
						forceTooltip: true,
					})
				},
				sorter: (a: Job, b: Job) => compareNumber(toTimestamp(a.createdAt), toTimestamp(b.createdAt)),
			},
			{
				key: 'actions',
				title: 'Actions',
				width: 140,
				fixed: 'right',
				align: 'center',
				render: (_: unknown, row: Job) => {
					const isZipJob = row.type === 's3_zip_prefix' || row.type === 's3_zip_objects'
					const canDownloadArtifact = isZipJob && row.status !== 'failed' && row.status !== 'canceled'
					const isCancelDisabled =
						isOffline ||
						(row.status !== 'queued' && row.status !== 'running') ||
						(cancelPending && cancelingJobId === row.id)
					const isRetryDisabled =
						isOffline ||
						(row.status !== 'failed' && row.status !== 'canceled') ||
						(retryPending && retryingJobId === row.id)
					const isDeleteDisabled =
						isOffline ||
						row.status === 'queued' ||
						row.status === 'running' ||
						(deletePending && deletingJobId === row.id)

					const summary = getJobSummary(row)
					const label = summary ? `Artifact: ${summary}` : `Job artifact: ${row.id}`
					const menuItems: MenuProps['items'] = [
						{
							key: 'details',
							icon: <InfoCircleOutlined />,
							label: 'Details',
							disabled: isOffline,
							onClick: () => openDetailsForJob(row.id),
						},
						{
							key: 'logs',
							icon: <FileTextOutlined />,
							label: 'Logs',
							disabled: isOffline || (isLogsLoading && activeLogJobId === row.id),
							onClick: () => openLogsForJob(row.id),
						},
					]

					if (isZipJob) {
						menuItems.push({
							key: 'download',
							icon: <DownloadOutlined />,
							label: 'Download ZIP',
							disabled: isOffline || !canDownloadArtifact || !profileId,
							onClick: () => {
								if (!profileId) return
								queueDownloadJobArtifact({
									profileId,
									jobId: row.id,
									label,
									filenameHint: `job-${row.id}.zip`,
									waitForJob: row.status !== 'succeeded',
								})
							},
						})
					}

					menuItems.push({ type: 'divider' })
					menuItems.push({
						key: 'cancel',
						icon: <StopOutlined />,
						label: 'Cancel',
						danger: true,
						disabled: isCancelDisabled,
						onClick: () => requestCancelJob(row.id),
					})

					return (
						<Space size={4}>
							<Tooltip title="Retry">
								<Button
									type="text"
									size="small"
									icon={<RedoOutlined />}
									disabled={isRetryDisabled}
									loading={retryPending && retryingJobId === row.id}
									aria-label="Retry"
									onClick={() => requestRetryJob(row.id)}
								/>
							</Tooltip>
							<Tooltip title="Delete">
								<Button
									type="text"
									size="small"
									danger
									icon={<DeleteOutlined />}
									disabled={isDeleteDisabled}
									loading={deletePending && deletingJobId === row.id}
									aria-label="Delete"
									onClick={() => {
										confirmDangerAction({
											title: 'Delete job record?',
											description: (
												<Space direction="vertical" style={{ width: '100%' }}>
													<Typography.Text>
														Job ID: <Typography.Text code>{row.id}</Typography.Text>
													</Typography.Text>
													<Typography.Text type="secondary">
														This removes the job record and deletes its log file.
													</Typography.Text>
												</Space>
											),
											onConfirm: async () => {
												await requestDeleteJob(row.id)
											},
										})
									}}
								/>
							</Tooltip>
							<Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
								<Button type="text" size="small" icon={<MoreOutlined />} aria-label="More actions" />
							</Dropdown>
						</Space>
					)
				},
			},
		]

		return columnDefs.filter((column) => mergedColumnVisibility[column.key as ColumnKey] !== false)
	}, [
		activeLogJobId,
		cancelPending,
		cancelingJobId,
		deletePending,
		deletingJobId,
		getJobSummary,
		isLogsLoading,
		isOffline,
		mergedColumnVisibility,
		openDetailsForJob,
		openLogsForJob,
		profileId,
		queueDownloadJobArtifact,
		renderClampedText,
		requestCancelJob,
		requestDeleteJob,
		requestRetryJob,
		retryPending,
		retryingJobId,
	])
}
