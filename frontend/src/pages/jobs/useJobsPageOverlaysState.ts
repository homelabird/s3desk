import { useMemo, type Dispatch, type SetStateAction } from 'react'

import type { JobsOverlaysHostBucketState, JobsOverlaysHostCreateFlow, JobsOverlaysHostDetailsState, JobsOverlaysHostLayout, JobsOverlaysHostLogsState } from './JobsOverlaysHost'
import type { BucketOption, DeleteJobPrefill } from './jobsPageTypes'
import type { JobsLogClearRequestState, JobsLogDrawerRequestState } from './useJobsPageSurfaceState'

type Args = {
  bucket: string
  bucketOptions: BucketOption[]
  createDeleteOpen: boolean
  deleteJobMutation: {
    mutateAsync: (jobId: string) => Promise<void>
    isPending: boolean
  }
  deleteJobPrefill: DeleteJobPrefill | null
  deletingJobId: string | null
  detailsJobId: string | null
  detailsOpen: boolean
  createDeletePending: boolean
  logClearRequest: JobsLogClearRequestState
  logDrawerRequest: JobsLogDrawerRequestState
  bucketLookupErrorDescription?: string | null
  isDesktop: boolean
  isWideSearch: boolean
  borderColor: string
  backgroundColor: string
  borderRadius: number
  cancelDeleteRequests: () => void
  openLogsForJob: (jobId: string) => void
  setBucket: (next: string) => void
  setDetailsOpen: Dispatch<SetStateAction<boolean>>
  setLogDrawerRequest: Dispatch<SetStateAction<JobsLogDrawerRequestState>>
  submitCreateDelete: JobsOverlaysHostCreateFlow['onSubmitDelete']
}

export function useJobsPageOverlaysState(args: Args) {
  const {
    backgroundColor,
    borderColor,
    borderRadius,
    bucket,
    bucketOptions,
    cancelDeleteRequests,
    createDeleteOpen,
    createDeletePending,
    deleteJobMutation,
    deleteJobPrefill,
    deletingJobId,
    detailsJobId,
    detailsOpen,
    isDesktop,
    isWideSearch,
    logClearRequest,
    logDrawerRequest,
    openLogsForJob,
    setBucket,
    setDetailsOpen,
    setLogDrawerRequest,
    submitCreateDelete,
    bucketLookupErrorDescription,
  } = args

  const hasOpenOverlay =
    createDeleteOpen ||
    detailsOpen ||
    logDrawerRequest.jobId !== null

  const createFlow = useMemo<JobsOverlaysHostCreateFlow>(() => ({
    createDeleteOpen,
    onCloseDelete: cancelDeleteRequests,
    onSubmitDelete: submitCreateDelete,
    deleteLoading: createDeletePending,
    bucketLookupErrorDescription,
  }), [
    bucketLookupErrorDescription,
    cancelDeleteRequests,
    createDeleteOpen,
    createDeletePending,
    submitCreateDelete,
  ])

  const bucketState = useMemo<JobsOverlaysHostBucketState>(() => ({
    bucket,
    onBucketChange: setBucket,
    bucketOptions,
    deleteBucket: deleteJobPrefill?.bucket ?? bucket,
    deletePrefill: deleteJobPrefill
      ? { prefix: deleteJobPrefill.prefix, deleteAll: deleteJobPrefill.deleteAll }
      : null,
  }), [bucket, bucketOptions, deleteJobPrefill, setBucket])

  const detailsState = useMemo<JobsOverlaysHostDetailsState>(() => ({
    detailsOpen,
    detailsJobId,
    onCloseDetails: () => setDetailsOpen(false),
    onDeleteJob: (jobId) => deleteJobMutation.mutateAsync(jobId),
    deleteJobLoading: deleteJobMutation.isPending && deletingJobId === detailsJobId,
    onOpenLogs: openLogsForJob,
  }), [
    deleteJobMutation,
    deletingJobId,
    detailsJobId,
    detailsOpen,
    openLogsForJob,
    setDetailsOpen,
  ])

  const logsState = useMemo<JobsOverlaysHostLogsState>(() => ({
    logClearRequestJobIds: logClearRequest.jobIds,
    logClearRequestNonce: logClearRequest.nonce,
    logRequestJobId: logDrawerRequest.jobId,
    logRequestNonce: logDrawerRequest.nonce,
    onCloseLogs: () => setLogDrawerRequest((prev) => ({ jobId: null, nonce: prev.nonce })),
  }), [logClearRequest.jobIds, logClearRequest.nonce, logDrawerRequest.jobId, logDrawerRequest.nonce, setLogDrawerRequest])

  const layout = useMemo<JobsOverlaysHostLayout>(() => ({
    drawerWidth: isDesktop ? 720 : '100%',
    logSearchInputWidth: isWideSearch ? 320 : '100%',
    borderColor,
    backgroundColor,
    borderRadius,
  }), [
    backgroundColor,
    borderColor,
    borderRadius,
    isDesktop,
    isWideSearch,
  ])

  return {
    hasOpenOverlay,
    overlaysHost: {
      createFlow,
      bucketState,
      detailsState,
      logsState,
      layout,
    },
  }
}
