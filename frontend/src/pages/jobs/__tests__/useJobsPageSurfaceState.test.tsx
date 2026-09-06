import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useJobsPageSurfaceState } from '../useJobsPageSurfaceState'

describe('useJobsPageSurfaceState', () => {
	it('opens routed job details and reopens the same job on a new navigation', () => {
		const { result, rerender } = renderHook(({ jobRequestKey }) => useJobsPageSurfaceState({
			apiToken: 'token-a', profileId: 'profile-1', initialDeletePrefill: null,
			initialJobId: 'job-1', jobRequestKey,
		}), { initialProps: { jobRequestKey: 'first' } })
		expect(result.current.detailsOpen).toBe(true)
		expect(result.current.detailsJobId).toBe('job-1')
		act(() => result.current.setDetailsOpen(false))
		rerender({ jobRequestKey: 'first' })
		expect(result.current.detailsOpen).toBe(false)
		rerender({ jobRequestKey: 'second' })
		expect(result.current.detailsOpen).toBe(true)
	})

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

  it('applies a routed delete prefill without closing it when route state clears', () => {
    const { result, rerender } = renderHook(
      ({ initialDeletePrefill }) =>
        useJobsPageSurfaceState({
          apiToken: 'token-a',
          profileId: 'profile-1',
          initialDeletePrefill,
        }),
      { initialProps: { initialDeletePrefill: null as null | { bucket: string; prefix: string; deleteAll: boolean } } },
    )

    let staleDeleteToken = 0
    act(() => {
      staleDeleteToken = result.current.beginDeleteRequest()
    })
    rerender({
      initialDeletePrefill: {
        bucket: 'bucket-b',
        prefix: 'archive/',
        deleteAll: false,
      },
    })

    expect(result.current.createDeleteOpen).toBe(true)
    expect(result.current.deleteJobPrefill).toEqual({
      bucket: 'bucket-b',
      prefix: 'archive/',
      deleteAll: false,
    })
    expect(result.current.isCurrentDeleteRequest(staleDeleteToken)).toBe(false)

    rerender({ initialDeletePrefill: null })

    expect(result.current.createDeleteOpen).toBe(true)
    expect(result.current.deleteJobPrefill?.bucket).toBe('bucket-b')
  })

  it('closes transient overlays and invalidates the delete request when the scope changes', () => {
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

    let staleDeleteToken = 0
    act(() => {
      result.current.setCreateDeleteOpen(true)
      result.current.setDetailsOpen(true)
      result.current.setDetailsJobId('job-1')
      result.current.setLogDrawerRequest({ jobId: 'job-1', nonce: 1 })
      staleDeleteToken = result.current.beginDeleteRequest()
    })

    rerender({ apiToken: 'token-b', profileId: 'profile-1' })

    expect(result.current.createDeleteOpen).toBe(false)
    expect(result.current.detailsOpen).toBe(false)
    expect(result.current.detailsJobId).toBeNull()
    expect(result.current.logDrawerRequest.jobId).toBeNull()
    expect(result.current.isCurrentDeleteRequest(staleDeleteToken)).toBe(false)
  })
})
