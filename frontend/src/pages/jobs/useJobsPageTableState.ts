import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { Job } from '../../api/types'
import { allJobTypes } from '../../lib/jobTypes'
import { jobMatchesSearch } from './jobPresentation'
import { useJobsTableColumns } from './useJobsTableColumns'
import type { SortState } from './JobsVirtualTable'
import type { ColumnKey } from './useJobsColumnsVisibility'

type UseJobsPageTableStateArgs = {
  apiToken: string
  profileId: string | null
  isOffline: boolean
  jobs: Job[]
  searchFilterNormalized: string
  mergedColumnVisibility: Record<ColumnKey, boolean>
  activeLogJobId: string | null
  cancelingJobId: string | null
  retryingJobId: string | null
  deletingJobId: string | null
  cancelPending: boolean
  retryPending: boolean
  deletePending: boolean
  isJobsFetching: boolean
  isJobsFetchingNextPage: boolean
  sortState: SortState
  setSortState: (next: SortState) => void
  getJobSummary: (job: Job) => string | null
  openDetailsForJob: (jobId: string) => void
  openLogsForJob: (jobId: string) => void
  requestCancelJob: (jobId: string) => void
  requestRetryJob: (jobId: string) => void
  requestDeleteJob: (jobId: string) => Promise<void>
  queueDownloadJobArtifact: (args: {
    profileId: string
    jobId: string
    label: string
    filenameHint: string
    waitForJob: boolean
  }) => void
}

export function useJobsPageTableState({
  apiToken,
  profileId,
  isOffline,
  jobs,
  searchFilterNormalized,
  mergedColumnVisibility,
  activeLogJobId,
  cancelingJobId,
  retryingJobId,
  deletingJobId,
  cancelPending,
  retryPending,
  deletePending,
  isJobsFetching,
  isJobsFetchingNextPage,
  sortState,
  setSortState,
  getJobSummary,
  openDetailsForJob,
  openLogsForJob,
  requestCancelJob,
  requestRetryJob,
  requestDeleteJob,
  queueDownloadJobArtifact,
}: UseJobsPageTableStateArgs) {
  const tableContainerRef = useRef<HTMLDivElement | null>(null)
  const [tableScrollY, setTableScrollY] = useState(480)

  const columns = useJobsTableColumns({
    mergedColumnVisibility,
    apiToken,
    isOffline,
    isLogsLoading: false,
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
  })

  const updateTableScroll = useCallback(() => {
    const element = tableContainerRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const padding = 24
    const next = Math.max(240, Math.floor(window.innerHeight - rect.top - padding))
    setTableScrollY(next)
  }, [])

  const onTableContainerRef = useCallback((element: HTMLDivElement | null) => {
    tableContainerRef.current = element
    if (element) updateTableScroll()
  }, [updateTableScroll])

  useLayoutEffect(() => {
    updateTableScroll()
    window.addEventListener('resize', updateTableScroll)
    return () => window.removeEventListener('resize', updateTableScroll)
  }, [updateTableScroll])

  const errorCodeSuggestions = useMemo(() => {
    const uniq = new Set<string>()
    for (const job of jobs) if (job.errorCode) uniq.add(job.errorCode)
    return Array.from(uniq).sort().map((value) => ({ value }))
  }, [jobs])

  const typeFilterSuggestions = useMemo(() => {
    const seen = new Set<string>()
    const out: Array<{ value: string; label?: string }> = []
    for (const type of allJobTypes) {
      seen.add(type.type)
      out.push({ value: type.type, label: type.label })
    }
    for (const job of jobs) {
      if (!job.type || seen.has(job.type)) continue
      seen.add(job.type)
      out.push({ value: job.type, label: job.type })
    }
    return out
  }, [jobs])

  const filteredJobs = useMemo(() => {
    if (!searchFilterNormalized) return jobs
    return jobs.filter((job) => jobMatchesSearch(job, searchFilterNormalized))
  }, [jobs, searchFilterNormalized])

  const jobsStatusSummary = useMemo(() => {
    const summary = { total: filteredJobs.length, active: 0, queued: 0, running: 0, succeeded: 0, failed: 0, canceled: 0 }
    for (const job of filteredJobs) summary[job.status] += 1
    summary.active = summary.queued + summary.running
    return summary
  }, [filteredJobs])

  const renderJobActions = useCallback((job: Job) => {
    const actionColumn = columns.find((column) => column.key === 'actions')
    if (!actionColumn?.render) return null
    return actionColumn.render(undefined, job)
  }, [columns])

  useEffect(() => {
    if (!sortState) return
    const column = columns.find((entry) => entry.key === sortState.key)
    if (!column || !column.sorter) setSortState(null)
  }, [columns, setSortState, sortState])

  const sortedJobs = useMemo(() => {
    if (!sortState) return filteredJobs
    const column = columns.find((entry) => entry.key === sortState.key)
    const sorter = column?.sorter
    if (!sorter) return filteredJobs
    const next = [...filteredJobs].sort(sorter)
    if (sortState.direction === 'desc') next.reverse()
    return next
  }, [columns, filteredJobs, sortState])

  return {
    columns,
    errorCodeSuggestions,
    typeFilterSuggestions,
    jobsStatusSummary,
    sortedJobs,
    renderJobActions,
    isLoading: isJobsFetching && !isJobsFetchingNextPage,
    tableScrollY,
    onTableContainerRef,
  }
}
