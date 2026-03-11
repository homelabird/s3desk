import { Space, Tag, Tooltip, Typography } from 'antd'
import { useCallback, useMemo, type CSSProperties, type ReactNode } from 'react'

import type { Job, JobStatus } from '../../api/types'
import { formatDateTime, toTimestamp } from '../../lib/format'
import { getJobTypeInfo } from '../../lib/jobTypes'
import { JobsRowActions } from './JobsRowActions'
import { compareNumber, compareText, formatProgress, getProgressSortValue } from './jobPresentation'
import { statusColor } from './jobUtils'
import type { JobsVirtualTableColumn } from './JobsVirtualTable'
import cellStyles from './JobsCellText.module.css'
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
	const renderClampedText = useCallback(
		(
			value: string | null | undefined,
			tone?: 'secondary' | 'danger',
			options?: { code?: boolean; tooltip?: ReactNode; forceTooltip?: boolean; lines?: number },
		) => {
			if (!value) return <Typography.Text type="secondary">-</Typography.Text>
			const lines = options?.lines ?? 2
			const className = lines === 1 ? cellStyles.singleLine : cellStyles.multiLine
			const lineStyle =
				lines === 1
					? undefined
					: ({ '--jobs-cell-lines': String(lines) } as CSSProperties)
			const content = (
				<Typography.Text type={tone} className={`${cellStyles.cellText} ${className}`} style={lineStyle} code={options?.code}>
					{value}
				</Typography.Text>
			)
			const showTooltip = (options?.forceTooltip ?? false) || value.length > 32 || value.includes('\n')
			if (!showTooltip) return content
			const tooltipTitle =
				typeof options?.tooltip === 'string' || options?.tooltip == null ? (
					<span className={cellStyles.tooltipContent}>{options?.tooltip ?? value}</span>
				) : (
					options.tooltip
				)
			return <Tooltip title={tooltipTitle}>{content}</Tooltip>
		},
		[],
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
				sorter: (a: Job, b: Job) => compareText(getJobTypeInfo(a.type)?.label ?? a.type, getJobTypeInfo(b.type)?.label ?? b.type),
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
				render: (_: unknown, row: Job) => <Typography.Text type="secondary">{formatProgress(row.progress)}</Typography.Text>,
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
				render: (value: unknown) => renderClampedText(typeof value === 'string' ? value : null, 'danger', { lines: 1 }),
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
				width: 250,
				fixed: 'right',
				align: 'center',
				render: (_: unknown, row: Job) => (
					<JobsRowActions
						job={row}
						isOffline={isOffline}
						isLogsLoading={isLogsLoading}
						activeLogJobId={activeLogJobId}
						cancelingJobId={cancelingJobId}
						retryingJobId={retryingJobId}
						deletingJobId={deletingJobId}
						cancelPending={cancelPending}
						retryPending={retryPending}
						deletePending={deletePending}
						profileId={profileId}
						jobSummary={getJobSummary(row)}
						onOpenDetails={openDetailsForJob}
						onOpenLogs={openLogsForJob}
						onRequestCancelJob={requestCancelJob}
						onRequestRetryJob={requestRetryJob}
						onRequestDeleteJob={requestDeleteJob}
						onQueueDownloadJobArtifact={queueDownloadJobArtifact}
					/>
				),
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
