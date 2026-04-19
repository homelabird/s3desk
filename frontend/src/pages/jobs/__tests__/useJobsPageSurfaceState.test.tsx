import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useJobsPageSurfaceState } from '../useJobsPageSurfaceState'

describe('useJobsPageSurfaceState', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('hydrates delete prefill state on initial render', () => {
    const { result } = renderHook(() =>
      useJobsPageSurfaceState({
        apiToken: 'token-a',
        profileId: 'profile-1',
        initialDeletePrefill: {
          bucket: 'bucket-a',
          prefix: 'logs/',
          deleteAll: true,
        },
      }),
    )

    expect(result.current.createDeleteOpen).toBe(true)
    expect(result.current.deleteJobPrefill).toEqual({
      bucket: 'bucket-a',
      prefix: 'logs/',
      deleteAll: true,
    })
  })

  it('closes transient overlays and invalidates request tokens when the scope changes', () => {
    const { result, rerender } = renderHook(
      (props: { apiToken: string; profileId: string | null }) =>
        useJobsPageSurfaceState({
          ...props,
          initialDeletePrefill: null,
        }),
      {
        initialProps: { apiToken: 'token-a', profileId: 'profile-1' as string | null },
      },
    )

    let staleDownloadToken = 0
    let staleDeleteToken = 0
    act(() => {
      result.current.setCreateOpen(true)
      result.current.setCreateDownloadOpen(true)
      result.current.setCreateDeleteOpen(true)
      result.current.setDetailsOpen(true)
      result.current.setDetailsJobId('job-1')
      result.current.setLogDrawerRequest({ jobId: 'job-1', nonce: 1 })
      result.current.setDeviceUploadLoading(true)
      result.current.setDeviceDownloadLoading(true)
      staleDownloadToken = result.current.beginDownloadRequest()
      staleDeleteToken = result.current.beginDeleteRequest()
    })

    rerender({ apiToken: 'token-b', profileId: 'profile-1' })

    expect(result.current.createOpen).toBe(false)
    expect(result.current.createDownloadOpen).toBe(false)
    expect(result.current.createDeleteOpen).toBe(false)
    expect(result.current.detailsOpen).toBe(false)
    expect(result.current.detailsJobId).toBeNull()
    expect(result.current.logDrawerRequest.jobId).toBeNull()
    expect(result.current.deviceUploadLoading).toBe(false)
    expect(result.current.deviceDownloadLoading).toBe(false)
    expect(result.current.isCurrentDownloadRequest(staleDownloadToken)).toBe(false)
    expect(result.current.isCurrentDeleteRequest(staleDeleteToken)).toBe(false)
  })
})
