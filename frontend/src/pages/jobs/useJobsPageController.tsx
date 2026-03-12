import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Grid, message, theme, type MenuProps } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { APIClient } from '../../api/client'
import type { Bucket, Job, JobCreateRequest, Profile } from '../../api/types'
import { useTransfers } from '../../components/useTransfers'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { withJobQueueRetry } from '../../lib/jobQueue'
import { allJobTypes } from '../../lib/jobTypes'
import { listAllObjects } from '../../lib/objects'
import { measurePerf } from '../../lib/perf'
import { getProviderCapabilities, getUploadCapabilityDisabledReason } from '../../lib/providerCapabilities'
import { getBucketsQueryStaleTimeMs } from '../../lib/queryPolicy'
import { useLocalStorageState } from '../../lib/useLocalStorageState'
import { useIsOffline } from '../../lib/useIsOffline'
import { jobMatchesSearch, jobSummary } from './jobPresentation'
import type { BucketOption, DeleteJobPrefill } from './jobsPageTypes'
import { normalizePrefix as normalizeJobPrefix } from './jobUtils'
import { useJobsActionMutations } from './useJobsActionMutations'
import { useJobsColumnsVisibility } from './useJobsColumnsVisibility'
import { useJobsFilters } from './useJobsFilters'
import { useJobsRealtimeEvents } from './useJobsRealtimeEvents'
import { useJobsTableColumns } from './useJobsTableColumns'
import type { SortState } from './JobsVirtualTable'

type Props = {
  apiToken: string
  profileId: string | null
}

export function useJobsPageController(props: Props) {
  const queryClient = useQueryClient()
  const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
  const transfers = useTransfers()
  const location = useLocation()
  const screens = Grid.useBreakpoint()
  const { token } = theme.useToken()
  const isOffline = useIsOffline()

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
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsJobId, setDetailsJobId] = useState<string | null>(null)
  const [logDrawerRequest, setLogDrawerRequest] = useState<{ jobId: string | null; nonce: number }>({ jobId: null, nonce: 0 })
  const [bucket, setBucket] = useLocalStorageState<string>('bucket', '')
  const [deleteJobPrefill, setDeleteJobPrefill] = useState<DeleteJobPrefill | null>(() => deleteJobInitialPrefill)
  const [sortState, setSortState] = useState<SortState>(null)
  const tableContainerRef = useRef<HTMLDivElement | null>(null)
  const [tableScrollY, setTableScrollY] = useState(480)

  const filters = useJobsFilters()
  const columnsVisibility = useJobsColumnsVisibility()

  const handleJobsDeleted = useCallback((jobIds: string[]) => {
    setDetailsJobId((prev) => {
      if (!prev || !jobIds.includes(prev)) return prev
      setDetailsOpen(false)
      return null
    })
    setLogDrawerRequest((prev) => {
      if (!prev.jobId || !jobIds.includes(prev.jobId)) return prev
      return { jobId: null, nonce: prev.nonce }
    })
  }, [])

  const handleJobDeleted = useCallback((jobId: string) => {
    setDetailsJobId((prev) => {
      if (prev !== jobId) return prev
      setDetailsOpen(false)
      return null
    })
    setLogDrawerRequest((prev) => {
      if (prev.jobId !== jobId) return prev
      return { jobId: null, nonce: prev.nonce }
    })
  }, [])

  const { eventsConnected, eventsTransport, eventsRetryCount, eventsRetryThreshold, retryRealtime } = useJobsRealtimeEvents({
    apiToken: props.apiToken,
    profileId: props.profileId,
    queryClient,
    onJobsDeleted: handleJobsDeleted,
  })

  const { cancelingJobId, retryingJobId, deletingJobId, cancelMutation, retryMutation, deleteJobMutation } =
    useJobsActionMutations({ api, profileId: props.profileId, queryClient, onJobDeleted: handleJobDeleted })

  const openDeleteJobModal = useCallback(() => {
    setDeleteJobPrefill(null)
    setCreateDeleteOpen(true)
  }, [])

  const topActionsMenu = useMemo<MenuProps>(
    () => ({
      items: [
        {
          key: 'new_delete_job',
          icon: <DeleteOutlined />,
          label: 'New Delete Job',
          danger: true,
          disabled: isOffline,
        },
      ],
      onClick: ({ key }) => {
        if (key === 'new_delete_job') openDeleteJobModal()
      },
    }),
    [isOffline, openDeleteJobModal],
  )

  const setTableContainerElement = useCallback((element: HTMLDivElement | null) => {
    tableContainerRef.current = element
  }, [])

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

  const metaQuery = useQuery({
    queryKey: ['meta', props.apiToken],
    queryFn: () => api.getMeta(),
    enabled: !!props.apiToken,
  })
  const profilesQuery = useQuery({
    queryKey: ['profiles', props.apiToken],
    queryFn: () => api.listProfiles(),
    enabled: !!props.apiToken,
  })

  const selectedProfile: Profile | null = useMemo(() => {
    if (!props.profileId) return null
    return profilesQuery.data?.find((profile) => profile.id === props.profileId) ?? null
  }, [profilesQuery.data, props.profileId])

  const profileCapabilities = selectedProfile?.provider
    ? getProviderCapabilities(selectedProfile.provider, metaQuery.data?.capabilities?.providers, selectedProfile)
    : null
  const uploadSupported = profileCapabilities ? profileCapabilities.objectCrud && profileCapabilities.jobTransfer : true
  const uploadDisabledReason = getUploadCapabilityDisabledReason(profileCapabilities)

  const bucketsQuery = useQuery({
    queryKey: ['buckets', props.profileId, props.apiToken],
    queryFn: () => api.listBuckets(props.profileId!),
    enabled: !!props.profileId,
    staleTime: getBucketsQueryStaleTimeMs(selectedProfile?.provider),
  })
  const bucketOptions = (bucketsQuery.data ?? []).map((b: Bucket) => ({ label: b.name, value: b.name }))

  const jobsQuery = useInfiniteQuery({
    queryKey: ['jobs', props.profileId, props.apiToken, filters.statusFilter, filters.typeFilterNormalized, filters.errorCodeFilterNormalized],
    enabled: !!props.profileId,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.listJobs(props.profileId!, {
        limit: 50,
        status: filters.statusFilter === 'all' ? undefined : filters.statusFilter,
        type: filters.typeFilter.trim() ? filters.typeFilter.trim() : undefined,
        errorCode: filters.errorCodeFilter.trim() ? filters.errorCodeFilter.trim() : undefined,
        cursor: pageParam,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: eventsConnected ? false : 5000,
  })

  const handleDeviceUpload = useCallback(async (args: {
    bucket: string
    prefix: string
    files: File[]
    label?: string
    directorySelectionMode?: 'picker' | 'input'
  }) => {
    if (!props.profileId) return
    if (!uploadSupported) {
      message.warning(uploadDisabledReason ?? 'Uploads are not supported by this provider.')
      return
    }
    setDeviceUploadLoading(true)
    try {
      if (args.files.length === 0) {
        message.info('No files selected')
        return
      }
      transfers.queueUploadFiles({
        profileId: props.profileId,
        bucket: args.bucket,
        prefix: args.prefix,
        files: args.files,
        label: args.label,
        directorySelectionMode: args.directorySelectionMode,
      })
      setCreateOpen(false)
    } catch (err) {
      message.error(formatErr(err))
    } finally {
      setDeviceUploadLoading(false)
    }
  }, [props.profileId, transfers, uploadDisabledReason, uploadSupported])

  const handleDeviceDownload = useCallback(async (args: { bucket: string; prefix: string; dirHandle: FileSystemDirectoryHandle; label?: string }) => {
    if (!props.profileId) return
    setDeviceDownloadLoading(true)
    try {
      const normPrefix = normalizeJobPrefix(args.prefix)
      const items = await listAllObjects({ api, profileId: props.profileId, bucket: args.bucket, prefix: normPrefix })
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
  }, [api, props.profileId, transfers])

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

  const jobs = useMemo(
    () => measurePerf('Jobs.flatten', () => jobsQuery.data?.pages.flatMap((p) => p.items) ?? [], { pages: jobsQuery.data?.pages.length ?? 0 }),
    [jobsQuery.data],
  )

  const errorCodeSuggestions = useMemo(() => {
    const uniq = new Set<string>()
    for (const j of jobs) if (j.errorCode) uniq.add(j.errorCode)
    return Array.from(uniq).sort().map((value) => ({ value }))
  }, [jobs])

  const typeFilterSuggestions = useMemo(() => {
    const seen = new Set<string>()
    const out: Array<{ value: string; label?: string }> = []
    for (const t of allJobTypes) {
      seen.add(t.type)
      out.push({ value: t.type, label: t.label })
    }
    for (const j of jobs) {
      if (!j.type || seen.has(j.type)) continue
      seen.add(j.type)
      out.push({ value: j.type, label: j.type })
    }
    return out
  }, [jobs])

  const isLoading = jobsQuery.isFetching && !jobsQuery.isFetchingNextPage
  useEffect(() => {
    updateTableScroll()
  }, [updateTableScroll, bucketsQuery.isError, eventsConnected, eventsRetryCount, jobs.length, jobsQuery.isError])

  const jobSummaryById = useMemo(() => {
    const next = new Map<string, string | null>()
    for (const job of jobs) next.set(job.id, jobSummary(job))
    return next
  }, [jobs])
  const getJobSummary = useCallback((job: Job) => jobSummaryById.get(job.id) ?? null, [jobSummaryById])

  const filteredJobs = useMemo(() => {
    if (!filters.searchFilterNormalized) return jobs
    return jobs.filter((job) => jobMatchesSearch(job, filters.searchFilterNormalized))
  }, [jobs, filters.searchFilterNormalized])

  const jobsStatusSummary = useMemo(() => {
    const summary = { total: filteredJobs.length, active: 0, queued: 0, running: 0, succeeded: 0, failed: 0, canceled: 0 }
    for (const job of filteredJobs) summary[job.status] += 1
    summary.active = summary.queued + summary.running
    return summary
  }, [filteredJobs])

  const openDetailsForJob = useCallback((jobId: string) => {
    setDetailsJobId(jobId)
    setDetailsOpen(true)
  }, [])
  const openLogsForJob = useCallback((jobId: string) => {
    setLogDrawerRequest((prev) => ({ jobId, nonce: prev.nonce + 1 }))
  }, [])
  const requestCancelJob = useCallback((jobId: string) => { cancelMutation.mutate(jobId) }, [cancelMutation])
  const requestRetryJob = useCallback((jobId: string) => { retryMutation.mutate(jobId) }, [retryMutation])
  const requestDeleteJob = useCallback(async (jobId: string) => { await deleteJobMutation.mutateAsync(jobId) }, [deleteJobMutation])

  const columns = useJobsTableColumns({
    mergedColumnVisibility: columnsVisibility.mergedColumnVisibility,
    isOffline,
    isLogsLoading: false,
    activeLogJobId: logDrawerRequest.jobId,
    cancelingJobId,
    retryingJobId,
    deletingJobId,
    cancelPending: cancelMutation.isPending,
    retryPending: retryMutation.isPending,
    deletePending: deleteJobMutation.isPending,
    profileId: props.profileId,
    getJobSummary,
    openDetailsForJob,
    openLogsForJob,
    requestCancelJob,
    requestRetryJob,
    requestDeleteJob,
    queueDownloadJobArtifact: transfers.queueDownloadJobArtifact,
  })

  const renderJobActions = useCallback((job: Job) => {
    const actionColumn = columns.find((column) => column.key === 'actions')
    if (!actionColumn?.render) return null
    return actionColumn.render(undefined, job)
  }, [columns])

  const hasOpenOverlay = createOpen || createDownloadOpen || createDeleteOpen || detailsOpen || logDrawerRequest.jobId !== null
  useEffect(() => {
    if (!sortState) return
    const column = columns.find((c) => c.key === sortState.key)
    if (!column || !column.sorter) setSortState(null)
  }, [columns, sortState])

  const sortedJobs = useMemo(() => {
    if (!sortState) return filteredJobs
    const column = columns.find((c) => c.key === sortState.key)
    const sorter = column?.sorter
    if (!sorter) return filteredJobs
    const next = [...filteredJobs].sort(sorter)
    if (sortState.direction === 'desc') next.reverse()
    return next
  }, [columns, filteredJobs, sortState])

  const queueSummaryLabel = useMemo(() => {
    if (!sortedJobs.length) return 'No visible jobs'
    return `${sortedJobs.length.toLocaleString()} visible`
  }, [sortedJobs.length])

  const themeConfig = useMemo(() => ({
    borderColor: token.colorBorderSecondary,
    bg: token.colorBgContainer,
    hoverBg: token.colorFillAlter,
  }), [token.colorBgContainer, token.colorBorderSecondary, token.colorFillAlter])

  const loadMore = useCallback(() => { void jobsQuery.fetchNextPage() }, [jobsQuery])
  const refreshJobs = useCallback(() => { void jobsQuery.refetch() }, [jobsQuery])

  return {
    api,
    bucket,
    bucketOptions: bucketOptions as BucketOption[],
    bucketsError: bucketsQuery.isError ? bucketsQuery.error : null,
    activeLogJobId: logDrawerRequest.jobId,
    cancelMutation,
    cancelingJobId,
    columns,
    columnOptions: columnsVisibility.columnOptions,
    columnsDirty: columnsVisibility.columnsDirty,
    createDeleteMutation,
    createDeleteOpen,
    createDownloadOpen,
    createOpen,
    deleteJobMutation,
    deleteJobPrefill,
    deletingJobId,
    detailsJobId,
    detailsOpen,
    deviceDownloadLoading,
    deviceUploadLoading,
    errorCodeSuggestions,
    eventsConnected,
    eventsRetryCount,
    eventsRetryThreshold,
    eventsTransport,
    filters,
    getJobSummary,
    hasNextPage: jobsQuery.hasNextPage ?? false,
    isFetchingNextPage: jobsQuery.isFetchingNextPage,
    hasOpenOverlay,
    isCompact: !screens.md,
    isLoading,
    isOffline,
    jobs,
    jobsCount: jobs.length,
    jobsError: jobsQuery.isError ? jobsQuery.error : null,
    jobsRefreshing: jobsQuery.isFetching,
    jobsStatusSummary,
    loadMore,
    logDrawerRequest,
    mergedColumnVisibility: columnsVisibility.mergedColumnVisibility,
    onCloseCreate: () => setCreateOpen(false),
    onCloseDelete: () => {
      setCreateDeleteOpen(false)
      setDeleteJobPrefill(null)
    },
    onCloseDetails: () => setDetailsOpen(false),
    onCloseDownload: () => setCreateDownloadOpen(false),
    onCloseLogs: () => setLogDrawerRequest((prev) => ({ jobId: null, nonce: prev.nonce })),
    onCreateDelete: (values: { bucket: string; prefix: string; deleteAll: boolean; allowUnsafePrefix: boolean; include: string[]; exclude: string[]; dryRun: boolean }) => createDeleteMutation.mutate(values),
    onCreateDownload: (values: { bucket: string; prefix: string; dirHandle: FileSystemDirectoryHandle; label?: string }) => { void handleDeviceDownload(values) },
    onCreateUpload: (values: { bucket: string; prefix: string; files: File[]; label?: string }) => { void handleDeviceUpload(values) },
    onLoadMore: loadMore,
    onOpenCreateDownload: () => setCreateDownloadOpen(true),
    onOpenCreateUpload: () => setCreateOpen(true),
    onOpenDeleteJob: openDeleteJobModal,
    onOpenDetails: openDetailsForJob,
    onOpenLogs: openLogsForJob,
    onRefreshJobs: refreshJobs,
    onRetryRealtime: retryRealtime,
    onSetBucket: setBucket,
    onResetColumns: columnsVisibility.resetColumns,
    onSetColumnVisible: columnsVisibility.setColumnVisible,
    onTableContainerRef: setTableContainerElement,
    onSortChange: setSortState,
    profileId: props.profileId,
    queueSummaryLabel,
    renderJobActions,
    retryMutation,
    retryingJobId,
    retryRealtime,
    screens,
    selectedProfile,
    setDeleteJobPrefill,
    setDetailsJobId,
    setLogDrawerRequest,
    sortState,
    sortedJobs,
    tableScrollY,
    themeConfig,
    topActionsMenu,
    isLogsLoading: false,
    transfers,
    typeFilterSuggestions,
    uploadDisabledReason,
    uploadSupported,
    drawerWidth: screens.md ? 720 : '100%',
    logSearchInputWidth: screens.sm ? 320 : '100%',
    borderRadius: token.borderRadiusLG,
  }
}
