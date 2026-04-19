import type { QueryClient } from '@tanstack/react-query'
import type { MenuProps } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { useCallback, useMemo } from 'react'

import type { APIClient } from '../../api/client'
import type { Job, JobCreateRequest } from '../../api/types'
import type { TransfersContextValue } from '../../components/Transfers'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { withJobQueueRetry } from '../../lib/jobQueue'
import { buildJobsPagePresentationProps } from './buildJobsPagePresentationProps'
import { jobSummary } from './jobPresentation'
import type { BucketOption, DeleteJobPrefill } from './jobsPageTypes'
import { useJobsColumnsVisibility } from './useJobsColumnsVisibility'
import { useJobsFilters } from './useJobsFilters'
import { useJobsPageCreateFlows } from './useJobsPageCreateFlows'
import { useJobsPageEventActions } from './useJobsPageEventActions'
import { useJobsPageOverlaysState } from './useJobsPageOverlaysState'
import { useJobsPageQueries } from './useJobsPageQueries'
import { useJobsPageSurfaceState } from './useJobsPageSurfaceState'
import { useJobsPageTableState } from './useJobsPageTableState'

type JobsPageControllerThemeToken = {
  colorBorderSecondary: string
  colorBgContainer: string
  colorFillAlter: string
  borderRadiusLG: number
}

type JobsPageControllerScreens = {
  md?: boolean
  sm?: boolean
}

type Props = {
  api: APIClient
  apiToken: string
  isOffline: boolean
  locationState: unknown
  profileId: string | null
  queryClient: QueryClient
  screens: JobsPageControllerScreens
  themeToken: JobsPageControllerThemeToken
  transfers: TransfersContextValue
}

export function getJobsDeletePrefillFromLocationState(locationState: unknown): DeleteJobPrefill | null {
  if (!locationState || typeof locationState !== 'object') return null
  const state = locationState as { openDeleteJob?: unknown; bucket?: unknown; prefix?: unknown; deleteAll?: unknown }
  if (state.openDeleteJob !== true) return null
  const bucketFromState = typeof state.bucket === 'string' ? state.bucket : ''
  if (!bucketFromState.trim()) return null
  const prefixFromState = typeof state.prefix === 'string' ? state.prefix : ''
  const deleteAllFromState = state.deleteAll === true
  return { bucket: bucketFromState, prefix: prefixFromState, deleteAll: deleteAllFromState }
}

export function useJobsPageControllerState(props: Props) {
  const createJobWithRetry = useCallback(
    (req: JobCreateRequest) => {
      if (!props.profileId) throw new Error('profile is required')
      return withJobQueueRetry(() => props.api.jobs.createJob(props.profileId!, req))
    },
    [props.api, props.profileId],
  )

  const deleteJobInitialPrefill = useMemo(
    () => getJobsDeletePrefillFromLocationState(props.locationState),
    [props.locationState],
  )

  const {
    beginDeleteRequest,
    beginDownloadRequest,
    bucket,
    cancelDeleteRequests,
    cancelDownloadRequests,
    createDeleteOpen,
    createDownloadOpen,
    createOpen,
    deleteJobPrefill,
    detailsJobId,
    detailsOpen,
    deviceDownloadLoading,
    deviceUploadLoading,
    isCurrentDeleteRequest,
    isCurrentDownloadRequest,
    logClearRequest,
    logDrawerRequest,
    openDeleteJobModal,
    openDetailsForJob,
    openLogsForJob,
    setBucket,
    setCreateDeleteOpen,
    setCreateDownloadOpen,
    setCreateOpen,
    setDeleteJobPrefill,
    setDetailsJobId,
    setDetailsOpen,
    setLogClearRequest,
    setDeviceDownloadLoading,
    setDeviceUploadLoading,
    setLogDrawerRequest,
    setSortState,
    sortState,
  } = useJobsPageSurfaceState({
    apiToken: props.apiToken,
    profileId: props.profileId,
    initialDeletePrefill: deleteJobInitialPrefill,
  })

  const filters = useJobsFilters(props.apiToken, props.profileId)
  const columnsVisibility = useJobsColumnsVisibility(props.apiToken, props.profileId)

  const {
    cancelingJobId,
    retryingJobId,
    deletingJobId,
    cancelMutation,
    retryMutation,
    deleteJobMutation,
    eventsConnected,
    eventsTransport,
    eventsRetryCount,
    eventsRetryThreshold,
    retryRealtime,
    requestCancelJob,
    requestRetryJob,
    requestDeleteJob,
  } = useJobsPageEventActions({
    api: props.api,
    apiToken: props.apiToken,
    profileId: props.profileId,
    queryClient: props.queryClient,
    setDetailsJobId,
    setDetailsOpen,
    setLogClearRequest,
    setLogDrawerRequest,
  })

  const topActionsMenu = useMemo<MenuProps>(
    () => ({
      items: [
        {
          key: 'new_delete_job',
          icon: <DeleteOutlined />,
          label: 'New Delete Job',
          danger: true,
          disabled: props.isOffline,
        },
      ],
      onClick: ({ key }) => {
        if (key === 'new_delete_job') openDeleteJobModal()
      },
    }),
    [openDeleteJobModal, props.isOffline],
  )

  const { selectedProfile, uploadSupported, uploadDisabledReason, bucketsQuery, bucketOptions, jobsQuery, jobs } =
    useJobsPageQueries({
      api: props.api,
      apiToken: props.apiToken,
      profileId: props.profileId,
      filters: {
        statusFilter: filters.statusFilter,
        typeFilterNormalized: filters.typeFilterNormalized,
        errorCodeFilterNormalized: filters.errorCodeFilterNormalized,
      },
      eventsConnected,
    })
  const bucketLookupErrorDescription = bucketsQuery.isError ? formatErr(bucketsQuery.error) : null

  const {
    createDeleteMutation,
    onCreateDelete: submitCreateDelete,
    onCreateDownload: submitCreateDownload,
    onCreateUpload: submitCreateUpload,
  } = useJobsPageCreateFlows({
    api: props.api,
    apiToken: props.apiToken,
    profileId: props.profileId,
    queryClient: props.queryClient,
    transfers: props.transfers,
    uploadSupported,
    uploadDisabledReason,
    createJobWithRetry,
    beginDownloadRequest,
    isCurrentDownloadRequest,
    setCreateOpen,
    setCreateDownloadOpen,
    setCreateDeleteOpen,
    setDeviceUploadLoading,
    setDeviceDownloadLoading,
    setDeleteJobPrefill,
    beginDeleteRequest,
    isCurrentDeleteRequest,
  })

  const jobSummaryById = useMemo(() => {
    const next = new Map<string, string | null>()
    for (const job of jobs) next.set(job.id, jobSummary(job))
    return next
  }, [jobs])
  const getJobSummary = useCallback((job: Job) => jobSummaryById.get(job.id) ?? null, [jobSummaryById])

  const themeConfig = useMemo(
    () => ({
      borderColor: props.themeToken.colorBorderSecondary,
      bg: props.themeToken.colorBgContainer,
      hoverBg: props.themeToken.colorFillAlter,
    }),
    [props.themeToken.colorBgContainer, props.themeToken.colorBorderSecondary, props.themeToken.colorFillAlter],
  )

  const {
    columns,
    errorCodeSuggestions,
    typeFilterSuggestions,
    jobsStatusSummary,
    sortedJobs,
    renderJobActions,
    isLoading,
    tableScrollY,
    onTableContainerRef,
  } = useJobsPageTableState({
    apiToken: props.apiToken,
    profileId: props.profileId,
    isOffline: props.isOffline,
    jobs,
    searchFilterNormalized: filters.searchFilterNormalized,
    mergedColumnVisibility: columnsVisibility.mergedColumnVisibility,
    activeLogJobId: logDrawerRequest.jobId,
    cancelingJobId,
    retryingJobId,
    deletingJobId,
    cancelPending: cancelMutation.isPending,
    retryPending: retryMutation.isPending,
    deletePending: deleteJobMutation.isPending,
    isJobsFetching: jobsQuery.isFetching,
    isJobsFetchingNextPage: jobsQuery.isFetchingNextPage,
    sortState,
    setSortState,
    getJobSummary,
    openDetailsForJob,
    openLogsForJob,
    requestCancelJob,
    requestRetryJob,
    requestDeleteJob,
    queueDownloadJobArtifact: props.transfers.queueDownloadJobArtifact,
  })

  const loadMore = useCallback(() => {
    void jobsQuery.fetchNextPage()
  }, [jobsQuery])
  const refreshJobs = useCallback(() => {
    void jobsQuery.refetch()
  }, [jobsQuery])

  const { hasOpenOverlay, overlaysHost } = useJobsPageOverlaysState({
    bucket,
    bucketOptions: bucketOptions as BucketOption[],
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
    createDeletePending: createDeleteMutation.isPending,
    logClearRequest,
    logDrawerRequest,
    uploadSupported,
    uploadDisabledReason,
    bucketLookupErrorDescription,
    isDesktop: !!props.screens.md,
    isWideSearch: !!props.screens.sm,
    borderColor: themeConfig.borderColor,
    backgroundColor: themeConfig.bg,
    borderRadius: props.themeToken.borderRadiusLG,
    cancelDeleteRequests,
    cancelDownloadRequests,
    openLogsForJob,
    setBucket,
    setCreateDeleteOpen,
    setCreateDownloadOpen,
    setCreateOpen,
    setDetailsOpen,
    setLogDrawerRequest,
    submitCreateDelete,
    submitCreateDownload,
    submitCreateUpload,
  })

  const presentation = buildJobsPagePresentationProps({
    apiToken: props.apiToken,
    profileId: props.profileId,
    activeProfileName: selectedProfile?.name ?? null,
    isOffline: props.isOffline,
    uploadSupported,
    uploadDisabledReason,
    bucketLookupErrorDescription,
    eventsConnected,
    eventsTransport,
    eventsRetryCount,
    eventsRetryThreshold,
    onRetryRealtime: retryRealtime,
    onOpenCreateUpload: () => setCreateOpen(true),
    onOpenCreateDownload: () => setCreateDownloadOpen(true),
    onOpenDeleteJob: openDeleteJobModal,
    topActionsMenu,
    statusFilter: filters.statusFilter,
    onStatusFilterChange: filters.setStatusFilter,
    searchFilterNormalized: filters.searchFilterNormalized,
    onSearchFilterChange: filters.setSearchFilter,
    typeFilterNormalized: filters.typeFilterNormalized,
    onTypeFilterChange: filters.setTypeFilter,
    typeFilterSuggestions,
    errorCodeFilterNormalized: filters.errorCodeFilterNormalized,
    onErrorCodeFilterChange: filters.setErrorCodeFilter,
    errorCodeSuggestions,
    filtersDirty: filters.filtersDirty,
    onResetFilters: filters.resetFilters,
    jobsStatusSummary,
    columnOptions: columnsVisibility.columnOptions,
    mergedColumnVisibility: columnsVisibility.mergedColumnVisibility,
    onSetColumnVisible: columnsVisibility.setColumnVisible,
    columnsDirty: columnsVisibility.columnsDirty,
    onResetColumns: columnsVisibility.resetColumns,
    onRefreshJobs: refreshJobs,
    jobsRefreshing: jobsQuery.isFetching,
    jobsCount: jobs.length,
    bucketsError: bucketsQuery.isError ? bucketsQuery.error : null,
    jobsError: jobsQuery.isError ? jobsQuery.error : null,
    sortedJobs,
    columns,
    isCompact: !props.screens.md,
    tableScrollY,
    isLoading,
    getJobSummary,
    renderJobActions,
    sortState,
    onSortChange: setSortState,
    theme: themeConfig,
    hasNextPage: jobsQuery.hasNextPage ?? false,
    onLoadMore: loadMore,
    isFetchingNextPage: jobsQuery.isFetchingNextPage,
    onTableContainerRef,
  })

  return {
    api: props.api,
    hasOpenOverlay,
    isOffline: props.isOffline,
    onOpenCreateDownload: presentation.toolbar.onOpenCreateDownload,
    onOpenCreateUpload: presentation.toolbar.onOpenCreateUpload,
    onOpenDeleteJob: presentation.table.onOpenDeleteJob,
    onOpenDetails: openDetailsForJob,
    overlaysHost,
    presentation,
  }
}
