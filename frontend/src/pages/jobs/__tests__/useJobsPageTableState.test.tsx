import { act, renderHook } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { Job } from '../../../api/types'
import { ensureDomShims } from '../../../test/domShims'
import { useJobsPageTableState } from '../useJobsPageTableState'

beforeAll(() => {
  ensureDomShims()
})

const baseJobs: Job[] = [
  {
    id: 'job-b',
    type: 'transfer_delete_prefix',
    status: 'failed',
    payload: {},
    createdAt: '2026-04-10T00:00:00Z',
    errorCode: 'AccessDenied',
    error: 'delete failed',
  },
  {
    id: 'job-a',
    type: 'custom_sync',
    status: 'queued',
    payload: {},
    createdAt: '2026-04-09T00:00:00Z',
    errorCode: 'SlowDown',
    error: null,
  } as unknown as Job,
]

function buildArgs(overrides: Partial<Parameters<typeof useJobsPageTableState>[0]> = {}) {
  return {
    apiToken: 'token-a',
    profileId: 'profile-1' as string | null,
    isOffline: false,
    jobs: baseJobs,
    searchFilterNormalized: '',
    mergedColumnVisibility: {
      id: true,
      type: true,
      summary: true,
      status: true,
      progress: true,
      errorCode: true,
      error: true,
      createdAt: true,
      actions: true,
    },
    activeLogJobId: null,
    cancelingJobId: null,
    retryingJobId: null,
    deletingJobId: null,
    cancelPending: false,
    retryPending: false,
    deletePending: false,
    isJobsFetching: false,
    isJobsFetchingNextPage: false,
    sortState: { key: 'id', direction: 'desc' as const },
    setSortState: vi.fn(),
    getJobSummary: vi.fn((job: Job) => `summary:${job.id}`),
    openDetailsForJob: vi.fn(),
    openLogsForJob: vi.fn(),
    requestCancelJob: vi.fn(),
    requestRetryJob: vi.fn(),
    requestDeleteJob: vi.fn(),
    queueDownloadJobArtifact: vi.fn(),
    ...overrides,
  }
}

describe('useJobsPageTableState', () => {
  it('derives suggestions, status summary, and sorted jobs from the current job list', () => {
    const { result } = renderHook(() => useJobsPageTableState(buildArgs()))

    expect(result.current.errorCodeSuggestions).toEqual([
      { value: 'AccessDenied' },
      { value: 'SlowDown' },
    ])
    expect(result.current.typeFilterSuggestions).toContainEqual({
      value: 'transfer_delete_prefix',
      label: 'Delete folder/prefix',
    })
    expect(result.current.typeFilterSuggestions).toContainEqual({
      value: 'custom_sync',
      label: 'custom_sync',
    })
    expect(result.current.jobsStatusSummary).toEqual({
      total: 2,
      active: 1,
      queued: 1,
      running: 0,
      succeeded: 0,
      failed: 1,
      canceled: 0,
    })
    expect(result.current.sortedJobs.map((job) => job.id)).toEqual(['job-b', 'job-a'])
  })

  it('clears the active sort when the sorted column disappears', () => {
    const setSortState = vi.fn()
    const { rerender } = renderHook(
      (props: ReturnType<typeof buildArgs>) => useJobsPageTableState(props),
      {
        initialProps: buildArgs({ setSortState }),
      },
    )

    rerender(
      buildArgs({
        setSortState,
        mergedColumnVisibility: {
          id: false,
          type: true,
          summary: true,
          status: true,
          progress: true,
          errorCode: true,
          error: true,
          createdAt: true,
          actions: true,
        },
      }),
    )

    expect(setSortState).toHaveBeenCalledWith(null)
  })

  it('updates table scroll height when the container is attached and resized', () => {
    let top = 120
    const container = {
      getBoundingClientRect: () => ({
        top,
        left: 0,
        bottom: top + 300,
        right: 0,
        width: 0,
        height: 300,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }),
    } as HTMLDivElement

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 900,
    })

    const { result } = renderHook(() =>
      useJobsPageTableState(buildArgs({ sortState: null })),
    )

    act(() => {
      result.current.onTableContainerRef(container)
    })

    expect(result.current.tableScrollY).toBe(756)

    top = 300
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current.tableScrollY).toBe(576)
  })
})
