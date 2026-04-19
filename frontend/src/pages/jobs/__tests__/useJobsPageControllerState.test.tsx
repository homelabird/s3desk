import { QueryClient } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useJobsPageControllerState } from '../useJobsPageControllerState'

const {
  surfaceStateRef,
  filtersRef,
  columnsVisibilityRef,
  eventActionsRef,
  queriesRef,
  createFlowsRef,
  tableStateRef,
  overlaysStateRef,
} = vi.hoisted(() => ({
  surfaceStateRef: { current: null as Record<string, unknown> | null },
  filtersRef: { current: null as Record<string, unknown> | null },
  columnsVisibilityRef: { current: null as Record<string, unknown> | null },
  eventActionsRef: { current: null as Record<string, unknown> | null },
  queriesRef: { current: null as Record<string, unknown> | null },
  createFlowsRef: { current: null as Record<string, unknown> | null },
  tableStateRef: { current: null as Record<string, unknown> | null },
  overlaysStateRef: { current: null as Record<string, unknown> | null },
}))

const useJobsPageSurfaceStateMock = vi.fn()

vi.mock('../useJobsPageSurfaceState', () => ({
  useJobsPageSurfaceState: (...args: unknown[]) => useJobsPageSurfaceStateMock(...args),
}))

vi.mock('../useJobsFilters', () => ({
  useJobsFilters: () => filtersRef.current,
}))

vi.mock('../useJobsColumnsVisibility', () => ({
  useJobsColumnsVisibility: () => columnsVisibilityRef.current,
}))

vi.mock('../useJobsPageEventActions', () => ({
  useJobsPageEventActions: () => eventActionsRef.current,
}))

vi.mock('../useJobsPageQueries', () => ({
  useJobsPageQueries: () => queriesRef.current,
}))

vi.mock('../useJobsPageCreateFlows', () => ({
  useJobsPageCreateFlows: () => createFlowsRef.current,
}))

vi.mock('../useJobsPageTableState', () => ({
  useJobsPageTableState: () => tableStateRef.current,
}))

vi.mock('../useJobsPageOverlaysState', () => ({
  useJobsPageOverlaysState: () => overlaysStateRef.current,
}))

function buildSurfaceState() {
  return {
    beginDeleteRequest: vi.fn(() => 1),
    beginDownloadRequest: vi.fn(() => 1),
    bucket: 'bucket-a',
    cancelDeleteRequests: vi.fn(),
    cancelDownloadRequests: vi.fn(),
    createDeleteOpen: false,
    createDownloadOpen: false,
    createOpen: false,
    deleteJobPrefill: null,
    detailsJobId: null,
    detailsOpen: false,
    deviceDownloadLoading: false,
    deviceUploadLoading: false,
    isCurrentDeleteRequest: vi.fn(() => true),
    isCurrentDownloadRequest: vi.fn(() => true),
    logClearRequest: { jobIds: [], nonce: 0 },
    logDrawerRequest: { jobId: null, nonce: 0 },
    openDeleteJobModal: vi.fn(),
    openDetailsForJob: vi.fn(),
    openLogsForJob: vi.fn(),
    setBucket: vi.fn(),
    setCreateDeleteOpen: vi.fn(),
    setCreateDownloadOpen: vi.fn(),
    setCreateOpen: vi.fn(),
    setDeleteJobPrefill: vi.fn(),
    setDetailsJobId: vi.fn(),
    setDetailsOpen: vi.fn(),
    setLogClearRequest: vi.fn(),
    setDeviceDownloadLoading: vi.fn(),
    setDeviceUploadLoading: vi.fn(),
    setLogDrawerRequest: vi.fn(),
    setSortState: vi.fn(),
    sortState: null,
  }
}

describe('useJobsPageControllerState', () => {
  it('parses delete prefill from location state and wires offline menu actions into presentation', () => {
    const surfaceState = buildSurfaceState()
    surfaceStateRef.current = surfaceState
    filtersRef.current = {
      statusFilter: 'all',
      setStatusFilter: vi.fn(),
      searchFilterNormalized: '',
      setSearchFilter: vi.fn(),
      typeFilterNormalized: '',
      setTypeFilter: vi.fn(),
      errorCodeFilterNormalized: '',
      setErrorCodeFilter: vi.fn(),
      filtersDirty: false,
      resetFilters: vi.fn(),
    }
    columnsVisibilityRef.current = {
      columnOptions: [],
      mergedColumnVisibility: {},
      setColumnVisible: vi.fn(),
      columnsDirty: false,
      resetColumns: vi.fn(),
    }
    eventActionsRef.current = {
      cancelingJobId: null,
      retryingJobId: null,
      deletingJobId: null,
      cancelMutation: { isPending: false },
      retryMutation: { isPending: false },
      deleteJobMutation: { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false },
      eventsConnected: true,
      eventsTransport: 'ws',
      eventsRetryCount: 0,
      eventsRetryThreshold: 3,
      retryRealtime: vi.fn(),
      requestCancelJob: vi.fn(),
      requestRetryJob: vi.fn(),
      requestDeleteJob: vi.fn(),
    }
    queriesRef.current = {
      selectedProfile: { name: 'Primary Profile' },
      uploadSupported: false,
      uploadDisabledReason: 'Uploads unavailable.',
      bucketsQuery: { isError: false, error: null },
      bucketOptions: [{ label: 'bucket-a', value: 'bucket-a' }],
      jobsQuery: {
        isFetching: false,
        isFetchingNextPage: false,
        hasNextPage: false,
        fetchNextPage: vi.fn(),
        refetch: vi.fn(),
      },
      jobs: [
        {
          id: 'job-1',
          type: 'transfer_delete_prefix',
          status: 'queued',
          payload: {},
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    }
    createFlowsRef.current = {
      createDeleteMutation: { isPending: false },
      onCreateDelete: vi.fn(),
      onCreateDownload: vi.fn(),
      onCreateUpload: vi.fn(),
    }
    tableStateRef.current = {
      columns: [],
      errorCodeSuggestions: ['AccessDenied'],
      typeFilterSuggestions: ['transfer_delete_prefix'],
      jobsStatusSummary: { queued: 1, running: 0, failed: 0, completed: 0 },
      sortedJobs: queriesRef.current.jobs,
      renderJobActions: vi.fn(),
      isLoading: false,
      tableScrollY: 320,
      onTableContainerRef: vi.fn(),
    }
    overlaysStateRef.current = {
      hasOpenOverlay: false,
      overlaysHost: {
        createFlow: {},
        bucketState: {},
        detailsState: {},
        logsState: {},
        layout: {},
      },
    }
    useJobsPageSurfaceStateMock.mockReturnValue(surfaceState)

    const { result } = renderHook(() =>
      useJobsPageControllerState({
        api: {
          jobs: { createJob: vi.fn() },
        } as never,
        apiToken: 'token',
        isOffline: true,
        locationState: {
          openDeleteJob: true,
          bucket: 'bucket-b',
          prefix: 'logs/',
          deleteAll: true,
        },
        profileId: 'profile-1',
        queryClient: new QueryClient(),
        screens: { md: false, sm: false },
        themeToken: {
          colorBorderSecondary: '#ddd',
          colorBgContainer: '#fff',
          colorFillAlter: '#f5f5f5',
          borderRadiusLG: 12,
        },
        transfers: {
          queueDownloadJobArtifact: vi.fn(),
        } as never,
      }),
    )

    expect(useJobsPageSurfaceStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiToken: 'token',
        profileId: 'profile-1',
        initialDeletePrefill: {
          bucket: 'bucket-b',
          prefix: 'logs/',
          deleteAll: true,
        },
      }),
    )
    expect(result.current.presentation.table.isCompact).toBe(true)
    expect(result.current.presentation.toolbar.topActionsMenu.items?.[0]).toMatchObject({
      key: 'new_delete_job',
      disabled: true,
    })

    act(() => {
      result.current.presentation.toolbar.topActionsMenu.onClick?.({ key: 'new_delete_job' } as never)
    })

    expect(surfaceState.openDeleteJobModal).toHaveBeenCalledTimes(1)
  })
})
