import { ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Collapse, Descriptions, Space, Spin, Tag, Tooltip, Typography } from 'antd'
import { useId, useLayoutEffect } from 'react'

import type { Job } from '../../api/types'
import { OverlaySheet } from '../../components/OverlaySheet'
import { confirmDangerAction } from '../../lib/confirmDangerAction'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { formatDateTime } from '../../lib/format'
import { getJobTypeInfo } from '../../lib/jobTypes'
import { formatBytes, formatDurationSeconds } from '../../lib/transfer'
import { formatProgress, jobSummary } from './jobPresentation'
import { formatS3Destination, getBool, getNumber, getString, parentPrefixFromKey, statusColor } from './jobUtils'
import { JobsUploadDetailsTable } from './JobsUploadDetailsTable'
import type { JobsUploadDetails, JobsUploadTableRow } from './jobsUploadTypes'

type DetailField = {
	label: string
	value: string | null
	code?: boolean
	tone?: 'danger' | 'secondary'
}

function getStringList(payload: Record<string, unknown>, key: string): string[] {
	const value = payload[key]
	if (!Array.isArray(value)) return []
	return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function formatS3Object(bucket: string | null, key: string | null): string | null {
	if (!bucket || !key) return null
	return `s3://${bucket}/${key}`
}

function formatSelection(parts: Array<string | null | undefined>): string | null {
	const normalized = parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
	return normalized.length > 0 ? normalized.join(' · ') : null
}

function formatCount(value: number | null, noun: string): string | null {
	if (value == null) return null
	return `${value} ${noun}${value === 1 ? '' : 's'}`
}

function formatDurationBetween(start: string | null | undefined, end: string | null | undefined, suffix: string | null = null): string | null {
	if (!start || !end) return null
	const startMs = Date.parse(start)
	const endMs = Date.parse(end)
	if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
	const base = formatDurationSeconds((endMs - startMs) / 1000)
	return suffix ? `${base} ${suffix}` : base
}

function buildOperationalSections(job: Job, uploadDetails: JobsUploadDetails | null) {
	const routing: DetailField[] = []
	const behavior: DetailField[] = []
	const timeline: DetailField[] = []
	const payload = job.payload ?? {}
	const dryRun = getBool(payload, 'dryRun')
	const include = getStringList(payload, 'include')
	const exclude = getStringList(payload, 'exclude')
	const bucket = getString(payload, 'bucket')
	const prefix = getString(payload, 'prefix')
	const srcBucket = getString(payload, 'srcBucket')
	const srcKey = getString(payload, 'srcKey')
	const srcPrefix = getString(payload, 'srcPrefix')
	const dstBucket = getString(payload, 'dstBucket')
	const dstKey = getString(payload, 'dstKey')
	const dstPrefix = getString(payload, 'dstPrefix')
	const localPath = getString(payload, 'localPath')
	const rootName = getString(payload, 'rootName')
	const label = getString(payload, 'label')
	const uploadId = getString(payload, 'uploadId')
	const rootKind = getString(payload, 'rootKind')
	const totalFiles = getNumber(payload, 'totalFiles') ?? uploadDetails?.totalFiles ?? null
	const totalBytes = getNumber(payload, 'totalBytes') ?? uploadDetails?.totalBytes ?? null
	const deleteAll = getBool(payload, 'deleteAll')
	const allowUnsafePrefix = getBool(payload, 'allowUnsafePrefix')
	const deleteExtraneous = getBool(payload, 'deleteExtraneous')
	const fullReindex = getBool(payload, 'fullReindex')
	const items = Array.isArray(payload['items']) ? payload['items'] : []
	const keys = Array.isArray(payload['keys']) ? payload['keys'] : []

	switch (job.type) {
		case 'transfer_sync_local_to_s3':
			routing.push({ label: 'Source', value: localPath, code: true })
			routing.push({ label: 'Destination', value: formatS3Destination(bucket, prefix), code: true })
			behavior.push({ label: 'Mode', value: deleteExtraneous ? 'Mirror sync from device to bucket' : 'Upload changed files only' })
			break
		case 'transfer_sync_s3_to_local':
			routing.push({ label: 'Source', value: formatS3Destination(bucket, prefix), code: true })
			routing.push({ label: 'Destination', value: localPath, code: true })
			behavior.push({ label: 'Mode', value: deleteExtraneous ? 'Mirror sync from bucket to device' : 'Download changed files only' })
			break
		case 'transfer_direct_upload':
		case 'transfer_sync_staging_to_s3':
			routing.push({
				label: 'Source',
				value: rootName ?? label ?? uploadId ?? null,
				code: !(rootName ?? label),
			})
			routing.push({ label: 'Destination', value: formatS3Destination(bucket ?? uploadDetails?.bucket ?? null, prefix ?? uploadDetails?.prefix ?? null), code: true })
			routing.push({
				label: 'Selection',
				value: formatSelection([
					formatCount(totalFiles, 'file'),
					totalBytes != null ? formatBytes(totalBytes) : null,
				]),
			})
			behavior.push({
				label: 'Mode',
				value: job.type === 'transfer_direct_upload' ? 'Direct browser stream to S3' : 'Finalize staged upload into S3',
			})
			behavior.push({ label: 'Root kind', value: rootKind })
			behavior.push({ label: 'Upload session', value: uploadId, code: true })
			break
		case 'transfer_delete_prefix':
			routing.push({
				label: 'Target',
				value: deleteAll ? formatS3Destination(bucket, null)?.replace(/\/$/, '/*') ?? null : bucket ? `s3://${bucket}/${prefix ?? ''}*` : null,
				code: true,
			})
			behavior.push({ label: 'Mode', value: deleteAll ? 'Delete all objects in bucket' : 'Delete matching prefix recursively' })
			break
		case 'transfer_copy_object':
		case 'transfer_move_object':
			routing.push({ label: 'Source', value: formatS3Object(srcBucket, srcKey), code: true })
			routing.push({ label: 'Destination', value: formatS3Object(dstBucket, dstKey), code: true })
			behavior.push({ label: 'Mode', value: job.type === 'transfer_move_object' ? 'Move object (copy then delete source)' : 'Copy single object' })
			break
		case 'transfer_copy_batch':
		case 'transfer_move_batch': {
			const firstItem = items[0] as Record<string, unknown> | undefined
			const firstDstKey = firstItem && typeof firstItem['dstKey'] === 'string' ? String(firstItem['dstKey']) : null
			routing.push({ label: 'Source', value: srcBucket ? `s3://${srcBucket}/` : null, code: true })
			routing.push({
				label: 'Destination',
				value: dstBucket ? formatS3Destination(dstBucket, firstDstKey ? parentPrefixFromKey(firstDstKey) : null) : null,
				code: true,
			})
			routing.push({ label: 'Selection', value: formatCount(items.length || null, 'mapped object') })
			behavior.push({ label: 'Mode', value: job.type === 'transfer_move_batch' ? 'Move batch (copy then delete sources)' : 'Copy batch' })
			break
		}
		case 'transfer_copy_prefix':
		case 'transfer_move_prefix':
			routing.push({ label: 'Source', value: srcBucket && srcPrefix ? `s3://${srcBucket}/${srcPrefix}*` : null, code: true })
			routing.push({ label: 'Destination', value: formatS3Destination(dstBucket, dstPrefix), code: true })
			behavior.push({ label: 'Mode', value: job.type === 'transfer_move_prefix' ? 'Move prefix (copy then delete sources)' : 'Copy prefix recursively' })
			break
		case 's3_zip_prefix':
			routing.push({ label: 'Source', value: bucket ? `s3://${bucket}/${prefix ?? ''}*` : null, code: true })
			behavior.push({ label: 'Artifact', value: 'ZIP archive output' })
			break
		case 's3_zip_objects':
			routing.push({ label: 'Source', value: bucket ? `s3://${bucket}/` : null, code: true })
			routing.push({ label: 'Selection', value: formatCount(keys.length || null, 'selected object') })
			behavior.push({ label: 'Artifact', value: 'ZIP archive output' })
			break
		case 's3_delete_objects':
			routing.push({ label: 'Target bucket', value: bucket ? `s3://${bucket}/` : null, code: true })
			routing.push({ label: 'Selection', value: formatCount(keys.length || null, 'selected object') })
			behavior.push({ label: 'Mode', value: 'Delete selected objects' })
			break
		case 's3_index_objects':
			routing.push({ label: 'Target', value: formatS3Destination(bucket, prefix), code: true })
			behavior.push({ label: 'Mode', value: fullReindex ? 'Full object index rebuild' : 'Incremental object index refresh' })
			break
		default:
			break
	}

	if (include.length > 0) behavior.push({ label: 'Include patterns', value: include.join(', ') })
	if (exclude.length > 0) behavior.push({ label: 'Exclude patterns', value: exclude.join(', ') })

	const flags: string[] = []
	if (dryRun) flags.push('dry-run')
	if (deleteAll) flags.push('delete-all')
	if (allowUnsafePrefix) flags.push('unsafe-prefix-allowed')
	if (deleteExtraneous) flags.push('delete-extraneous')
	if (flags.length > 0) behavior.push({ label: 'Flags', value: flags.join(', '), code: true })

	const nowIso = new Date().toISOString()
	timeline.push({ label: 'Queue wait', value: formatDurationBetween(job.createdAt, job.startedAt) })
	timeline.push({
		label: 'Runtime',
		value: formatDurationBetween(job.startedAt, job.finishedAt ?? (job.status === 'running' ? nowIso : null), job.finishedAt ? null : 'elapsed'),
	})
	timeline.push({
		label: 'End-to-end',
		value: formatDurationBetween(job.createdAt, job.finishedAt ?? (job.startedAt ? nowIso : null), job.finishedAt ? null : 'so far'),
	})

	return {
		routing: routing.filter((field) => field.value),
		behavior: behavior.filter((field) => field.value),
		timeline: timeline.filter((field) => field.value),
	}
}

function renderFieldValue(field: DetailField) {
	if (!field.value) return <Typography.Text type="secondary">-</Typography.Text>
	if (field.code) return <Typography.Text code>{field.value}</Typography.Text>
	if (field.tone === 'danger') return <Typography.Text type="danger">{field.value}</Typography.Text>
	if (field.tone === 'secondary') return <Typography.Text type="secondary">{field.value}</Typography.Text>
	return <Typography.Text>{field.value}</Typography.Text>
}

type Props = {
	open: boolean
	onClose: () => void
	drawerWidth: number | string
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

const jobsDetailsDrawerContextVersions = new Map<string, number>()

export function JobsDetailsDrawer(props: Props) {
	const detailsInstanceId = useId()

	useLayoutEffect(() => {
		jobsDetailsDrawerContextVersions.set(
			detailsInstanceId,
			(jobsDetailsDrawerContextVersions.get(detailsInstanceId) ?? 0) + 1,
		)
	}, [detailsInstanceId, props.detailsJobId, props.job?.id, props.open])

	useLayoutEffect(() => {
		return () => {
			jobsDetailsDrawerContextVersions.delete(detailsInstanceId)
		}
	}, [detailsInstanceId])

	const detailsSections = props.job ? buildOperationalSections(props.job, props.uploadDetails) : null
	const summary = props.job ? jobSummary(props.job) : null

	return (
		<OverlaySheet
			open={props.open}
			onClose={props.onClose}
			title="Job Details"
			placement="right"
			width={typeof props.drawerWidth === 'number' ? `${props.drawerWidth}px` : props.drawerWidth}
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
							const detailsJobId = props.detailsJobId
							const confirmContextVersion = jobsDetailsDrawerContextVersions.get(detailsInstanceId) ?? 0
							confirmDangerAction({
								title: 'Delete job record?',
								description: (
									<Space orientation="vertical" style={{ width: '100%' }}>
										<Typography.Text>
											Job ID: <Typography.Text code>{detailsJobId}</Typography.Text>
										</Typography.Text>
										<Typography.Text type="secondary">This removes the job record and deletes its log file.</Typography.Text>
									</Space>
								),
								onConfirm: async () => {
									if ((jobsDetailsDrawerContextVersions.get(detailsInstanceId) ?? 0) !== confirmContextVersion) return
									await props.onDeleteJob(detailsJobId)
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
										<Space orientation="vertical" size={0} style={{ width: '100%' }}>
											<Typography.Text strong>{info.label}</Typography.Text>
											<Typography.Text type="secondary">{info.description}</Typography.Text>
											<Typography.Text code>{props.job.type}</Typography.Text>
										</Space>
									)
								})()}
							</Descriptions.Item>
							<Descriptions.Item label="Summary">
								{summary ? <Typography.Text type="secondary">{summary}</Typography.Text> : <Typography.Text type="secondary">-</Typography.Text>}
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

						{detailsSections ? (
							<Space orientation="vertical" size="middle" style={{ width: '100%', marginTop: 16 }}>
								{detailsSections.routing.length > 0 ? (
									<Descriptions size="small" bordered column={1} title="Operational routing">
										{detailsSections.routing.map((field) => (
											<Descriptions.Item key={field.label} label={field.label}>
												{renderFieldValue(field)}
											</Descriptions.Item>
										))}
									</Descriptions>
								) : null}

								{detailsSections.behavior.length > 0 ? (
									<Descriptions size="small" bordered column={1} title="Behavior">
										{detailsSections.behavior.map((field) => (
											<Descriptions.Item key={field.label} label={field.label}>
												{renderFieldValue(field)}
											</Descriptions.Item>
										))}
									</Descriptions>
								) : null}

								{detailsSections.timeline.length > 0 ? (
									<Descriptions size="small" bordered column={1} title="Timeline">
										{detailsSections.timeline.map((field) => (
											<Descriptions.Item key={field.label} label={field.label}>
												{renderFieldValue(field)}
											</Descriptions.Item>
										))}
									</Descriptions>
								) : null}
							</Space>
						) : null}

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
													<Space orientation="vertical" size="middle" style={{ width: '100%' }}>
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
		</OverlaySheet>
	)
}
