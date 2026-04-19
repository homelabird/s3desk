import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useJobsPageOverlaysState } from '../useJobsPageOverlaysState'

function buildArgs(overrides: Partial<Parameters<typeof useJobsPageOverlaysState>[0]> = {}) {
  return {
    bucket: 'bucket-a',
    bucketOptions: [{ label: 'bucket-a', value: 'bucket-a' }],
    createDeleteOpen: false,
    createDownloadOpen: false,
    createOpen: false,
    deleteJobMutation: {
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    },
    deleteJobPrefill: null,
    deletingJobId: null,
    detailsJobId: null,
    detailsOpen: false,
    deviceDownloadLoading: false,
    deviceUploadLoading: false,
    createDeletePending: false,
    logClearRequest: { jobIds: [], nonce: 0 },
    logDrawerRequest: { jobId: null, nonce: 0 },
    uploadSupported: true,
    uploadDisabledReason: null,
    isDesktop: true,
    isWideSearch: true,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    borderRadius: 12,
    cancelDeleteRequests: vi.fn(),
    cancelDownloadRequests: vi.fn(),
    openLogsForJob: vi.fn(),
    setBucket: vi.fn(),
    setCreateDeleteOpen: vi.fn(),
    setCreateDownloadOpen: vi.fn(),
    setCreateOpen: vi.fn(),
    setDetailsOpen: vi.fn(),
    setLogDrawerRequest: vi.fn(),
    submitCreateDelete: vi.fn(),
    submitCreateDownload: vi.fn(),
    submitCreateUpload: vi.fn(),
    ...overrides,
  }
}

describe('useJobsPageOverlaysState', () => {
  it('maps create flow, bucket prefill, and responsive layout for the overlays host', () => {
    const args = buildArgs({
      createDeleteOpen: true,
      deleteJobPrefill: { bucket: 'bucket-b', prefix: 'logs/', deleteAll: true },
      uploadSupported: false,
      uploadDisabledReason: 'Uploads unavailable.',
      isDesktop: false,
      isWideSearch: false,
    })

    const { result } = renderHook(() => useJobsPageOverlaysState(args))

    expect(result.current.hasOpenOverlay).toBe(true)
    expect(result.current.overlaysHost.createFlow.createDeleteOpen).toBe(true)
    expect(result.current.overlaysHost.createFlow.uploadSupported).toBe(false)
    expect(result.current.overlaysHost.createFlow.uploadUnsupportedReason).toBe('Uploads unavailable.')
    expect(result.current.overlaysHost.bucketState.deleteBucket).toBe('bucket-b')
    expect(result.current.overlaysHost.bucketState.deletePrefill).toEqual({
      prefix: 'logs/',
      deleteAll: true,
    })
    expect(result.current.overlaysHost.layout).toEqual({
      drawerWidth: '100%',
      logSearchInputWidth: '100%',
      borderColor: '#ddd',
      backgroundColor: '#fff',
      borderRadius: 12,
    })
  })

  it('derives details delete loading and proxies details/log close actions', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    const setDetailsOpen = vi.fn()
    const setLogDrawerRequest = vi.fn()
    const openLogsForJob = vi.fn()
    const args = buildArgs({
      deleteJobMutation: {
        mutateAsync,
        isPending: true,
      },
      deletingJobId: 'job-1',
      detailsJobId: 'job-1',
      detailsOpen: true,
      logDrawerRequest: { jobId: 'job-2', nonce: 4 },
      logClearRequest: { jobIds: ['job-2'], nonce: 6 },
      setDetailsOpen,
      setLogDrawerRequest,
      openLogsForJob,
    })

    const { result } = renderHook(() => useJobsPageOverlaysState(args))

    expect(result.current.overlaysHost.detailsState.deleteJobLoading).toBe(true)

    await result.current.overlaysHost.detailsState.onDeleteJob('job-1')
    expect(mutateAsync).toHaveBeenCalledWith('job-1')

    act(() => {
      result.current.overlaysHost.detailsState.onCloseDetails()
      result.current.overlaysHost.detailsState.onOpenLogs('job-9')
      result.current.overlaysHost.logsState.onCloseLogs()
    })

    expect(setDetailsOpen).toHaveBeenCalledWith(false)
    expect(openLogsForJob).toHaveBeenCalledWith('job-9')
    expect(result.current.overlaysHost.logsState.logClearRequestJobIds).toEqual(['job-2'])
    expect(result.current.overlaysHost.logsState.logClearRequestNonce).toBe(6)
    expect(setLogDrawerRequest).toHaveBeenCalledWith(expect.any(Function))
    const closeLogsUpdater = setLogDrawerRequest.mock.calls[0]?.[0]
    expect(closeLogsUpdater({ jobId: 'job-2', nonce: 4 })).toEqual({ jobId: null, nonce: 4 })
  })

  it('proxies create-flow submit and close actions to the supplied handlers', () => {
    const cancelDeleteRequests = vi.fn()
    const cancelDownloadRequests = vi.fn()
    const setCreateOpen = vi.fn()
    const submitCreateUpload = vi.fn()
    const submitCreateDownload = vi.fn()
    const submitCreateDelete = vi.fn()
    const args = buildArgs({
      cancelDeleteRequests,
      cancelDownloadRequests,
      setCreateOpen,
      submitCreateUpload,
      submitCreateDownload,
      submitCreateDelete,
    })

    const { result } = renderHook(() => useJobsPageOverlaysState(args))

    act(() => {
      result.current.overlaysHost.createFlow.onCloseCreate()
      result.current.overlaysHost.createFlow.onCloseDownload()
      result.current.overlaysHost.createFlow.onCloseDelete()
      result.current.overlaysHost.createFlow.onSubmitCreate({
        bucket: 'bucket-a',
        prefix: '',
        files: [],
      })
      result.current.overlaysHost.createFlow.onSubmitDownload({
        bucket: 'bucket-a',
        prefix: '',
        dirHandle: { name: 'downloads' } as FileSystemDirectoryHandle,
      })
      result.current.overlaysHost.createFlow.onSubmitDelete({
        bucket: 'bucket-a',
        prefix: '',
        deleteAll: false,
        allowUnsafePrefix: false,
        include: [],
        exclude: [],
        dryRun: false,
      })
    })

    expect(setCreateOpen).toHaveBeenCalledWith(false)
    expect(cancelDownloadRequests).toHaveBeenCalled()
    expect(cancelDeleteRequests).toHaveBeenCalled()
    expect(submitCreateUpload).toHaveBeenCalled()
    expect(submitCreateDownload).toHaveBeenCalled()
    expect(submitCreateDelete).toHaveBeenCalled()
  })
})
