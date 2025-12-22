import { type InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
	Alert,
	AutoComplete,
	Checkbox,
	Button,
	Descriptions,
	Drawer,
	Form,
	Grid,
	Input,
	Modal,
	Select,
	Space,
	Spin,
	Table,
	Tag,
	Typography,
	message,
	Switch,
} from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DeleteOutlined, DownloadOutlined, PlusOutlined, RedoOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons'
import { useLocation } from 'react-router-dom'

import { APIClient, APIError } from '../api/client'
import { LocalPathBrowseModal } from '../components/LocalPathBrowseModal'
import { LocalPathInput } from '../components/LocalPathInput'
import { useTransfers } from '../components/useTransfers'
import type { Bucket, Job, JobProgress, JobsListResponse, JobStatus, WSEvent } from '../api/types'
import { useLocalStorageState } from '../lib/useLocalStorageState'

type Props = {
	apiToken: string
	profileId: string | null
}

type DeleteJobPrefill = {
	bucket: string
	prefix: string
	deleteAll: boolean
}

export function JobsPage(props: Props) {
	const queryClient = useQueryClient()
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
	const transfers = useTransfers()
	const location = useLocation()
	const screens = Grid.useBreakpoint()

	const deleteJobInitialPrefill: DeleteJobPrefill | null = (() => {
		if (!location.state || typeof location.state !== 'object') return null
		const state = location.state as { openDeleteJob?: unknown; bucket?: unknown; prefix?: unknown; deleteAll?: unknown }
		if (state.openDeleteJob !== true) return null
		const bucketFromState = typeof state.bucket === 'string' ? state.bucket : ''
		if (!bucketFromState.trim()) return null
		const prefixFromState = typeof state.prefix === 'string' ? state.prefix : ''
		const deleteAllFromState = state.deleteAll === true
		return { bucket: bucketFromState, prefix: prefixFromState, deleteAll: deleteAllFromState }
	})()

	const [createOpen, setCreateOpen] = useState(false)
	const [createDeleteOpen, setCreateDeleteOpen] = useState(() => deleteJobInitialPrefill !== null)
	const [createDownloadOpen, setCreateDownloadOpen] = useState(false)
	const [logsOpen, setLogsOpen] = useState(false)
	const [activeLogJobId, setActiveLogJobId] = useState<string | null>(null)
	const [logByJobId, setLogByJobId] = useState<Record<string, string[]>>({})
	const [detailsOpen, setDetailsOpen] = useState(false)
	const [detailsJobId, setDetailsJobId] = useState<string | null>(null)
	const [followLogs, setFollowLogs] = useLocalStorageState('jobsFollowLogs', true)
	const logsContainerRef = useRef<HTMLDivElement | null>(null)
	const logOffsetsRef = useRef<Record<string, number>>({})
	const logRemaindersRef = useRef<Record<string, string>>({})
	const lastSeqRef = useRef<number>(0)
	const [bucket, setBucket] = useLocalStorageState<string>('bucket', '')
	const [eventsConnected, setEventsConnected] = useState(false)
	const [eventsTransport, setEventsTransport] = useState<'ws' | 'sse' | null>(null)
	const [statusFilter, setStatusFilter] = useLocalStorageState<JobStatus | 'all'>('jobsStatusFilter', 'all')
	const [typeFilter, setTypeFilter] = useLocalStorageState('jobsTypeFilter', '')
	const [cancelingJobId, setCancelingJobId] = useState<string | null>(null)
	const [retryingJobId, setRetryingJobId] = useState<string | null>(null)
	const [deletingJobId, setDeletingJobId] = useState<string | null>(null)
	const [deleteJobPrefill, setDeleteJobPrefill] = useState<DeleteJobPrefill | null>(() => deleteJobInitialPrefill)
	const [downloadLocalPath, setDownloadLocalPath] = useLocalStorageState<string>('jobsDownloadLocalPath', '')

	const bucketsQuery = useQuery({
		queryKey: ['buckets', props.profileId, props.apiToken],
		queryFn: () => api.listBuckets(props.profileId!),
		enabled: !!props.profileId,
	})
	const bucketOptions = (bucketsQuery.data ?? []).map((b: Bucket) => ({ label: b.name, value: b.name }))

	const jobDetailsQuery = useQuery({
		queryKey: ['job', props.profileId, detailsJobId, props.apiToken],
		queryFn: () => api.getJob(props.profileId!, detailsJobId!),
		enabled: !!props.profileId && !!detailsJobId && detailsOpen,
	})

	const jobsQuery = useInfiniteQuery({
		queryKey: ['jobs', props.profileId, props.apiToken, statusFilter, typeFilter],
		enabled: !!props.profileId,
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) =>
			api.listJobs(props.profileId!, {
				limit: 50,
				status: statusFilter === 'all' ? undefined : statusFilter,
				type: typeFilter.trim() ? typeFilter.trim() : undefined,
				cursor: pageParam,
			}),
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		refetchInterval: eventsConnected ? false : 5000,
	})

	const createMutation = useMutation({
		mutationFn: (payload: { bucket: string; prefix: string; localPath: string; deleteExtraneous: boolean; include: string[]; exclude: string[]; dryRun: boolean }) =>
			api.createJob(props.profileId!, { type: 's5cmd_sync_local_to_s3', payload }),
		onSuccess: async (job) => {
			message.success(`Job created: ${job.id}`)
			setCreateOpen(false)
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const createDownloadMutation = useMutation({
		mutationFn: (payload: { bucket: string; prefix: string; localPath: string; deleteExtraneous: boolean; include: string[]; exclude: string[]; dryRun: boolean }) =>
			api.createJob(props.profileId!, { type: 's5cmd_sync_s3_to_local', payload }),
		onSuccess: async (job) => {
			message.success(`Job created: ${job.id}`)
			setCreateDownloadOpen(false)
			setDetailsJobId(job.id)
			setDetailsOpen(true)
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const createDeleteMutation = useMutation({
		mutationFn: (payload: {
			bucket: string
			prefix: string
			deleteAll: boolean
			allowUnsafePrefix: boolean
			include: string[]
			exclude: string[]
			dryRun: boolean
		}) => api.createJob(props.profileId!, { type: 's5cmd_rm_prefix', payload }),
		onSuccess: async (job) => {
			message.success(`Delete job created: ${job.id}`)
			setCreateDeleteOpen(false)
			setDeleteJobPrefill(null)
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const cancelMutation = useMutation({
		mutationFn: (jobId: string) => api.cancelJob(props.profileId!, jobId),
		onMutate: (jobId) => setCancelingJobId(jobId),
		onSuccess: async () => {
			message.success('Cancel requested')
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
		},
		onSettled: (_, __, jobId) => setCancelingJobId((prev) => (prev === jobId ? null : prev)),
		onError: (err) => message.error(formatErr(err)),
	})

	const retryMutation = useMutation({
		mutationFn: (jobId: string) => api.retryJob(props.profileId!, jobId),
		onMutate: (jobId) => setRetryingJobId(jobId),
		onSuccess: async (job) => {
			message.success(`Retry queued: ${job.id}`)
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
		},
		onSettled: (_, __, jobId) => setRetryingJobId((prev) => (prev === jobId ? null : prev)),
		onError: (err) => message.error(formatErr(err)),
	})

	const deleteJobMutation = useMutation({
		mutationFn: (jobId: string) => api.deleteJob(props.profileId!, jobId),
		onMutate: (jobId) => setDeletingJobId(jobId),
		onSuccess: async (_, jobId) => {
			message.success('Job deleted')
			setLogByJobId((prev) => {
				const next = { ...prev }
				delete next[jobId]
				return next
			})
			delete logOffsetsRef.current[jobId]
			delete logRemaindersRef.current[jobId]
			if (activeLogJobId === jobId) {
				setLogsOpen(false)
				setActiveLogJobId(null)
			}
			if (detailsJobId === jobId) {
				setDetailsOpen(false)
				setDetailsJobId(null)
			}
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
		},
		onSettled: (_, __, jobId) => setDeletingJobId((prev) => (prev === jobId ? null : prev)),
		onError: (err) => message.error(formatErr(err)),
	})

	const logsMutation = useMutation({
		mutationFn: (jobId: string) => api.getJobLogsTail(props.profileId!, jobId, 256 * 1024),
		onSuccess: ({ text, nextOffset }, jobId) => {
			const lines = text
				.split('\n')
				.map((l) => l.trimEnd())
				.filter((l) => l.length > 0)
				.slice(-2000)
			setLogByJobId((prev) => ({ ...prev, [jobId]: lines }))
			logOffsetsRef.current[jobId] = nextOffset
			logRemaindersRef.current[jobId] = ''
		},
		onError: (err) => message.error(formatErr(err)),
	})

	useEffect(() => {
		if (!props.profileId) return
		if (!logsOpen || !followLogs || !activeLogJobId) return

		const jobId = activeLogJobId
		const tick = async () => {
			const offset = logOffsetsRef.current[jobId] ?? 0
			try {
				const { text, nextOffset } = await api.getJobLogsAfterOffset(props.profileId!, jobId, offset, 128 * 1024)
				if (nextOffset < offset) {
					logOffsetsRef.current[jobId] = nextOffset
					logRemaindersRef.current[jobId] = ''
				}
				if (nextOffset === offset || !text) return
				logOffsetsRef.current[jobId] = nextOffset

				const combined = (logRemaindersRef.current[jobId] ?? '') + text
				const parts = combined.split('\n')
				if (!combined.endsWith('\n')) {
					logRemaindersRef.current[jobId] = parts.pop() ?? ''
				} else {
					logRemaindersRef.current[jobId] = ''
				}

				const newLines = parts
					.map((l) => l.trimEnd())
					.filter((l) => l.length > 0)
				if (newLines.length === 0) return

				setLogByJobId((prev) => {
					const next = { ...prev }
					const existing = next[jobId] ?? []
					next[jobId] = [...existing, ...newLines].slice(-2000)
					return next
				})
			} catch {
				// ignore
			}
		}

		tick().catch(() => {})
		const id = window.setInterval(() => {
			tick().catch(() => {})
		}, 1500)
		return () => window.clearInterval(id)
	}, [activeLogJobId, api, followLogs, logsOpen, props.profileId])

	useEffect(() => {
		if (!logsOpen || !followLogs || !activeLogJobId) return
		const el = logsContainerRef.current
		if (!el) return
		el.scrollTop = el.scrollHeight
	}, [activeLogJobId, followLogs, logByJobId, logsOpen])

	useEffect(() => {
		if (!props.profileId) return

		let ws: WebSocket | null = null
		let es: EventSource | null = null
		let stopped = false

		const handleEvent = (data: string) => {
			try {
				const msg = JSON.parse(data) as WSEvent
				if (typeof msg.seq === 'number' && msg.seq > lastSeqRef.current) {
					lastSeqRef.current = msg.seq
				}
				if (msg.type === 'jobs.deleted' && typeof msg.payload === 'object' && msg.payload !== null) {
					const payload = msg.payload as { jobIds?: unknown }
					const jobIds = Array.isArray(payload.jobIds)
						? payload.jobIds.filter((v): v is string => typeof v === 'string' && v.length > 0)
						: []
					if (jobIds.length > 0) {
						queryClient.invalidateQueries({ queryKey: ['jobs'], exact: false }).catch(() => {})

						setLogByJobId((prev) => {
							const next = { ...prev }
							for (const id of jobIds) delete next[id]
							return next
						})
						for (const id of jobIds) {
							delete logOffsetsRef.current[id]
							delete logRemaindersRef.current[id]
						}
						setActiveLogJobId((prev) => {
							if (!prev || !jobIds.includes(prev)) return prev
							setLogsOpen(false)
							return null
						})
						setDetailsJobId((prev) => {
							if (!prev || !jobIds.includes(prev)) return prev
							setDetailsOpen(false)
							return null
						})
					}
				}
				if (msg.type === 'job.created') {
					queryClient.invalidateQueries({ queryKey: ['jobs'] }).catch(() => {})
				}
				if (
					(msg.type === 'job.progress' || msg.type === 'job.completed') &&
					msg.jobId &&
					typeof msg.payload === 'object' &&
					msg.payload !== null
				) {
					const payload = msg.payload as { status?: JobStatus; progress?: JobProgress; error?: string }
					const status = payload.status
					const progress = payload.progress
					const error = payload.error

					queryClient.setQueriesData(
						{ queryKey: ['jobs'], exact: false },
						(old: InfiniteData<JobsListResponse, string | undefined> | undefined) =>
							updateJob(old, msg.jobId!, (job) => ({
								...job,
								status: status ?? job.status,
								progress: progress ?? job.progress,
								error: error ?? job.error,
							})),
					)
				}
			} catch {
				// ignore
			}
		}

		const connectSSE = () => {
			if (stopped || es) return
			try {
				es = new EventSource(buildSSEURL(props.apiToken, lastSeqRef.current))
			} catch {
				return
			}
			es.onopen = () => {
				setEventsTransport('sse')
				setEventsConnected(true)
			}
			es.onerror = () => {
				setEventsTransport('sse')
				setEventsConnected(false)
			}
			es.onmessage = (ev) => handleEvent(ev.data)
		}

		const connectWS = () => {
			ws = new WebSocket(buildWSURL(props.apiToken, lastSeqRef.current))

			let opened = false
			const fallbackTimer = window.setTimeout(() => {
				if (stopped || opened) return
				try {
					ws?.close()
				} catch {
					// ignore
				}
				connectSSE()
			}, 1500)

			ws.onopen = () => {
				opened = true
				window.clearTimeout(fallbackTimer)
				setEventsTransport('ws')
				setEventsConnected(true)
			}

			const onDisconnect = () => {
				window.clearTimeout(fallbackTimer)
				if (stopped) return
				setEventsTransport(null)
				setEventsConnected(false)
				connectSSE()
			}
			ws.onclose = onDisconnect
			ws.onerror = onDisconnect
			ws.onmessage = (ev) => handleEvent(ev.data)
		}

		connectWS()
		return () => {
			stopped = true
			try {
				ws?.close()
			} catch {
				// ignore
			}
			es?.close()
		}
	}, [props.apiToken, props.profileId, queryClient])

	if (!props.profileId) {
		return <Alert type="warning" showIcon message="Select a profile first" />
	}

	const jobs = jobsQuery.data?.pages.flatMap((p) => p.items) ?? []
	const isLoading = jobsQuery.isFetching && !jobsQuery.isFetchingNextPage

	return (
		<Space direction="vertical" size="large" style={{ width: '100%' }}>
			<div
				style={{
					display: 'flex',
					width: '100%',
					justifyContent: 'space-between',
					alignItems: 'center',
					gap: 12,
					flexWrap: 'wrap',
				}}
			>
				<Typography.Title level={3} style={{ margin: 0 }}>
					Jobs
				</Typography.Title>
				<Space wrap>
					<Tag color={eventsConnected ? 'success' : 'default'}>
						{eventsConnected ? `Realtime: ${(eventsTransport ?? 'unknown').toUpperCase()}` : 'Realtime disconnected'}
					</Tag>
					<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
						New Sync Job
					</Button>
					<Button icon={<DownloadOutlined />} onClick={() => setCreateDownloadOpen(true)}>
						New Download Job
						</Button>
						<Button
							danger
							icon={<DeleteOutlined />}
							onClick={() => {
								setDeleteJobPrefill(null)
								setCreateDeleteOpen(true)
							}}
						>
							New Delete Job
						</Button>
					</Space>
			</div>

			<Space wrap style={{ width: '100%' }}>
				<Select
					value={statusFilter}
					onChange={(v) => setStatusFilter(v)}
					style={{ width: screens.md ? 200 : '100%', maxWidth: '100%' }}
					options={[
						{ label: 'All statuses', value: 'all' },
						{ label: 'queued', value: 'queued' },
						{ label: 'running', value: 'running' },
						{ label: 'succeeded', value: 'succeeded' },
						{ label: 'failed', value: 'failed' },
						{ label: 'canceled', value: 'canceled' },
					]}
				/>
				<Input
					value={typeFilter}
					onChange={(e) => setTypeFilter(e.target.value)}
					placeholder="type filter (optional)"
					style={{ width: screens.md ? 360 : '100%', maxWidth: '100%' }}
					allowClear
				/>
				<Button icon={<ReloadOutlined />} onClick={() => jobsQuery.refetch()} loading={jobsQuery.isFetching}>
					Refresh
				</Button>
				<Typography.Text type="secondary">{jobs.length ? `${jobs.length} jobs` : ''}</Typography.Text>
			</Space>

			{bucketsQuery.isError ? (
				<Alert
					type="error"
					showIcon
					message="Failed to load buckets (autocomplete)"
					description={formatErr(bucketsQuery.error)}
				/>
			) : null}

			{jobsQuery.isError ? (
				<Alert type="error" showIcon message="Failed to load jobs" description={formatErr(jobsQuery.error)} />
			) : null}

			<Table
				rowKey="id"
				loading={isLoading}
				dataSource={jobs}
				pagination={false}
				scroll={{ x: true }}
				columns={[
					{ title: 'ID', dataIndex: 'id', width: 220, render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
					{ title: 'Type', dataIndex: 'type' },
					{
						title: 'Summary',
						render: (_, row: Job) => (
							<Typography.Text type="secondary" style={{ whiteSpace: screens.md ? 'nowrap' : 'normal' }}>
								{jobSummary(row) ?? '-'}
							</Typography.Text>
						),
					},
					{
						title: 'Status',
						dataIndex: 'status',
						render: (v: JobStatus) => <Tag color={statusColor(v)}>{v}</Tag>,
					},
					{
						title: 'Progress',
						render: (_, row: Job) => {
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
					},
					{
						title: 'Error',
						dataIndex: 'error',
						render: (v: string | null | undefined) =>
							v ? <Typography.Text type="danger">{v}</Typography.Text> : <Typography.Text type="secondary">-</Typography.Text>,
					},
					{ title: 'Created', dataIndex: 'createdAt', width: 220 },
					{
						title: 'Actions',
						render: (_, row: Job) => {
							const isZipJob = row.type === 's3_zip_prefix' || row.type === 's3_zip_objects'
							const canDownloadArtifact = isZipJob && row.status !== 'failed' && row.status !== 'canceled'
							const summary = jobSummary(row)
							const label = summary ? `Artifact: ${summary}` : `Job artifact: ${row.id}`

							return (
								<Space>
									<Button
										size="small"
										icon={<DownloadOutlined />}
										disabled={!canDownloadArtifact}
										onClick={() =>
											transfers.queueDownloadJobArtifact({
												profileId: props.profileId!,
												jobId: row.id,
												label,
												filenameHint: `job-${row.id}.zip`,
												waitForJob: row.status !== 'succeeded',
											})
										}
									>
										Zip
									</Button>
								<Button
									size="small"
									onClick={() => {
										setDetailsJobId(row.id)
										setDetailsOpen(true)
									}}
								>
									Details
								</Button>
								<Button
									size="small"
									onClick={() => {
										setActiveLogJobId(row.id)
										setLogsOpen(true)
										logsMutation.mutate(row.id)
									}}
									loading={logsMutation.isPending && activeLogJobId === row.id}
								>
									Logs
								</Button>
								<Button
									size="small"
									danger
									icon={<StopOutlined />}
									disabled={row.status !== 'queued' && row.status !== 'running'}
									loading={cancelMutation.isPending && cancelingJobId === row.id}
									onClick={() => cancelMutation.mutate(row.id)}
								>
									Cancel
								</Button>
								<Button
									size="small"
									icon={<RedoOutlined />}
									disabled={row.status !== 'failed' && row.status !== 'canceled'}
									loading={retryMutation.isPending && retryingJobId === row.id}
									onClick={() => retryMutation.mutate(row.id)}
								>
									Retry
								</Button>
								<Button
									size="small"
									danger
									icon={<DeleteOutlined />}
									disabled={row.status === 'queued' || row.status === 'running'}
									loading={deleteJobMutation.isPending && deletingJobId === row.id}
									onClick={() => {
										Modal.confirm({
											title: 'Delete job record?',
											content: (
												<Space direction="vertical" style={{ width: '100%' }}>
													<Typography.Text>
														Job ID: <Typography.Text code>{row.id}</Typography.Text>
													</Typography.Text>
													<Typography.Text type="secondary">This removes the job record and deletes its log file.</Typography.Text>
												</Space>
											),
											okText: 'Delete',
											okType: 'danger',
											onOk: async () => {
												await deleteJobMutation.mutateAsync(row.id)
											},
										})
									}}
								>
									Delete
								</Button>
							</Space>
							)
						},
					},
				]}
			/>

			{jobsQuery.hasNextPage ? (
				<Button onClick={() => jobsQuery.fetchNextPage()} loading={jobsQuery.isFetchingNextPage} disabled={!jobsQuery.hasNextPage}>
					Load more
				</Button>
			) : null}

			<CreateJobModal
				api={api}
				profileId={props.profileId}
				open={createOpen}
				onCancel={() => setCreateOpen(false)}
				onSubmit={(values) => createMutation.mutate(values)}
				loading={createMutation.isPending}
				bucket={bucket}
				setBucket={setBucket}
				bucketOptions={bucketOptions}
			/>

			<DownloadJobModal
				api={api}
				profileId={props.profileId}
				open={createDownloadOpen}
				onCancel={() => setCreateDownloadOpen(false)}
				onSubmit={(values) => {
					setDownloadLocalPath(values.localPath)
					createDownloadMutation.mutate(values)
				}}
				loading={createDownloadMutation.isPending}
				bucket={bucket}
				setBucket={setBucket}
				bucketOptions={bucketOptions}
				defaultLocalPath={downloadLocalPath}
			/>

				<DeletePrefixJobModal
					open={createDeleteOpen}
					onCancel={() => {
						setCreateDeleteOpen(false)
						setDeleteJobPrefill(null)
					}}
					onSubmit={(values) => createDeleteMutation.mutate(values)}
					loading={createDeleteMutation.isPending}
					bucket={deleteJobPrefill?.bucket ?? bucket}
					setBucket={setBucket}
					bucketOptions={bucketOptions}
					prefill={deleteJobPrefill ? { prefix: deleteJobPrefill.prefix, deleteAll: deleteJobPrefill.deleteAll } : null}
				/>

			<Drawer
				open={detailsOpen}
				onClose={() => setDetailsOpen(false)}
				title="Job Details"
				width={screens.md ? 720 : '100%'}
				extra={
					<Space>
						<Button
							icon={<ReloadOutlined />}
							disabled={!detailsJobId}
							loading={jobDetailsQuery.isFetching}
							onClick={() => jobDetailsQuery.refetch()}
						>
							Refresh
						</Button>
						<Button
							danger
							disabled={!detailsJobId || jobDetailsQuery.data?.status === 'queued' || jobDetailsQuery.data?.status === 'running'}
							loading={deleteJobMutation.isPending && deletingJobId === detailsJobId}
							onClick={() => {
								if (!detailsJobId) return
								Modal.confirm({
									title: 'Delete job record?',
									content: (
										<Space direction="vertical" style={{ width: '100%' }}>
											<Typography.Text>
												Job ID: <Typography.Text code>{detailsJobId}</Typography.Text>
											</Typography.Text>
											<Typography.Text type="secondary">This removes the job record and deletes its log file.</Typography.Text>
										</Space>
									),
									okText: 'Delete',
									okType: 'danger',
									onOk: async () => {
										await deleteJobMutation.mutateAsync(detailsJobId)
									},
								})
							}}
						>
							Delete
						</Button>
						<Button
							disabled={!detailsJobId}
							onClick={() => {
								if (!detailsJobId) return
								setDetailsOpen(false)
								setActiveLogJobId(detailsJobId)
								setLogsOpen(true)
								logsMutation.mutate(detailsJobId)
							}}
						>
							Open logs
						</Button>
					</Space>
				}
			>
				{jobDetailsQuery.isError ? (
					<Alert type="error" showIcon message="Failed to load job" description={formatErr(jobDetailsQuery.error)} />
				) : null}

				{detailsJobId ? (
					jobDetailsQuery.data ? (
						<>
							<Descriptions size="small" bordered column={1}>
								<Descriptions.Item label="ID">
									<Typography.Text code>{jobDetailsQuery.data.id}</Typography.Text>
								</Descriptions.Item>
								<Descriptions.Item label="Type">{jobDetailsQuery.data.type}</Descriptions.Item>
								<Descriptions.Item label="Status">
									<Tag color={statusColor(jobDetailsQuery.data.status)}>{jobDetailsQuery.data.status}</Tag>
								</Descriptions.Item>
								<Descriptions.Item label="Progress">
									{jobDetailsQuery.data.progress?.objectsDone || jobDetailsQuery.data.progress?.bytesDone ? (
										<Typography.Text type="secondary">
											{formatProgress(jobDetailsQuery.data.progress)}
										</Typography.Text>
									) : (
										<Typography.Text type="secondary">-</Typography.Text>
									)}
								</Descriptions.Item>
								<Descriptions.Item label="Created">
									<Typography.Text code>{jobDetailsQuery.data.createdAt}</Typography.Text>
								</Descriptions.Item>
								<Descriptions.Item label="Started">
									{jobDetailsQuery.data.startedAt ? (
										<Typography.Text code>{jobDetailsQuery.data.startedAt}</Typography.Text>
									) : (
										<Typography.Text type="secondary">-</Typography.Text>
									)}
								</Descriptions.Item>
								<Descriptions.Item label="Finished">
									{jobDetailsQuery.data.finishedAt ? (
										<Typography.Text code>{jobDetailsQuery.data.finishedAt}</Typography.Text>
									) : (
										<Typography.Text type="secondary">-</Typography.Text>
									)}
								</Descriptions.Item>
								<Descriptions.Item label="Error">
									{jobDetailsQuery.data.error ? (
										<Typography.Text type="danger">{jobDetailsQuery.data.error}</Typography.Text>
									) : (
										<Typography.Text type="secondary">-</Typography.Text>
									)}
								</Descriptions.Item>
							</Descriptions>

							<Typography.Title level={5} style={{ marginTop: 16 }}>
								Payload
							</Typography.Title>
							<pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
								{JSON.stringify(jobDetailsQuery.data.payload, null, 2)}
							</pre>
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

				<Drawer
					open={logsOpen}
					onClose={() => setLogsOpen(false)}
				title="Job Logs"
				width={screens.md ? 720 : '100%'}
				extra={
					<Space>
						<Button
							icon={<ReloadOutlined />}
							disabled={!activeLogJobId}
							loading={logsMutation.isPending}
							onClick={() => activeLogJobId && logsMutation.mutate(activeLogJobId)}
						>
							Refresh
						</Button>
						<Space>
							<Typography.Text type="secondary">Follow</Typography.Text>
							<Switch checked={followLogs} onChange={(v) => setFollowLogs(v)} />
						</Space>
					</Space>
				}
			>
				{activeLogJobId ? (
					<div ref={logsContainerRef} style={{ maxHeight: '75vh', overflow: 'auto' }}>
						<pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
							{(logByJobId[activeLogJobId] ?? []).join('\n')}
						</pre>
					</div>
				) : (
					<Typography.Text type="secondary">Select a job</Typography.Text>
				)}
			</Drawer>
		</Space>
	)
}

function statusColor(s: JobStatus): string {
	switch (s) {
		case 'queued':
			return 'default'
		case 'running':
			return 'processing'
		case 'succeeded':
			return 'success'
		case 'failed':
			return 'error'
		case 'canceled':
			return 'warning'
	}
}

function buildWSURL(apiToken: string, afterSeq?: number): string {
	const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
	const base = `${proto}//${window.location.host}/api/v1/ws`
	const qs = new URLSearchParams()
	if (apiToken) qs.set('apiToken', apiToken)
	qs.set('includeLogs', 'false')
	if (afterSeq && afterSeq > 0) qs.set('afterSeq', String(afterSeq))
	const q = qs.toString()
	return q ? `${base}?${q}` : base
}

function buildSSEURL(apiToken: string, afterSeq?: number): string {
	const base = `${window.location.protocol}//${window.location.host}/api/v1/events`
	const qs = new URLSearchParams()
	if (apiToken) qs.set('apiToken', apiToken)
	qs.set('includeLogs', 'false')
	if (afterSeq && afterSeq > 0) qs.set('afterSeq', String(afterSeq))
	const q = qs.toString()
	return q ? `${base}?${q}` : base
}

function formatErr(err: unknown): string {
	if (err instanceof APIError) return `${err.code}: ${err.message}`
	if (err instanceof Error) return err.message
	return 'unknown error'
}

function updateJob(
	old: InfiniteData<JobsListResponse, string | undefined> | undefined,
	jobId: string,
	patch: (job: Job) => Job,
): InfiniteData<JobsListResponse, string | undefined> | undefined {
	if (!old) return old

	let changed = false
	const nextPages = old.pages.map((page) => {
		const idx = page.items.findIndex((j) => j.id === jobId)
		if (idx < 0) return page
		const nextItems = page.items.slice()
		nextItems[idx] = patch(nextItems[idx])
		changed = true
		return { ...page, items: nextItems }
	})
	if (!changed) return old
	return { ...old, pages: nextPages }
}

function jobSummary(job: Job): string | null {
	const bucket = getString(job.payload, 'bucket')
	const prefix = getString(job.payload, 'prefix')
	const localPath = getString(job.payload, 'localPath')
	const uploadId = getString(job.payload, 'uploadId')
	const deleteAll = getBool(job.payload, 'deleteAll')
	const fullReindex = getBool(job.payload, 'fullReindex')
	const srcBucket = getString(job.payload, 'srcBucket')
	const srcKey = getString(job.payload, 'srcKey')
	const srcPrefix = getString(job.payload, 'srcPrefix')
	const dstBucket = getString(job.payload, 'dstBucket')
	const dstKey = getString(job.payload, 'dstKey')
	const dstPrefix = getString(job.payload, 'dstPrefix')
	const dryRun = getBool(job.payload, 'dryRun')

	const tag = dryRun ? ' (dry-run)' : ''

	switch (job.type) {
		case 's3_zip_prefix': {
			if (!bucket) return `zip ?${tag}`
			const src = prefix ? `s3://${bucket}/${prefix}*` : `s3://${bucket}/*`
			return `zip ${src}`
		}
		case 's3_zip_objects': {
			if (!bucket) return `zip ?${tag}`
			const keys = job.payload['keys']
			const count = Array.isArray(keys) ? keys.length : 0
			return count ? `zip ${count} object(s) in s3://${bucket}` : `zip selection in s3://${bucket}`
		}
		case 's3_delete_objects': {
			if (!bucket) return `delete ?${tag}`
			const keys = job.payload['keys']
			const count = Array.isArray(keys) ? keys.length : 0
			return count ? `delete ${count} object(s) in s3://${bucket}${tag}` : `delete objects in s3://${bucket}${tag}`
		}
		case 's5cmd_sync_local_to_s3': {
			const dst = bucket ? `s3://${bucket}/${prefix ?? ''}` : 's3://?'
			const src = localPath ?? '?'
			return `${src} → ${dst}${tag}`
		}
		case 's5cmd_sync_s3_to_local': {
			const src = bucket ? `s3://${bucket}/${prefix ?? ''}` : 's3://?'
			const dst = localPath ?? '?'
			return `${src} → ${dst}${tag}`
		}
		case 's5cmd_sync_staging_to_s3': {
			return uploadId ? `upload ${uploadId}${tag}` : `upload ?${tag}`
		}
		case 's5cmd_rm_prefix': {
			if (!bucket) return `rm ?${tag}`
			if (deleteAll) return `rm s3://${bucket}/*${tag}`
			if (prefix) return `rm s3://${bucket}/${prefix}*${tag}`
			return `rm s3://${bucket}/?${tag}`
		}
			case 's5cmd_cp_s3_to_s3': {
				if (!srcBucket || !srcKey || !dstBucket || !dstKey) return `cp ?${tag}`
				return `cp s3://${srcBucket}/${srcKey} → s3://${dstBucket}/${dstKey}${tag}`
			}
			case 's5cmd_mv_s3_to_s3': {
				if (!srcBucket || !srcKey || !dstBucket || !dstKey) return `mv ?${tag}`
				return `mv s3://${srcBucket}/${srcKey} → s3://${dstBucket}/${dstKey}${tag}`
			}
			case 's5cmd_cp_s3_to_s3_batch': {
				if (!srcBucket || !dstBucket) return `cp ?${tag}`
				const items = job.payload['items']
				const count = Array.isArray(items) ? items.length : 0
				const first = Array.isArray(items) && items.length ? (items[0] as Record<string, unknown>) : null
				const firstDstKey = first && typeof first['dstKey'] === 'string' ? String(first['dstKey']) : ''
				const dstHint = firstDstKey ? parentPrefixFromKey(firstDstKey) : ''
				return count ? `cp ${count} object(s) → s3://${dstBucket}/${dstHint}${tag}` : `cp batch s3://${srcBucket} → s3://${dstBucket}${tag}`
			}
			case 's5cmd_mv_s3_to_s3_batch': {
				if (!srcBucket || !dstBucket) return `mv ?${tag}`
				const items = job.payload['items']
				const count = Array.isArray(items) ? items.length : 0
				const first = Array.isArray(items) && items.length ? (items[0] as Record<string, unknown>) : null
				const firstDstKey = first && typeof first['dstKey'] === 'string' ? String(first['dstKey']) : ''
				const dstHint = firstDstKey ? parentPrefixFromKey(firstDstKey) : ''
				return count ? `mv ${count} object(s) → s3://${dstBucket}/${dstHint}${tag}` : `mv batch s3://${srcBucket} → s3://${dstBucket}${tag}`
			}
			case 's5cmd_cp_s3_prefix_to_s3_prefix': {
				if (!srcBucket || !srcPrefix || !dstBucket) return `cp ?${tag}`
				const dst = dstPrefix ? `s3://${dstBucket}/${dstPrefix}` : `s3://${dstBucket}/`
				return `cp s3://${srcBucket}/${srcPrefix}* → ${dst}${tag}`
			}
		case 's5cmd_mv_s3_prefix_to_s3_prefix': {
			if (!srcBucket || !srcPrefix || !dstBucket) return `mv ?${tag}`
			const dst = dstPrefix ? `s3://${dstBucket}/${dstPrefix}` : `s3://${dstBucket}/`
			return `mv s3://${srcBucket}/${srcPrefix}* → ${dst}${tag}`
		}
		case 's3_index_objects': {
			if (!bucket) return 'index ?'
			const range = prefix ? `s3://${bucket}/${prefix}*` : `s3://${bucket}/*`
			return `index ${range}${fullReindex ? '' : ' (incremental)'}`
		}
		default:
			return null
	}
}

function getString(payload: Record<string, unknown>, key: string): string | null {
	const v = payload[key]
	return typeof v === 'string' && v.trim() ? v : null
}

	function getBool(payload: Record<string, unknown>, key: string): boolean {
		return payload[key] === true
	}

	function parentPrefixFromKey(key: string): string {
		const trimmed = key.replace(/\/+$/, '')
		const parts = trimmed.split('/').filter(Boolean)
		if (parts.length <= 1) return ''
		parts.pop()
		return parts.join('/') + '/'
	}

	function CreateJobModal(props: {
	api: APIClient
	profileId: string | null
	open: boolean
	onCancel: () => void
	onSubmit: (payload: {
		bucket: string
		prefix: string
		localPath: string
		deleteExtraneous: boolean
		include: string[]
		exclude: string[]
		dryRun: boolean
	}) => void
	loading: boolean
	bucket: string
	setBucket: (v: string) => void
	bucketOptions: { label: string; value: string }[]
}) {
	const screens = Grid.useBreakpoint()
	const drawerWidth = screens.md ? 520 : '100%'
	const [form] = Form.useForm<{
		bucket: string
		prefix: string
		localPath: string
		deleteExtraneous: boolean
		include: string
		exclude: string
		dryRun: boolean
	}>()
	const [browseOpen, setBrowseOpen] = useState(false)

	return (
		<Drawer
			open={props.open}
			onClose={() => {
				setBrowseOpen(false)
				props.onCancel()
			}}
			title="Create s5cmd sync job (local → S3)"
			width={drawerWidth}
			extra={
				<Space>
					<Button
						onClick={() => {
							setBrowseOpen(false)
							props.onCancel()
						}}
					>
						Close
					</Button>
					<Button type="primary" loading={props.loading} onClick={() => form.submit()}>
						Create
					</Button>
				</Space>
			}
		>
			<Form
				form={form}
				layout="vertical"
				initialValues={{
					bucket: props.bucket,
					prefix: '',
					localPath: '',
					deleteExtraneous: false,
					include: '',
					exclude: '',
					dryRun: false,
				}}
				onFinish={(values) => {
					setBrowseOpen(false)
					props.setBucket(values.bucket)
					props.onSubmit({
						bucket: values.bucket,
						prefix: values.prefix,
						localPath: values.localPath,
						deleteExtraneous: values.deleteExtraneous,
						include: splitLines(values.include),
						exclude: splitLines(values.exclude),
						dryRun: values.dryRun,
					})
				}}
			>
				<Form.Item name="bucket" label="Bucket" rules={[{ required: true }]}>
					<AutoComplete
						options={props.bucketOptions}
						filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
					>
						<Input placeholder="my-bucket" />
					</AutoComplete>
				</Form.Item>
				<Form.Item name="prefix" label="Prefix (optional)">
					<Input placeholder="path/" />
				</Form.Item>
				<Form.Item name="localPath" label="Local Path" rules={[{ required: true }]}>
					<LocalPathInput
						api={props.api}
						profileId={props.profileId}
						placeholder="/path/to/folder"
						onBrowse={() => setBrowseOpen(true)}
						disabled={!props.profileId}
						browseDisabled={!props.profileId}
					/>
				</Form.Item>
				<Form.Item name="deleteExtraneous" label="Delete Extraneous (s5cmd --delete)" valuePropName="checked">
					<Switch />
				</Form.Item>
				<Form.Item name="dryRun" label="Dry run (no changes)" valuePropName="checked">
					<Switch />
				</Form.Item>
				<Form.Item name="include" label="Include patterns (one per line)">
					<Input.TextArea rows={4} placeholder="*.log" />
				</Form.Item>
				<Form.Item name="exclude" label="Exclude patterns (one per line)">
					<Input.TextArea rows={4} placeholder="tmp_*" />
				</Form.Item>
			</Form>

			<LocalPathBrowseModal
				api={props.api}
				profileId={props.profileId}
				open={browseOpen && props.open}
				onCancel={() => setBrowseOpen(false)}
				onSelect={(path) => {
					form.setFieldsValue({ localPath: path })
					setBrowseOpen(false)
				}}
			/>
		</Drawer>
	)
}

function DownloadJobModal(props: {
	api: APIClient
	profileId: string | null
	open: boolean
	onCancel: () => void
	onSubmit: (payload: {
		bucket: string
		prefix: string
		localPath: string
		deleteExtraneous: boolean
		include: string[]
		exclude: string[]
		dryRun: boolean
	}) => void
	loading: boolean
	bucket: string
	setBucket: (v: string) => void
	bucketOptions: { label: string; value: string }[]
	defaultLocalPath: string
}) {
	const screens = Grid.useBreakpoint()
	const drawerWidth = screens.md ? 520 : '100%'
	const [form] = Form.useForm<{
		bucket: string
		prefix: string
		localPath: string
		deleteExtraneous: boolean
		include: string
		exclude: string
		dryRun: boolean
	}>()
	const [browseOpen, setBrowseOpen] = useState(false)

	useEffect(() => {
		if (!props.open) return
		const currentPath = form.getFieldValue('localPath') as string | undefined
		if (!currentPath && props.defaultLocalPath) {
			form.setFieldsValue({ localPath: props.defaultLocalPath })
		}
		const currentBucket = form.getFieldValue('bucket') as string | undefined
		if (!currentBucket && props.bucket) {
			form.setFieldsValue({ bucket: props.bucket })
		}
	}, [form, props.bucket, props.defaultLocalPath, props.open])

	return (
		<Drawer
			open={props.open}
			onClose={() => {
				setBrowseOpen(false)
				props.onCancel()
			}}
			title="Create s5cmd sync job (S3 → local)"
			width={drawerWidth}
			extra={
				<Space>
					<Button
						onClick={() => {
							setBrowseOpen(false)
							props.onCancel()
						}}
					>
						Close
					</Button>
					<Button type="primary" loading={props.loading} onClick={() => form.submit()}>
						Create
					</Button>
				</Space>
			}
		>
			<Alert
				type="info"
				showIcon
				message="Downloads objects via s5cmd sync"
				description="This syncs S3 objects under the given prefix to a local directory on the server."
				style={{ marginBottom: 12 }}
			/>

			<Form
				form={form}
				layout="vertical"
				initialValues={{
					bucket: props.bucket,
					prefix: '',
					localPath: '',
					deleteExtraneous: false,
					include: '',
					exclude: '',
					dryRun: false,
				}}
				onFinish={(values) => {
					setBrowseOpen(false)
					props.setBucket(values.bucket)
					props.onSubmit({
						bucket: values.bucket,
						prefix: values.prefix,
						localPath: values.localPath,
						deleteExtraneous: values.deleteExtraneous,
						include: splitLines(values.include),
						exclude: splitLines(values.exclude),
						dryRun: values.dryRun,
					})
				}}
			>
				<Form.Item name="bucket" label="Bucket" rules={[{ required: true }]}>
					<AutoComplete
						options={props.bucketOptions}
						filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
					>
						<Input placeholder="my-bucket" />
					</AutoComplete>
				</Form.Item>
				<Form.Item name="prefix" label="Prefix (optional)">
					<Input placeholder="path/" />
				</Form.Item>
				<Form.Item name="localPath" label="Local destination path" rules={[{ required: true }]}>
					<LocalPathInput
						api={props.api}
						profileId={props.profileId}
						placeholder="/path/to/folder"
						onBrowse={() => setBrowseOpen(true)}
						disabled={!props.profileId}
						browseDisabled={!props.profileId}
					/>
				</Form.Item>
				<Form.Item name="deleteExtraneous" label="Delete extraneous local files (s5cmd --delete)" valuePropName="checked">
					<Switch />
				</Form.Item>
				<Form.Item name="dryRun" label="Dry run (no changes)" valuePropName="checked">
					<Switch />
				</Form.Item>
				<Form.Item name="include" label="Include patterns (one per line)">
					<Input.TextArea rows={4} placeholder="*.log" />
				</Form.Item>
				<Form.Item name="exclude" label="Exclude patterns (one per line)">
					<Input.TextArea rows={4} placeholder="tmp_*" />
				</Form.Item>
			</Form>

			<LocalPathBrowseModal
				api={props.api}
				profileId={props.profileId}
				open={browseOpen && props.open}
				onCancel={() => setBrowseOpen(false)}
				onSelect={(path) => {
					form.setFieldsValue({ localPath: path })
					setBrowseOpen(false)
				}}
			/>
		</Drawer>
	)
}

function DeletePrefixJobModal(props: {
	open: boolean
	onCancel: () => void
	onSubmit: (payload: {
		bucket: string
		prefix: string
		deleteAll: boolean
		allowUnsafePrefix: boolean
		include: string[]
		exclude: string[]
		dryRun: boolean
	}) => void
	loading: boolean
	bucket: string
	setBucket: (v: string) => void
	bucketOptions: { label: string; value: string }[]
	prefill?: { prefix: string; deleteAll: boolean } | null
}) {
	const screens = Grid.useBreakpoint()
	const drawerWidth = screens.md ? 520 : '100%'
	const [form] = Form.useForm<{
		bucket: string
		prefix: string
		deleteAll: boolean
		confirm: string
		unsafePrefixOk: boolean
		include: string
		exclude: string
		dryRun: boolean
	}>()
	const prevOpenRef = useRef(false)

	useEffect(() => {
		const wasOpen = prevOpenRef.current
		prevOpenRef.current = props.open
		if (!props.open || wasOpen) return
		if (!props.prefill) {
			form.resetFields()
			form.setFieldsValue({ bucket: props.bucket })
			return
		}
		form.setFieldsValue({
			bucket: props.bucket,
			prefix: props.prefill.prefix,
			deleteAll: props.prefill.deleteAll,
			confirm: '',
			unsafePrefixOk: false,
			include: '',
			exclude: '',
			dryRun: false,
		})
	}, [form, props.bucket, props.open, props.prefill])

	return (
		<Drawer
			open={props.open}
			onClose={props.onCancel}
			title="Create s5cmd delete job (S3 rm)"
			width={drawerWidth}
			extra={
				<Space>
					<Button onClick={props.onCancel}>Close</Button>
					<Button type="primary" danger loading={props.loading} onClick={() => form.submit()}>
						Create
					</Button>
				</Space>
			}
		>
			<Alert
				type="warning"
				showIcon
				message="Dangerous operation"
				description="This job deletes remote objects via s5cmd rm. It cannot be undone."
				style={{ marginBottom: 12 }}
			/>

			<Form
				form={form}
				layout="vertical"
				initialValues={{
					bucket: props.bucket,
					prefix: '',
					deleteAll: false,
					confirm: '',
					unsafePrefixOk: false,
					include: '',
					exclude: '',
					dryRun: false,
				}}
				onFinish={(values) => {
					const normalizedPrefix = values.prefix.trim().replace(/^\/+/, '')
					const unsafePrefix = !values.deleteAll && normalizedPrefix !== '' && !normalizedPrefix.endsWith('/')

					props.setBucket(values.bucket)
					props.onSubmit({
						bucket: values.bucket.trim(),
						prefix: values.deleteAll ? '' : normalizedPrefix,
						deleteAll: values.deleteAll,
						allowUnsafePrefix: unsafePrefix,
						include: splitLines(values.include),
						exclude: splitLines(values.exclude),
						dryRun: values.dryRun,
					})
				}}
			>
				<Form.Item name="bucket" label="Bucket" rules={[{ required: true }]}>
					<AutoComplete
						options={props.bucketOptions}
						filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
					>
						<Input placeholder="my-bucket" />
					</AutoComplete>
				</Form.Item>

				<Form.Item name="deleteAll" label="Delete ALL objects in bucket" valuePropName="checked">
					<Switch />
				</Form.Item>

				<Form.Item shouldUpdate={(prev, cur) => prev.deleteAll !== cur.deleteAll} noStyle>
					{({ getFieldValue }) => {
						const deleteAll = getFieldValue('deleteAll')
						const prefix = (getFieldValue('prefix') ?? '') as string
						const normalizedPrefix = typeof prefix === 'string' ? prefix.trim().replace(/^\/+/, '') : ''
						const unsafePrefix = !deleteAll && normalizedPrefix !== '' && !normalizedPrefix.endsWith('/')

						return (
							<>
							<Form.Item
								name="prefix"
								label="Prefix"
								dependencies={['deleteAll']}
								rules={[
									({ getFieldValue }) => ({
										validator: async (_, v: string) => {
											if (getFieldValue('deleteAll')) return
											const normalized = typeof v === 'string' ? v.trim().replace(/^\/+/, '') : ''
											if (!normalized) throw new Error('prefix is required unless deleteAll is enabled')
											if (normalized.includes('*')) throw new Error('wildcards are not allowed')
										},
									}),
								]}
							>
								<Input placeholder="path/" disabled={deleteAll} />
							</Form.Item>

							{unsafePrefix ? (
								<>
									<Alert
										type="warning"
										showIcon
										message="Prefix does not end with '/'"
										description={
											"Without a trailing '/', s5cmd will delete keys matching prefix* (e.g., 'abc' also matches 'abcd'). Prefer using a trailing '/'. To proceed anyway, acknowledge below."
										}
										style={{ marginBottom: 12 }}
									/>
									<Form.Item
										name="unsafePrefixOk"
										valuePropName="checked"
										dependencies={['prefix', 'deleteAll']}
										rules={[
											({ getFieldValue }) => ({
												validator: async (_, v: boolean) => {
													const deleteAll = getFieldValue('deleteAll')
													const prefix = (getFieldValue('prefix') ?? '') as string
													const normalizedPrefix = typeof prefix === 'string' ? prefix.trim().replace(/^\/+/, '') : ''
													const unsafePrefix = !deleteAll && normalizedPrefix !== '' && !normalizedPrefix.endsWith('/')
													if (!unsafePrefix) return
													if (v === true) return
													throw new Error('Acknowledge to proceed')
												},
											}),
										]}
									>
										<Checkbox>I understand and want to proceed</Checkbox>
									</Form.Item>
								</>
							) : null}

							{deleteAll ? (
								<Form.Item
									name="confirm"
									label='Type "DELETE" to confirm'
									rules={[
										{ required: true },
										{
											validator: async (_, v: string) => {
												if (v === 'DELETE') return
												throw new Error('Type DELETE to proceed')
											},
										},
									]}
								>
									<Input placeholder="DELETE" />
								</Form.Item>
							) : null}
						</>
						)
					}}
				</Form.Item>

				<Form.Item name="dryRun" label="Dry run (no changes)" valuePropName="checked">
					<Switch />
				</Form.Item>

				<Form.Item name="include" label="Include patterns (one per line)">
					<Input.TextArea rows={4} placeholder="*.log" />
				</Form.Item>
				<Form.Item name="exclude" label="Exclude patterns (one per line)">
					<Input.TextArea rows={4} placeholder="tmp_*" />
				</Form.Item>
			</Form>
		</Drawer>
	)
}

function splitLines(v: string): string[] {
	return v
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean)
}

function formatProgress(p?: JobProgress | null): string {
	if (!p) return '-'
	const opsDone = p.objectsDone ?? 0
	const opsTotal = p.objectsTotal ?? null
	const opsPerSecond = p.objectsPerSecond ?? 0
	const bytesDone = p.bytesDone ?? 0
	const bytesTotal = p.bytesTotal ?? null
	const speed = p.speedBps ?? 0
	const eta = p.etaSeconds ?? 0
	const parts = []
	if (opsTotal != null) parts.push(`${opsDone}/${opsTotal} ops`)
	else if (opsDone) parts.push(`${opsDone} ops`)

	if (bytesTotal != null) parts.push(`${formatBytes(bytesDone)}/${formatBytes(bytesTotal)}`)
	else if (bytesDone) parts.push(formatBytes(bytesDone))
	if (speed) parts.push(`${formatBytes(speed)}/s`)
	else if (opsPerSecond) parts.push(`${opsPerSecond} ops/s`)
	if (eta) parts.push(`${eta}s eta`)
	return parts.join(' · ') || '-'
}

function formatBytes(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
	let v = bytes
	let i = 0
	while (Math.abs(v) >= 1024 && i < units.length - 1) {
		v /= 1024
		i++
	}
	const digits = i === 0 ? 0 : Math.abs(v) >= 10 ? 1 : 2
	return `${v.toFixed(digits)} ${units[i]}`
}
