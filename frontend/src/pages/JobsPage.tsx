import { type InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
	Alert,
	AutoComplete,
	Checkbox,
	Button,
	Descriptions,
	Drawer,
	Dropdown,
	Empty,
	Form,
	Grid,
	Input,
	Select,
	Space,
	Spin,
	Table,
	Tag,
	Tooltip,
	Typography,
	message,
	Switch,
	theme,
	type MenuProps,
} from 'antd'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
	DeleteOutlined,
	DownloadOutlined,
	FileTextOutlined,
	InfoCircleOutlined,
	MoreOutlined,
	PlusOutlined,
	RedoOutlined,
	ReloadOutlined,
	SettingOutlined,
	StopOutlined,
} from '@ant-design/icons'
import { useLocation } from 'react-router-dom'

import { APIClient, APIError } from '../api/client'
import { LocalDevicePathInput } from '../components/LocalDevicePathInput'
import { useTransfers } from '../components/useTransfers'
import type { Bucket, Job, JobCreateRequest, JobProgress, JobsListResponse, JobStatus, WSEvent } from '../api/types'
import { withJobQueueRetry } from '../lib/jobQueue'
import { collectFilesFromDirectoryHandle, getDevicePickerSupport, normalizeRelativePath } from '../lib/deviceFs'
import { listAllObjects } from '../lib/objects'
import { confirmDangerAction } from '../lib/confirmDangerAction'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { useIsOffline } from '../lib/useIsOffline'
import { SetupCallout } from '../components/SetupCallout'

type Props = {
	apiToken: string
	profileId: string | null
}

type DeleteJobPrefill = {
	bucket: string
	prefix: string
	deleteAll: boolean
}

type UploadDetailItem = {
	path: string
	key: string
	size?: number
}

type UploadDetails = {
	uploadId?: string
	bucket?: string
	prefix?: string
	label?: string
	rootName?: string
	rootKind?: 'file' | 'folder' | 'collection'
	totalFiles?: number
	totalBytes?: number
	items: UploadDetailItem[]
	itemsTruncated?: boolean
}

type ColumnKey = 'id' | 'type' | 'summary' | 'status' | 'progress' | 'errorCode' | 'error' | 'createdAt' | 'actions'
type ToggleableColumnKey = Exclude<ColumnKey, 'actions'>

const compareText = (left?: string | null, right?: string | null) => (left ?? '').localeCompare(right ?? '')
const compareNumber = (left?: number | null, right?: number | null) => (left ?? 0) - (right ?? 0)
const getProgressSortValue = (job: Job) => {
	const bytes = job.progress?.bytesDone ?? 0
	const ops = job.progress?.objectsDone ?? 0
	const speed = job.progress?.speedBps ?? 0
	if (bytes) return bytes
	if (ops) return ops
	return speed
}
const toTimestamp = (value?: string | null) => {
	if (!value) return 0
	const ts = Date.parse(value)
	return Number.isNaN(ts) ? 0 : ts
}

export function JobsPage(props: Props) {
	const queryClient = useQueryClient()
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
	const transfers = useTransfers()
	const location = useLocation()
	const screens = Grid.useBreakpoint()
	const { token } = theme.useToken()
	const isOffline = useIsOffline()
	const [moveAfterUploadDefault, setMoveAfterUploadDefault] = useLocalStorageState<boolean>('moveAfterUploadDefault', false)
	const [cleanupEmptyDirsDefault, setCleanupEmptyDirsDefault] = useLocalStorageState<boolean>('cleanupEmptyDirsDefault', false)

	const createJobWithRetry = useCallback(
		(req: JobCreateRequest) => {
			if (!props.profileId) throw new Error('profile is required')
			return withJobQueueRetry(() => api.createJob(props.profileId!, req))
		},
		[api, props.profileId],
	)

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
	const [deviceUploadLoading, setDeviceUploadLoading] = useState(false)
	const [deviceDownloadLoading, setDeviceDownloadLoading] = useState(false)
	const [logsOpen, setLogsOpen] = useState(false)
	const [activeLogJobId, setActiveLogJobId] = useState<string | null>(null)
	const [logByJobId, setLogByJobId] = useState<Record<string, string[]>>({})
	const [detailsOpen, setDetailsOpen] = useState(false)
	const [detailsJobId, setDetailsJobId] = useState<string | null>(null)
	const [followLogs, setFollowLogs] = useLocalStorageState('jobsFollowLogs', true)
	const logsContainerRef = useRef<HTMLDivElement | null>(null)
	const logOffsetsRef = useRef<Record<string, number>>({})
	const logRemaindersRef = useRef<Record<string, string>>({})
	const logPollDelayRef = useRef<number>(1500)
	const logPollFailuresRef = useRef<number>(0)
	const [logPollFailures, setLogPollFailures] = useState(0)
	const [logPollPaused, setLogPollPaused] = useState(false)
	const [logPollRetryToken, setLogPollRetryToken] = useState(0)
	const lastSeqRef = useRef<number>(0)
	const [bucket, setBucket] = useLocalStorageState<string>('bucket', '')
	const [eventsConnected, setEventsConnected] = useState(false)
	const [eventsTransport, setEventsTransport] = useState<'ws' | 'sse' | null>(null)
	const [eventsRetryCount, setEventsRetryCount] = useState(0)
	const [eventsManualRetryToken, setEventsManualRetryToken] = useState(0)
	const [statusFilter, setStatusFilter] = useLocalStorageState<JobStatus | 'all'>('jobsStatusFilter', 'all')
	const [typeFilter, setTypeFilter] = useLocalStorageState('jobsTypeFilter', '')
	const [errorCodeFilter, setErrorCodeFilter] = useLocalStorageState('jobsErrorCodeFilter', '')
	const [cancelingJobId, setCancelingJobId] = useState<string | null>(null)
	const [retryingJobId, setRetryingJobId] = useState<string | null>(null)
	const [deletingJobId, setDeletingJobId] = useState<string | null>(null)
	const [deleteJobPrefill, setDeleteJobPrefill] = useState<DeleteJobPrefill | null>(() => deleteJobInitialPrefill)
	const defaultColumnVisibility = useMemo<Record<ColumnKey, boolean>>(
		() => ({
			id: true,
			type: true,
			summary: true,
			status: true,
			progress: true,
			errorCode: true,
			error: true,
			createdAt: true,
			actions: true,
		}),
		[],
	)
	const [columnVisibility, setColumnVisibility] = useLocalStorageState<Record<ColumnKey, boolean>>(
		'jobsColumnVisibility',
		defaultColumnVisibility,
	)
	const mergedColumnVisibility = useMemo<Record<ColumnKey, boolean>>(
		() => ({
			...defaultColumnVisibility,
			...columnVisibility,
			actions: true,
		}),
		[columnVisibility, defaultColumnVisibility],
	)
	const columnOptions = useMemo(() => {
		const options: Array<{ key: ToggleableColumnKey; label: string }> = [
			{ key: 'id', label: 'ID' },
			{ key: 'type', label: 'Type' },
			{ key: 'summary', label: 'Summary' },
			{ key: 'status', label: 'Status' },
			{ key: 'progress', label: 'Progress' },
			{ key: 'errorCode', label: 'Error code' },
			{ key: 'error', label: 'Error' },
			{ key: 'createdAt', label: 'Created' },
		]
		return options
	}, [])
	const columnsDirty = useMemo(
		() => columnOptions.some((option) => mergedColumnVisibility[option.key] !== defaultColumnVisibility[option.key]),
		[columnOptions, mergedColumnVisibility, defaultColumnVisibility],
	)
	const setColumnVisible = useCallback(
		(key: ToggleableColumnKey, next: boolean) => {
			setColumnVisibility((prev) => ({
				...defaultColumnVisibility,
				...prev,
				[key]: next,
			}))
		},
		[defaultColumnVisibility, setColumnVisibility],
	)
	const resetColumns = useCallback(() => {
		setColumnVisibility(defaultColumnVisibility)
	}, [defaultColumnVisibility, setColumnVisibility])
	const logPollBaseMs = 1500
	const logPollMaxMs = 20_000
	const logPollPauseAfter = 3
	const eventsRetryThreshold = 3
	const maxLogLines = 2000
	const tableContainerRef = useRef<HTMLDivElement | null>(null)
	const [tableScrollY, setTableScrollY] = useState(480)

	const updateTableScroll = useCallback(() => {
		const el = tableContainerRef.current
		if (!el) return
		const rect = el.getBoundingClientRect()
		const padding = 24
		const next = Math.max(240, Math.floor(window.innerHeight - rect.top - padding))
		setTableScrollY(next)
	}, [])

	useLayoutEffect(() => {
		updateTableScroll()
		window.addEventListener('resize', updateTableScroll)
		return () => window.removeEventListener('resize', updateTableScroll)
	}, [updateTableScroll])

	const resetLogPolling = useCallback(() => {
		logPollFailuresRef.current = 0
		logPollDelayRef.current = logPollBaseMs
		setLogPollFailures(0)
		setLogPollPaused(false)
	}, [logPollBaseMs])

	const resumeLogPolling = useCallback(() => {
		resetLogPolling()
		setLogPollRetryToken((prev) => prev + 1)
	}, [resetLogPolling])

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

	const uploadDetails = useMemo<UploadDetails | null>(() => {
		const job = jobDetailsQuery.data
		if (!job || job.type !== 'transfer_sync_staging_to_s3') return null
		if (!job.payload || typeof job.payload !== 'object') return null
		const payload = job.payload as Record<string, unknown>
		const prefix = typeof payload['prefix'] === 'string' ? payload['prefix'].trim() : ''
		const rootKindRaw = getString(payload, 'rootKind')
		const rootKind =
			rootKindRaw === 'file' || rootKindRaw === 'folder' || rootKindRaw === 'collection' ? rootKindRaw : undefined
		const itemsRaw = Array.isArray(payload['items']) ? payload['items'] : []
		const items: UploadDetailItem[] = []
		for (const raw of itemsRaw) {
			if (!raw || typeof raw !== 'object') continue
			const item = raw as Record<string, unknown>
			const path = getString(item, 'path')
			const key = getString(item, 'key') ?? (path ? joinKeyWithPrefix(prefix, path) : null)
			if (!path && !key) continue
			const size = getNumber(item, 'size')
			const resolvedKey = key ?? (path ? joinKeyWithPrefix(prefix, path) : '')
			const resolvedPath = path ?? resolvedKey
			if (!resolvedKey || !resolvedPath) continue
			items.push({ path: resolvedPath, key: resolvedKey, size: size ?? undefined })
		}

		const totalFiles = getNumber(payload, 'totalFiles')
		const totalBytes = getNumber(payload, 'totalBytes')

		return {
			uploadId: getString(payload, 'uploadId') ?? undefined,
			bucket: getString(payload, 'bucket') ?? undefined,
			prefix,
			label: getString(payload, 'label') ?? undefined,
			rootName: getString(payload, 'rootName') ?? undefined,
			rootKind,
			totalFiles: totalFiles ?? (items.length ? items.length : undefined),
			totalBytes: totalBytes ?? undefined,
			items,
			itemsTruncated: getBool(payload, 'itemsTruncated') || undefined,
		}
	}, [jobDetailsQuery.data])

	const uploadItemsKey = useMemo(() => {
		if (!uploadDetails || uploadDetails.items.length === 0) return ''
		return uploadDetails.items.map((item) => item.key).join('|')
	}, [uploadDetails])

	const uploadEtagsQuery = useQuery({
		queryKey: ['upload-etags', props.profileId, uploadDetails?.bucket ?? '', uploadItemsKey],
		enabled:
			!!props.profileId &&
			!!uploadDetails?.bucket &&
			uploadDetails.items.length > 0 &&
			detailsOpen &&
			jobDetailsQuery.data?.status === 'succeeded',
		queryFn: async () => {
			if (!props.profileId || !uploadDetails?.bucket) return { etags: {}, failures: 0 }
			const entries = uploadDetails.items
			const results = await Promise.allSettled(
				entries.map((item) =>
					api.getObjectMeta({
						profileId: props.profileId!,
						bucket: uploadDetails.bucket!,
						key: item.key,
					}),
				),
			)
			const etags: Record<string, string | null> = {}
			let failures = 0
			results.forEach((res, index) => {
				const key = entries[index]?.key
				if (!key) return
				if (res.status === 'fulfilled') {
					etags[key] = res.value.etag ?? null
					return
				}
				failures++
				etags[key] = null
			})
			return { etags, failures }
		},
	})

	const uploadTableData = useMemo(() => {
		if (!uploadDetails) return []
		const etags = uploadEtagsQuery.data?.etags ?? {}
		const rootPrefix =
			uploadDetails.rootKind === 'folder' && uploadDetails.rootName ? `${uploadDetails.rootName}/` : null
		return uploadDetails.items.map((item) => ({
			key: item.key,
			path: rootPrefix && item.path.startsWith(rootPrefix) ? item.path.slice(rootPrefix.length) : item.path,
			size: item.size,
			etag: etags[item.key] ?? null,
		}))
	}, [uploadDetails, uploadEtagsQuery.data])

	const uploadTableColumns = useMemo(() => {
		const status = jobDetailsQuery.data?.status
		const etags = uploadEtagsQuery.data?.etags ?? {}
		const isLoading = uploadEtagsQuery.isFetching
		return [
			{
				title: 'Path',
				dataIndex: 'path',
				key: 'path',
				render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
			},
			{
				title: 'Size',
				dataIndex: 'size',
				key: 'size',
				align: 'right' as const,
				render: (value?: number) =>
					value != null ? formatBytes(value) : <Typography.Text type="secondary">-</Typography.Text>,
			},
			{
				title: 'Hash',
				dataIndex: 'etag',
				key: 'etag',
				render: (_: string | null, record: { key: string }) => {
					if (status !== 'succeeded') return <Typography.Text type="secondary">Pending</Typography.Text>
					if (isLoading) return <Typography.Text type="secondary">Loading...</Typography.Text>
					const etag = etags[record.key]
					return etag ? <Typography.Text code>{etag}</Typography.Text> : <Typography.Text type="secondary">-</Typography.Text>
				},
			},
		]
	}, [jobDetailsQuery.data?.status, uploadEtagsQuery.data, uploadEtagsQuery.isFetching])

	const uploadRootLabel = useMemo(() => {
		if (!uploadDetails) return null
		if (uploadDetails.rootKind && uploadDetails.rootName) return `${uploadDetails.rootKind} ${uploadDetails.rootName}`
		if (uploadDetails.rootName) return uploadDetails.rootName
		if (uploadDetails.rootKind === 'collection') return 'collection'
		return null
	}, [uploadDetails])

	const jobsQuery = useInfiniteQuery({
		queryKey: ['jobs', props.profileId, props.apiToken, statusFilter, typeFilter, errorCodeFilter],
		enabled: !!props.profileId,
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) =>
			api.listJobs(props.profileId!, {
				limit: 50,
				status: statusFilter === 'all' ? undefined : statusFilter,
				type: typeFilter.trim() ? typeFilter.trim() : undefined,
				errorCode: errorCodeFilter.trim() ? errorCodeFilter.trim() : undefined,
				cursor: pageParam,
			}),
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		refetchInterval: eventsConnected ? false : 5000,
	})

	const handleDeviceUpload = useCallback(
		async (args: {
			bucket: string
			prefix: string
			dirHandle: FileSystemDirectoryHandle
			label?: string
			moveAfterUpload?: boolean
			cleanupEmptyDirs?: boolean
		}) => {
			if (!props.profileId) return
			setDeviceUploadLoading(true)
			try {
				const files = await collectFilesFromDirectoryHandle(args.dirHandle)
				if (files.length === 0) {
					message.info('No files found in the selected folder')
					return
				}
				const relPaths = files
					.map((file) => {
						const fileWithPath = file as File & { relativePath?: string; webkitRelativePath?: string }
						const relPath = (fileWithPath.relativePath ?? fileWithPath.webkitRelativePath ?? file.name).trim()
						return normalizeRelativePath(relPath || file.name)
					})
					.filter(Boolean)
				transfers.queueUploadFiles({
					profileId: props.profileId,
					bucket: args.bucket,
					prefix: args.prefix,
					files,
					label: args.label,
					moveSource: args.moveAfterUpload
						? {
								rootHandle: args.dirHandle,
								relPaths,
								label: args.label ?? args.dirHandle.name,
								cleanupEmptyDirs: args.cleanupEmptyDirs,
							}
						: undefined,
				})
				setCreateOpen(false)
			} catch (err) {
				message.error(formatErr(err))
			} finally {
				setDeviceUploadLoading(false)
			}
		},
		[props.profileId, transfers],
	)

	const handleDeviceDownload = useCallback(
		async (args: { bucket: string; prefix: string; dirHandle: FileSystemDirectoryHandle; label?: string }) => {
			if (!props.profileId) return
			setDeviceDownloadLoading(true)
			try {
				const normPrefix = normalizePrefix(args.prefix)
				const items = await listAllObjects({
					api,
					profileId: props.profileId,
					bucket: args.bucket,
					prefix: normPrefix,
				})
				if (items.length === 0) {
					message.info('No objects found under this prefix')
					return
				}
				transfers.queueDownloadObjectsToDevice({
					profileId: props.profileId,
					bucket: args.bucket,
					items: items.map((item) => ({ key: item.key, size: item.size })),
					targetDirHandle: args.dirHandle,
					targetLabel: args.label ?? args.dirHandle.name,
					prefix: normPrefix,
				})
				setCreateDownloadOpen(false)
			} catch (err) {
				message.error(formatErr(err))
			} finally {
				setDeviceDownloadLoading(false)
			}
		},
		[api, props.profileId, transfers],
	)

	const createDeleteMutation = useMutation({
		mutationFn: (payload: {
			bucket: string
			prefix: string
			deleteAll: boolean
			allowUnsafePrefix: boolean
			include: string[]
			exclude: string[]
			dryRun: boolean
		}) => createJobWithRetry({ type: 'transfer_delete_prefix', payload }),
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
		mutationFn: (jobId: string) => withJobQueueRetry(() => api.retryJob(props.profileId!, jobId)),
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
				.slice(-maxLogLines)
			setLogByJobId((prev) => ({ ...prev, [jobId]: lines }))
			logOffsetsRef.current[jobId] = nextOffset
			logRemaindersRef.current[jobId] = ''
		},
		onError: (err) => message.error(formatErr(err)),
	})

	useEffect(() => {
		if (!logsOpen || !followLogs || !activeLogJobId) {
			resetLogPolling()
		}
	}, [activeLogJobId, followLogs, logsOpen, resetLogPolling])

	useEffect(() => {
		if (!props.profileId) return
		if (!logsOpen || !followLogs || !activeLogJobId) return
		if (logPollPaused) return

		const jobId = activeLogJobId
		let stopped = false
		let timer: number | null = null

		const scheduleNext = () => {
			if (stopped || logPollPaused) return
			timer = window.setTimeout(() => {
				tick().catch(() => {})
			}, logPollDelayRef.current)
		}

		const recordSuccess = () => {
			if (stopped) return
			if (logPollFailuresRef.current === 0) return
			logPollFailuresRef.current = 0
			logPollDelayRef.current = logPollBaseMs
			setLogPollFailures(0)
		}

		const recordFailure = () => {
			if (stopped) return
			logPollFailuresRef.current += 1
			const failures = logPollFailuresRef.current
			setLogPollFailures(failures)
			logPollDelayRef.current = Math.min(logPollMaxMs, logPollBaseMs * Math.pow(2, failures - 1))
			if (failures >= logPollPauseAfter) {
				setLogPollPaused(true)
			}
		}

		const tick = async () => {
			const offset = logOffsetsRef.current[jobId] ?? 0
			try {
				const { text, nextOffset } = await api.getJobLogsAfterOffset(props.profileId!, jobId, offset, 128 * 1024)
				if (nextOffset < offset) {
					logOffsetsRef.current[jobId] = nextOffset
					logRemaindersRef.current[jobId] = ''
				}
				recordSuccess()
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
					next[jobId] = [...existing, ...newLines].slice(-maxLogLines)
					return next
				})
			} catch {
				recordFailure()
			} finally {
				if (!stopped && !logPollPaused && logPollFailuresRef.current < logPollPauseAfter) {
					scheduleNext()
				}
			}
		}

		tick().catch(() => {})
		return () => {
			stopped = true
			if (timer) window.clearTimeout(timer)
		}
	}, [
		activeLogJobId,
		api,
		followLogs,
		logPollBaseMs,
		logPollMaxMs,
		logPollPauseAfter,
		logPollPaused,
		logPollRetryToken,
		logsOpen,
		props.profileId,
	])

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
		let currentTransport: 'ws' | 'sse' | null = null
		let reconnectTimer: number | null = null
		let wsProbeTimer: number | null = null
		let reconnectAttempt = 0

		const setTransport = (next: 'ws' | 'sse' | null) => {
			currentTransport = next
			setEventsTransport(next)
		}

		const clearReconnectTimer = () => {
			if (reconnectTimer) {
				window.clearTimeout(reconnectTimer)
				reconnectTimer = null
			}
		}

		const clearWsProbeTimer = () => {
			if (wsProbeTimer) {
				window.clearTimeout(wsProbeTimer)
				wsProbeTimer = null
			}
		}

		const scheduleReconnect = () => {
			if (stopped || reconnectTimer) return
			const jitter = Math.floor(Math.random() * 250)
			const delay = Math.min(20_000, 1000 * Math.pow(2, reconnectAttempt) + jitter)
			reconnectAttempt += 1
			setEventsRetryCount(reconnectAttempt)
			reconnectTimer = window.setTimeout(() => {
				reconnectTimer = null
				if (stopped) return
				connectWS()
			}, delay)
		}

		const scheduleWSProbe = () => {
			if (stopped || wsProbeTimer) return
			wsProbeTimer = window.setTimeout(() => {
				wsProbeTimer = null
				if (stopped) return
				if (currentTransport !== 'ws') connectWS()
			}, 15_000)
		}

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
					const payload = msg.payload as { status?: JobStatus; progress?: JobProgress; error?: string; errorCode?: string }
					const status = payload.status
					const progress = payload.progress
					const error = payload.error
					const errorCode = payload.errorCode

					queryClient.setQueriesData(
						{ queryKey: ['jobs'], exact: false },
						(old: InfiniteData<JobsListResponse, string | undefined> | undefined) =>
							updateJob(old, msg.jobId!, (job) => ({
								...job,
								status: status ?? job.status,
								progress: progress ?? job.progress,
								error: error ?? job.error,
								errorCode: errorCode ?? job.errorCode,
							})),
					)
				}
			} catch {
				// ignore
			}
		}

		const connectSSE = () => {
			if (stopped) return
			if (es) {
				try {
					es.close()
				} catch {
					// ignore
				}
			}
			try {
				es = new EventSource(buildSSEURL(props.apiToken, lastSeqRef.current))
			} catch {
				scheduleReconnect()
				return
			}
			es.onopen = () => {
				setTransport('sse')
				setEventsConnected(true)
				setEventsRetryCount(0)
				reconnectAttempt = 0
				scheduleWSProbe()
			}
			es.onerror = () => {
				setTransport('sse')
				setEventsConnected(false)
				scheduleReconnect()
			}
			es.onmessage = (ev) => handleEvent(ev.data)
		}

		const connectWS = () => {
			if (stopped) return
			clearReconnectTimer()
			clearWsProbeTimer()
			if (ws) {
				try {
					ws.close()
				} catch {
					// ignore
				}
				ws = null
			}
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
				scheduleWSProbe()
			}, 1500)

			ws.onopen = () => {
				opened = true
				window.clearTimeout(fallbackTimer)
				setTransport('ws')
				setEventsConnected(true)
				setEventsRetryCount(0)
				reconnectAttempt = 0
				clearWsProbeTimer()
				clearReconnectTimer()
				if (es) {
					try {
						es.close()
					} catch {
						// ignore
					}
					es = null
				}
			}

			const onDisconnect = () => {
				window.clearTimeout(fallbackTimer)
				if (stopped) return
				setTransport(null)
				setEventsConnected(false)
				connectSSE()
				scheduleReconnect()
			}
			ws.onclose = onDisconnect
			ws.onerror = onDisconnect
			ws.onmessage = (ev) => handleEvent(ev.data)
		}

		connectWS()
		return () => {
			stopped = true
			clearWsProbeTimer()
			clearReconnectTimer()
			try {
				ws?.close()
			} catch {
				// ignore
			}
			es?.close()
		}
	}, [eventsManualRetryToken, props.apiToken, props.profileId, queryClient])

	const jobs = useMemo(() => jobsQuery.data?.pages.flatMap((p) => p.items) ?? [], [jobsQuery.data])
	const isLoading = jobsQuery.isFetching && !jobsQuery.isFetchingNextPage
	const showJobsEmpty = !isLoading && jobs.length === 0
	useEffect(() => {
		updateTableScroll()
	}, [updateTableScroll, bucketsQuery.isError, eventsConnected, eventsRetryCount, jobs.length, jobsQuery.isError])
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
			options?: { code?: boolean },
		) => {
			if (!value) return <Typography.Text type="secondary">-</Typography.Text>
			const content = (
				<Typography.Text type={tone} style={clampTextStyle} code={options?.code}>
					{value}
				</Typography.Text>
			)
			const showTooltip = value.length > 32 || value.includes('\n')
			return showTooltip ? <Tooltip title={value}>{content}</Tooltip> : content
		},
		[clampTextStyle],
	)

	const jobSummaryById = useMemo(() => {
		const next = new Map<string, string | null>()
		for (const job of jobs) {
			next.set(job.id, jobSummary(job))
		}
		return next
	}, [jobs])
	const getJobSummary = useCallback((job: Job) => jobSummaryById.get(job.id) ?? null, [jobSummaryById])
	const columns = useMemo(() => {
		const columnDefs = [
			{
				key: 'id',
				title: 'ID',
				dataIndex: 'id',
				width: 220,
				render: (v: string) => renderClampedText(v, undefined, { code: true }),
				sorter: (a: Job, b: Job) => compareText(a.id, b.id),
			},
			{
				key: 'type',
				title: 'Type',
				dataIndex: 'type',
				width: 200,
				render: (v: string) => renderClampedText(v),
				sorter: (a: Job, b: Job) => compareText(a.type, b.type),
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
				render: (v: JobStatus) => <Tag color={statusColor(v)}>{v}</Tag>,
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
				render: (v: string | null | undefined) => renderClampedText(v, 'secondary'),
				sorter: (a: Job, b: Job) => compareText(a.errorCode ?? '', b.errorCode ?? ''),
			},
			{
				key: 'error',
				title: 'Error',
				dataIndex: 'error',
				width: 240,
				render: (v: string | null | undefined) => renderClampedText(v, 'danger'),
				sorter: (a: Job, b: Job) => compareText(a.error ?? '', b.error ?? ''),
			},
			{
				key: 'createdAt',
				title: 'Created',
				dataIndex: 'createdAt',
				width: 220,
				sorter: (a: Job, b: Job) => compareNumber(toTimestamp(a.createdAt), toTimestamp(b.createdAt)),
			},
			{
				key: 'actions',
				title: 'Actions',
				width: 140,
				fixed: 'right' as const,
				align: 'center' as const,
				render: (_: unknown, row: Job) => {
					const isZipJob = row.type === 's3_zip_prefix' || row.type === 's3_zip_objects'
					const canDownloadArtifact = isZipJob && row.status !== 'failed' && row.status !== 'canceled'
					const isCancelDisabled =
						isOffline ||
						(row.status !== 'queued' && row.status !== 'running') ||
						(cancelMutation.isPending && cancelingJobId === row.id)
					const isRetryDisabled =
						isOffline ||
						(row.status !== 'failed' && row.status !== 'canceled') ||
						(retryMutation.isPending && retryingJobId === row.id)
					const isDeleteDisabled =
						isOffline ||
						row.status === 'queued' ||
						row.status === 'running' ||
						(deleteJobMutation.isPending && deletingJobId === row.id)
					const summary = getJobSummary(row)
					const label = summary ? `Artifact: ${summary}` : `Job artifact: ${row.id}`
					const menuItems: MenuProps['items'] = []
					const actionItems: MenuProps['items'] = []
					const openDetails = () => {
						setDetailsJobId(row.id)
						setDetailsOpen(true)
					}
					const openLogs = () => {
						setActiveLogJobId(row.id)
						setLogsOpen(true)
						logsMutation.mutate(row.id)
					}

					menuItems.push(
						{
							key: 'details',
							icon: <InfoCircleOutlined />,
							label: 'Details',
							disabled: isOffline,
							onClick: openDetails,
						},
						{
							key: 'logs',
							icon: <FileTextOutlined />,
							label: 'Logs',
							disabled: isOffline || (logsMutation.isPending && activeLogJobId === row.id),
							onClick: openLogs,
						},
					)

					if (isZipJob) {
						actionItems.push({
							key: 'download',
							icon: <DownloadOutlined />,
							label: 'Download ZIP',
							disabled: isOffline || !canDownloadArtifact,
							onClick: () =>
								transfers.queueDownloadJobArtifact({
									profileId: props.profileId!,
									jobId: row.id,
									label,
									filenameHint: `job-${row.id}.zip`,
									waitForJob: row.status !== 'succeeded',
								}),
						})
					}

					if (actionItems.length) {
						menuItems.push({ type: 'divider' }, ...actionItems)
					}

					menuItems.push({ type: 'divider' })
					menuItems.push({
						key: 'cancel',
						icon: <StopOutlined />,
						label: 'Cancel',
						danger: true,
						disabled: isCancelDisabled,
						onClick: () => cancelMutation.mutate(row.id),
					})

					return (
						<Space size={4}>
							<Tooltip title="Retry">
								<Button
									type="text"
									size="small"
									icon={<RedoOutlined />}
									disabled={isRetryDisabled}
									loading={retryMutation.isPending && retryingJobId === row.id}
									aria-label="Retry"
									onClick={() => retryMutation.mutate(row.id)}
								/>
							</Tooltip>
							<Tooltip title="Delete">
								<Button
									type="text"
									size="small"
									danger
									icon={<DeleteOutlined />}
									disabled={isDeleteDisabled}
									loading={deleteJobMutation.isPending && deletingJobId === row.id}
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
												await deleteJobMutation.mutateAsync(row.id)
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
		cancelMutation,
		cancelingJobId,
		deleteJobMutation,
		deletingJobId,
		getJobSummary,
		isOffline,
		logsMutation,
		mergedColumnVisibility,
		props.profileId,
		renderClampedText,
		retryMutation,
		retryingJobId,
		transfers,
	])

	if (!props.profileId) {
		return <SetupCallout apiToken={props.apiToken} profileId={props.profileId} message="Select a profile to view jobs" />
	}

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
					{!eventsConnected && eventsRetryCount >= eventsRetryThreshold ? (
						<Button size="small" onClick={() => setEventsManualRetryToken((prev) => prev + 1)} disabled={isOffline}>
							Retry realtime
						</Button>
					) : null}
					<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} disabled={isOffline}>
						Upload folder (device)
					</Button>
					<Button icon={<DownloadOutlined />} onClick={() => setCreateDownloadOpen(true)} disabled={isOffline}>
						Download folder (device)
					</Button>
					<Button
						danger
						icon={<DeleteOutlined />}
						onClick={() => {
							setDeleteJobPrefill(null)
							setCreateDeleteOpen(true)
						}}
						disabled={isOffline}
					>
						New Delete Job
					</Button>
				</Space>
			</div>

			{isOffline ? <Alert type="warning" showIcon message="Offline: job actions are disabled." /> : null}
			{!eventsConnected && !isOffline ? (
				<Alert
					type="warning"
					showIcon
					message="Realtime updates disconnected"
					description={
						eventsRetryCount >= eventsRetryThreshold
							? 'Auto-retry paused. Use Retry realtime to reconnect.'
							: eventsRetryCount > 0
								? `Reconnecting… attempt ${eventsRetryCount}`
								: 'Reconnecting…'
					}
				/>
			) : null}

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
					style={{ width: screens.md ? 300 : '100%', maxWidth: '100%' }}
					allowClear
				/>
				<Input
					value={errorCodeFilter}
					onChange={(e) => setErrorCodeFilter(e.target.value)}
					placeholder="error code filter (optional)"
					style={{ width: screens.md ? 240 : '100%', maxWidth: '100%' }}
					allowClear
				/>
				<Dropdown
					trigger={['click']}
					dropdownRender={() => (
						<div
							style={{
								padding: 8,
								width: 220,
								background: token.colorBgElevated,
								border: `1px solid ${token.colorBorderSecondary}`,
								borderRadius: token.borderRadiusLG,
								boxShadow: token.boxShadowSecondary,
							}}
						>
							<Space direction="vertical" size={4} style={{ width: '100%' }}>
								{columnOptions.map((option) => (
									<Checkbox
										key={option.key}
										checked={mergedColumnVisibility[option.key]}
										onChange={(event) => setColumnVisible(option.key, event.target.checked)}
									>
										{option.label}
									</Checkbox>
								))}
								<Button size="small" onClick={resetColumns} disabled={!columnsDirty}>
									Reset columns
								</Button>
							</Space>
						</div>
					)}
				>
					<Button icon={<SettingOutlined />}>Columns</Button>
				</Dropdown>
				<Button icon={<ReloadOutlined />} onClick={() => jobsQuery.refetch()} loading={jobsQuery.isFetching} disabled={isOffline}>
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

			<div ref={tableContainerRef}>
				<Table
					rowKey="id"
					loading={isLoading}
					dataSource={jobs}
					pagination={false}
					tableLayout="fixed"
					scroll={{ x: true, y: tableScrollY }}
					virtual
					locale={{
						emptyText: showJobsEmpty ? (
							<Empty description="No jobs yet">
								<Space wrap>
									<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} disabled={isOffline}>
										Upload folder
									</Button>
									<Button
										danger
										icon={<DeleteOutlined />}
										onClick={() => {
											setDeleteJobPrefill(null)
											setCreateDeleteOpen(true)
										}}
										disabled={isOffline}
									>
										New delete job
									</Button>
								</Space>
							</Empty>
						) : null,
					}}
					columns={columns}
				/>
			</div>

			{jobsQuery.hasNextPage ? (
				<Button
					onClick={() => jobsQuery.fetchNextPage()}
					loading={jobsQuery.isFetchingNextPage}
					disabled={!jobsQuery.hasNextPage || isOffline}
				>
					Load more
				</Button>
			) : null}

			<CreateJobModal
				profileId={props.profileId}
				open={createOpen}
				onCancel={() => setCreateOpen(false)}
				onSubmit={(values) => handleDeviceUpload(values)}
				loading={deviceUploadLoading}
				isOffline={isOffline}
				bucket={bucket}
				setBucket={setBucket}
				bucketOptions={bucketOptions}
				defaultMoveAfterUpload={moveAfterUploadDefault}
				defaultCleanupEmptyDirs={cleanupEmptyDirsDefault}
				onDefaultsChange={(values) => {
					setMoveAfterUploadDefault(values.moveAfterUpload)
					setCleanupEmptyDirsDefault(values.cleanupEmptyDirs)
				}}
			/>

			<DownloadJobModal
				profileId={props.profileId}
				open={createDownloadOpen}
				onCancel={() => setCreateDownloadOpen(false)}
				onSubmit={(values) => handleDeviceDownload(values)}
				loading={deviceDownloadLoading}
				isOffline={isOffline}
				bucket={bucket}
				setBucket={setBucket}
				bucketOptions={bucketOptions}
			/>

			<DeletePrefixJobModal
					open={createDeleteOpen}
					onCancel={() => {
						setCreateDeleteOpen(false)
						setDeleteJobPrefill(null)
					}}
					onSubmit={(values) => createDeleteMutation.mutate(values)}
					loading={createDeleteMutation.isPending}
					isOffline={isOffline}
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
							disabled={!detailsJobId || isOffline}
							loading={jobDetailsQuery.isFetching}
							onClick={() => jobDetailsQuery.refetch()}
						>
							Refresh
						</Button>
						<Button
							danger
							disabled={
								isOffline ||
								!detailsJobId ||
								jobDetailsQuery.data?.status === 'queued' ||
								jobDetailsQuery.data?.status === 'running'
							}
							loading={deleteJobMutation.isPending && deletingJobId === detailsJobId}
							onClick={() => {
								if (!detailsJobId) return
								confirmDangerAction({
									title: 'Delete job record?',
									description: (
										<Space direction="vertical" style={{ width: '100%' }}>
											<Typography.Text>
												Job ID: <Typography.Text code>{detailsJobId}</Typography.Text>
											</Typography.Text>
											<Typography.Text type="secondary">This removes the job record and deletes its log file.</Typography.Text>
										</Space>
									),
									onConfirm: async () => {
										await deleteJobMutation.mutateAsync(detailsJobId)
									},
								})
							}}
						>
							Delete
						</Button>
						<Button
							disabled={!detailsJobId || isOffline}
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
								<Descriptions.Item label="Error code">
									{jobDetailsQuery.data.errorCode ? (
										<Typography.Text code>{jobDetailsQuery.data.errorCode}</Typography.Text>
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

							{uploadDetails ? (
								<>
									<Typography.Title level={5} style={{ marginTop: 16 }}>
										Upload
									</Typography.Title>
									<Descriptions size="small" bordered column={1}>
										<Descriptions.Item label="Destination">
											{uploadDetails.bucket ? (
												<Typography.Text code>
													{formatS3Destination(uploadDetails.bucket, uploadDetails.prefix ?? '')}
												</Typography.Text>
											) : (
												<Typography.Text type="secondary">-</Typography.Text>
											)}
										</Descriptions.Item>
										<Descriptions.Item label="Label">
											{uploadDetails.label ? (
												<Typography.Text>{uploadDetails.label}</Typography.Text>
											) : (
												<Typography.Text type="secondary">-</Typography.Text>
											)}
										</Descriptions.Item>
										<Descriptions.Item label="Root">
											{uploadRootLabel ? (
												<Typography.Text>{uploadRootLabel}</Typography.Text>
											) : (
												<Typography.Text type="secondary">-</Typography.Text>
											)}
										</Descriptions.Item>
										<Descriptions.Item label="Total files">
											{uploadDetails.totalFiles != null ? (
												<Typography.Text>{uploadDetails.totalFiles}</Typography.Text>
											) : (
												<Typography.Text type="secondary">-</Typography.Text>
											)}
										</Descriptions.Item>
										<Descriptions.Item label="Total bytes">
											{uploadDetails.totalBytes != null ? (
												<Typography.Text>{formatBytes(uploadDetails.totalBytes)}</Typography.Text>
											) : (
												<Typography.Text type="secondary">-</Typography.Text>
											)}
										</Descriptions.Item>
									</Descriptions>

									<Typography.Title level={5} style={{ marginTop: 16 }}>
										Files
									</Typography.Title>
									{uploadDetails.items.length ? (
										<>
											{uploadDetails.itemsTruncated ? (
												<Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
													Showing first {uploadDetails.items.length} of{' '}
													{uploadDetails.totalFiles ?? uploadDetails.items.length} files.
												</Typography.Text>
											) : null}
											<Table
												size="small"
												columns={uploadTableColumns}
												dataSource={uploadTableData}
												pagination={uploadTableData.length > 20 ? { pageSize: 20, size: 'small' } : false}
											/>
											{jobDetailsQuery.data?.status !== 'succeeded' ? (
												<Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
													Hashes appear after the job completes.
												</Typography.Text>
											) : uploadEtagsQuery.data?.failures ? (
												<Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
													{uploadEtagsQuery.data.failures} file(s) missing hash data.
												</Typography.Text>
											) : null}
										</>
									) : (
										<Typography.Text type="secondary">No file details recorded for this upload.</Typography.Text>
									)}
								</>
							) : null}

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
					<>
						{logPollPaused ? (
							<Alert
								type="warning"
								showIcon
								message="Log polling paused"
								description={`Paused after ${logPollFailures} failed attempts. Click retry to resume polling.`}
								action={
									<Button size="small" onClick={resumeLogPolling}>
										Retry
									</Button>
								}
								style={{ marginBottom: 12 }}
							/>
						) : null}
						<div ref={logsContainerRef} style={{ maxHeight: '75vh', overflow: 'auto' }}>
							<pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
								{(logByJobId[activeLogJobId] ?? []).join('\n')}
							</pre>
						</div>
					</>
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
	const label = getString(job.payload, 'label')
	const rootName = getString(job.payload, 'rootName')
	const rootKind = getString(job.payload, 'rootKind')
	const totalFiles = getNumber(job.payload, 'totalFiles')
	const totalBytes = getNumber(job.payload, 'totalBytes')
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
		case 'transfer_sync_local_to_s3': {
			const dst = bucket ? `s3://${bucket}/${prefix ?? ''}` : 's3://?'
			const src = localPath ?? '?'
			return `${src} → ${dst}${tag}`
		}
		case 'transfer_sync_s3_to_local': {
			const src = bucket ? `s3://${bucket}/${prefix ?? ''}` : 's3://?'
			const dst = localPath ?? '?'
			return `${src} → ${dst}${tag}`
		}
		case 'transfer_sync_staging_to_s3': {
			const dest = formatS3Destination(bucket, prefix)
			const fileCountLabel = totalFiles != null ? `${totalFiles} file${totalFiles === 1 ? '' : 's'}` : null
			const totalBytesLabel = totalBytes != null ? formatBytes(totalBytes) : null
			const metricLabel = [fileCountLabel, totalBytesLabel].filter(Boolean).join(' · ')
			let subject: string | null = null
			if (rootName) {
				subject = rootKind === 'folder' ? `${rootName}/` : rootName
			} else if (label) {
				subject = label
			} else if (fileCountLabel) {
				subject = fileCountLabel
			} else if (uploadId) {
				subject = uploadId
			} else {
				subject = '?'
			}
			const detail = metricLabel && subject !== metricLabel ? ` (${metricLabel})` : ''
			return dest ? `upload ${subject}${detail} → ${dest}${tag}` : `upload ${subject}${detail}${tag}`
		}
		case 'transfer_delete_prefix': {
			if (!bucket) return `rm ?${tag}`
			if (deleteAll) return `rm s3://${bucket}/*${tag}`
			if (prefix) return `rm s3://${bucket}/${prefix}*${tag}`
			return `rm s3://${bucket}/?${tag}`
		}
		case 'transfer_copy_object': {
			if (!srcBucket || !srcKey || !dstBucket || !dstKey) return `cp ?${tag}`
			return `cp s3://${srcBucket}/${srcKey} → s3://${dstBucket}/${dstKey}${tag}`
		}
		case 'transfer_move_object': {
			if (!srcBucket || !srcKey || !dstBucket || !dstKey) return `mv ?${tag}`
			return `mv s3://${srcBucket}/${srcKey} → s3://${dstBucket}/${dstKey}${tag}`
		}
		case 'transfer_copy_batch': {
			if (!srcBucket || !dstBucket) return `cp ?${tag}`
			const items = job.payload['items']
			const count = Array.isArray(items) ? items.length : 0
			const first = Array.isArray(items) && items.length ? (items[0] as Record<string, unknown>) : null
			const firstDstKey = first && typeof first['dstKey'] === 'string' ? String(first['dstKey']) : ''
			const dstHint = firstDstKey ? parentPrefixFromKey(firstDstKey) : ''
			return count ? `cp ${count} object(s) → s3://${dstBucket}/${dstHint}${tag}` : `cp batch s3://${srcBucket} → s3://${dstBucket}${tag}`
		}
		case 'transfer_move_batch': {
			if (!srcBucket || !dstBucket) return `mv ?${tag}`
			const items = job.payload['items']
			const count = Array.isArray(items) ? items.length : 0
			const first = Array.isArray(items) && items.length ? (items[0] as Record<string, unknown>) : null
			const firstDstKey = first && typeof first['dstKey'] === 'string' ? String(first['dstKey']) : ''
			const dstHint = firstDstKey ? parentPrefixFromKey(firstDstKey) : ''
			return count ? `mv ${count} object(s) → s3://${dstBucket}/${dstHint}${tag}` : `mv batch s3://${srcBucket} → s3://${dstBucket}${tag}`
		}
		case 'transfer_copy_prefix': {
			if (!srcBucket || !srcPrefix || !dstBucket) return `cp ?${tag}`
			const dst = dstPrefix ? `s3://${dstBucket}/${dstPrefix}` : `s3://${dstBucket}/`
			return `cp s3://${srcBucket}/${srcPrefix}* → ${dst}${tag}`
		}
		case 'transfer_move_prefix': {
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

function getNumber(payload: Record<string, unknown>, key: string): number | null {
	const v = payload[key]
	if (typeof v === 'number' && Number.isFinite(v)) return v
	if (typeof v === 'string') {
		const trimmed = v.trim()
		if (!trimmed) return null
		const parsed = Number(trimmed)
		return Number.isFinite(parsed) ? parsed : null
	}
	return null
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

function joinKeyWithPrefix(prefix: string, path: string): string {
	const cleanPrefix = prefix.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
	const cleanPath = path.replace(/\\/g, '/').replace(/^\/+/, '')
	if (!cleanPrefix) return cleanPath
	if (!cleanPath) return cleanPrefix
	return `${cleanPrefix}/${cleanPath}`
}

function formatS3Destination(bucket: string | null, prefix: string | null): string | null {
	if (!bucket) return null
	const cleanPrefix = (prefix ?? '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
	return cleanPrefix ? `s3://${bucket}/${cleanPrefix}` : `s3://${bucket}/`
}

function CreateJobModal(props: {
	profileId: string | null
	open: boolean
	onCancel: () => void
	onSubmit: (payload: {
		bucket: string
		prefix: string
		dirHandle: FileSystemDirectoryHandle
		label?: string
		moveAfterUpload?: boolean
		cleanupEmptyDirs?: boolean
	}) => void
	loading: boolean
	isOffline: boolean
	bucket: string
	setBucket: (v: string) => void
	bucketOptions: { label: string; value: string }[]
	defaultMoveAfterUpload: boolean
	defaultCleanupEmptyDirs: boolean
	onDefaultsChange?: (values: { moveAfterUpload: boolean; cleanupEmptyDirs: boolean }) => void
}) {
	const screens = Grid.useBreakpoint()
	const drawerWidth = screens.md ? 520 : '100%'
	const [form] = Form.useForm<{
		bucket: string
		prefix: string
		localFolder: string
		moveAfterUpload: boolean
		cleanupEmptyDirs: boolean
	}>()
	const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
	const [dirLabel, setDirLabel] = useState('')
	const support = getDevicePickerSupport()

	const canSubmit = !!dirHandle && support.ok && !props.isOffline

	return (
		<Drawer
			open={props.open}
			onClose={props.onCancel}
			title="Upload local folder (device → S3)"
			width={drawerWidth}
			destroyOnClose
			extra={
				<Space>
					<Button onClick={props.onCancel}>Close</Button>
					<Button type="primary" loading={props.loading} onClick={() => form.submit()} disabled={!canSubmit}>
						Upload
					</Button>
				</Space>
			}
		>
			{!support.ok ? (
				<Alert
					type="warning"
					showIcon
					message="Local folder access is not available"
					description={support.reason ?? 'Use HTTPS or localhost in a supported browser.'}
					style={{ marginBottom: 12 }}
				/>
			) : null}
			<Alert
				type="info"
				showIcon
				message="Uploads from this device"
				description="Files are uploaded by the browser and appear in Transfers (not as server jobs)."
				style={{ marginBottom: 12 }}
			/>

			<Form
				form={form}
				layout="vertical"
				initialValues={{
					bucket: props.bucket,
					prefix: '',
					localFolder: '',
					moveAfterUpload: props.defaultMoveAfterUpload,
					cleanupEmptyDirs: props.defaultCleanupEmptyDirs,
				}}
				onFinish={(values) => {
					if (!dirHandle) {
						message.info('Select a local folder first')
						return
					}
					props.setBucket(values.bucket)
					props.onSubmit({
						bucket: values.bucket,
						prefix: values.prefix,
						dirHandle,
						label: dirLabel || dirHandle.name,
						moveAfterUpload: values.moveAfterUpload,
						cleanupEmptyDirs: values.cleanupEmptyDirs,
					})
				}}
				onValuesChange={(_, values) => {
					props.onDefaultsChange?.({
						moveAfterUpload: values.moveAfterUpload,
						cleanupEmptyDirs: values.cleanupEmptyDirs,
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
				<Form.Item name="localFolder" label="Local folder" rules={[{ required: true }]}>
					<LocalDevicePathInput
						placeholder="Select a folder"
						disabled={!support.ok || props.isOffline}
						onPick={(handle) => {
							setDirHandle(handle)
							setDirLabel(handle.name)
						}}
					/>
				</Form.Item>
				<Form.Item name="moveAfterUpload" valuePropName="checked">
					<Checkbox>Move after upload (delete local files after the job succeeds)</Checkbox>
				</Form.Item>
				<Form.Item shouldUpdate={(prev, next) => prev.moveAfterUpload !== next.moveAfterUpload} noStyle>
					{({ getFieldValue }) => (
						<Form.Item name="cleanupEmptyDirs" valuePropName="checked">
							<Checkbox disabled={!getFieldValue('moveAfterUpload')}>Auto-clean empty folders</Checkbox>
						</Form.Item>
					)}
				</Form.Item>
			</Form>
		</Drawer>
	)
}

function DownloadJobModal(props: {
	profileId: string | null
	open: boolean
	onCancel: () => void
	onSubmit: (payload: { bucket: string; prefix: string; dirHandle: FileSystemDirectoryHandle; label?: string }) => void
	loading: boolean
	isOffline: boolean
	bucket: string
	setBucket: (v: string) => void
	bucketOptions: { label: string; value: string }[]
}) {
	const screens = Grid.useBreakpoint()
	const drawerWidth = screens.md ? 520 : '100%'
	const [form] = Form.useForm<{
		bucket: string
		prefix: string
		localFolder: string
	}>()
	const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
	const [dirLabel, setDirLabel] = useState('')
	const support = getDevicePickerSupport()

	const canSubmit = !!dirHandle && support.ok && !props.isOffline

	return (
		<Drawer
			open={props.open}
			onClose={props.onCancel}
			title="Download folder (S3 → device)"
			width={drawerWidth}
			destroyOnClose
			extra={
				<Space>
					<Button onClick={props.onCancel}>Close</Button>
					<Button type="primary" loading={props.loading} onClick={() => form.submit()} disabled={!canSubmit}>
						Download
					</Button>
				</Space>
			}
		>
			{!support.ok ? (
				<Alert
					type="warning"
					showIcon
					message="Local folder access is not available"
					description={support.reason ?? 'Use HTTPS or localhost in a supported browser.'}
					style={{ marginBottom: 12 }}
				/>
			) : null}
			<Alert
				type="info"
				showIcon
				message="Downloads to this device"
				description="Files are saved by the browser and appear in Transfers (not as server jobs)."
				style={{ marginBottom: 12 }}
			/>

			<Form
				form={form}
				layout="vertical"
				initialValues={{
					bucket: props.bucket,
					prefix: '',
					localFolder: '',
				}}
				onFinish={(values) => {
					if (!dirHandle) {
						message.info('Select a local folder first')
						return
					}
					props.setBucket(values.bucket)
					props.onSubmit({
						bucket: values.bucket,
						prefix: values.prefix,
						dirHandle,
						label: dirLabel || dirHandle.name,
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
				<Form.Item name="localFolder" label="Local destination folder" rules={[{ required: true }]}>
					<LocalDevicePathInput
						placeholder="Select a folder"
						disabled={!support.ok || props.isOffline}
						onPick={(handle) => {
							setDirHandle(handle)
							setDirLabel(handle.name)
						}}
					/>
				</Form.Item>
			</Form>
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
	isOffline: boolean
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
			title="Create delete job (S3)"
			width={drawerWidth}
			extra={
				<Space>
					<Button onClick={props.onCancel}>Close</Button>
					<Button type="primary" danger loading={props.loading} onClick={() => form.submit()} disabled={props.isOffline}>
						Create
					</Button>
				</Space>
			}
		>
			<Alert
				type="warning"
				showIcon
				message="Dangerous operation"
				description="This job deletes remote objects via the transfer engine. It cannot be undone."
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
											"Without a trailing '/', delete will match keys with the prefix (e.g., 'abc' also matches 'abcd'). Prefer using a trailing '/'. To proceed anyway, acknowledge below."
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

function normalizePrefix(value: string): string {
	const trimmed = value.trim()
	if (!trimmed) return ''
	const normalized = trimmed.replace(/\\/g, '/')
	return normalized.endsWith('/') ? normalized : `${normalized}/`
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
