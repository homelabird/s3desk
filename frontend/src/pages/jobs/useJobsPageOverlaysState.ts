import { useMemo, type Dispatch, type SetStateAction } from 'react'

import type { JobsOverlaysHostBucketState, JobsOverlaysHostCreateFlow, JobsOverlaysHostDetailsState, JobsOverlaysHostLayout, JobsOverlaysHostLogsState } from './JobsOverlaysHost'
import type { BucketOption, DeleteJobPrefill } from './jobsPageTypes'
import type { JobsLogClearRequestState, JobsLogDrawerRequestState } from './useJobsPageSurfaceState'

type Args = {
  bucket: string
  bucketOptions: BucketOption[]
  createDeleteOpen: boolean
  createDownloadOpen: boolean
  createOpen: boolean
  deleteJobMutation: {
    mutateAsync: (jobId: string) => Promise<void>
    isPending: boolean
  }
  deleteJobPrefill: DeleteJobPrefill | null
  deletingJobId: string | null
  detailsJobId: string | null
  detailsOpen: boolean
  deviceDownloadLoading: boolean
  deviceUploadLoading: boolean
  createDeletePending: boolean
  logClearRequest: JobsLogClearRequestState
  logDrawerRequest: JobsLogDrawerRequestState
  uploadSupported: boolean
  uploadDisabledReason: string | null
  bucketLookupErrorDescription?: string | null
  isDesktop: boolean
  isWideSearch: boolean
  borderColor: string
  backgroundColor: string
  borderRadius: number
  cancelDeleteRequests: () => void
  cancelDownloadRequests: () => void
  openLogsForJob: (jobId: string) => void
  setBucket: (next: string) => void
  setCreateDeleteOpen: (next: boolean) => void
  setCreateDownloadOpen: (next: boolean) => void
  setCreateOpen: (next: boolean) => void
  setDetailsOpen: Dispatch<SetStateAction<boolean>>
  setLogDrawerRequest: Dispatch<SetStateAction<JobsLogDrawerRequestState>>
  submitCreateDelete: JobsOverlaysHostCreateFlow['onSubmitDelete']
  submitCreateDownload: JobsOverlaysHostCreateFlow['onSubmitDownload']
  submitCreateUpload: JobsOverlaysHostCreateFlow['onSubmitCreate']
}

export function useJobsPageOverlaysState(args: Args) {
  const {
    backgroundColor,
    borderColor,
    borderRadius,
    bucket,
    bucketOptions,
    cancelDeleteRequests,
    cancelDownloadRequests,
    createDeleteOpen,
    createDeletePending,
    createDownloadOpen,
    createOpen,
    deleteJobMutation,
    deleteJobPrefill,
    deletingJobId,
    detailsJobId,
    detailsOpen,
    deviceDownloadLoading,
    deviceUploadLoading,
    isDesktop,
    isWideSearch,
    logClearRequest,
    logDrawerRequest,
    openLogsForJob,
    setBucket,
    setCreateOpen,
    setDetailsOpen,
    setLogDrawerRequest,
    submitCreateDelete,
    submitCreateDownload,
    submitCreateUpload,
    bucketLookupErrorDescription,
    uploadDisabledReason,
    uploadSupported,
  } = args

  const hasOpenOverlay =
    createOpen ||
    createDownloadOpen ||
    createDeleteOpen ||
    detailsOpen ||
    logDrawerRequest.jobId !== null

  const createFlow = useMemo<JobsOverlaysHostCreateFlow>(() => ({
    createOpen,
    createDownloadOpen,
    createDeleteOpen,
    onCloseCreate: () => setCreateOpen(false),
    onCloseDownload: cancelDownloadRequests,
    onCloseDelete: cancelDeleteRequests,
    onSubmitCreate: submitCreateUpload,
    onSubmitDownload: (values) => { void submitCreateDownload(values) },
    onSubmitDelete: submitCreateDelete,
    uploadLoading: deviceUploadLoading,
    downloadLoading: deviceDownloadLoading,
    deleteLoading: createDeletePending,
    uploadSupported,
    uploadUnsupportedReason: uploadDisabledReason,
    bucketLookupErrorDescription,
  }), [
    bucketLookupErrorDescription,
    cancelDeleteRequests,
    cancelDownloadRequests,
    createDeleteOpen,
    createDeletePending,
    createDownloadOpen,
    createOpen,
    deviceDownloadLoading,
    deviceUploadLoading,
    setCreateOpen,
    submitCreateDelete,
    submitCreateDownload,
    submitCreateUpload,
    uploadDisabledReason,
    uploadSupported,
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
