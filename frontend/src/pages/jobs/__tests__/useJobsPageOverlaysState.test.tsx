import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useJobsPageOverlaysState } from '../useJobsPageOverlaysState'

function buildArgs(overrides: Partial<Parameters<typeof useJobsPageOverlaysState>[0]> = {}) {
  return {
    bucket: 'bucket-a',
    bucketOptions: [{ label: 'bucket-a', value: 'bucket-a' }],
    createDeleteOpen: false,
    deleteJobMutation: {
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    },
    deleteJobPrefill: null,
    deletingJobId: null,
    detailsJobId: null,
    detailsOpen: false,
    createDeletePending: false,
    logClearRequest: { jobIds: [], nonce: 0 },
    logDrawerRequest: { jobId: null, nonce: 0 },
    isDesktop: true,
    isWideSearch: true,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    borderRadius: 12,
    cancelDeleteRequests: vi.fn(),
    openLogsForJob: vi.fn(),
    setBucket: vi.fn(),
    setDetailsOpen: vi.fn(),
    setLogDrawerRequest: vi.fn(),
    submitCreateDelete: vi.fn(),
    ...overrides,
  }
}

describe('useJobsPageOverlaysState', () => {
  it('maps create flow, bucket prefill, and responsive layout for the overlays host', () => {
    const args = buildArgs({
      createDeleteOpen: true,
      deleteJobPrefill: { bucket: 'bucket-b', prefix: 'logs/', deleteAll: true },
      isDesktop: false,
      isWideSearch: false,
    })

    const { result } = renderHook(() => useJobsPageOverlaysState(args))

    expect(result.current.hasOpenOverlay).toBe(true)
    expect(result.current.overlaysHost.createFlow.createDeleteOpen).toBe(true)
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
    const submitCreateDelete = vi.fn()
    const args = buildArgs({
      cancelDeleteRequests,
      submitCreateDelete,
    })

    const { result } = renderHook(() => useJobsPageOverlaysState(args))

    act(() => {
      result.current.overlaysHost.createFlow.onCloseDelete()
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

    expect(cancelDeleteRequests).toHaveBeenCalled()
    expect(submitCreateDelete).toHaveBeenCalled()
  })
})
