import { describe, expect, it, vi } from 'vitest'

import { buildJobsPagePresentationProps } from '../buildJobsPagePresentationProps'

describe('buildJobsPagePresentationProps', () => {
  it('maps toolbar and table props with a shared scope key', () => {
    const onOpenCreateUpload = vi.fn()
    const onOpenCreateDownload = vi.fn()
    const onOpenDeleteJob = vi.fn()
    const onRetryRealtime = vi.fn()
    const onLoadMore = vi.fn()
    const onTableContainerRef = vi.fn()

    const result = buildJobsPagePresentationProps({
      apiToken: 'token-a',
      profileId: 'profile-1',
      activeProfileName: 'Primary',
      isOffline: false,
      uploadSupported: true,
      uploadDisabledReason: null,
      eventsConnected: true,
      eventsTransport: 'ws',
      eventsRetryCount: 1,
      eventsRetryThreshold: 3,
      onRetryRealtime,
      onOpenCreateUpload,
      onOpenCreateDownload,
      onOpenDeleteJob,
      topActionsMenu: { items: [] },
      statusFilter: 'all',
      onStatusFilterChange: vi.fn(),
      searchFilterNormalized: '',
      onSearchFilterChange: vi.fn(),
      typeFilterNormalized: '',
      onTypeFilterChange: vi.fn(),
      typeFilterSuggestions: [{ value: 'transfer_upload' }],
      errorCodeFilterNormalized: '',
      onErrorCodeFilterChange: vi.fn(),
      errorCodeSuggestions: [{ value: 'SlowDown' }],
      filtersDirty: false,
      onResetFilters: vi.fn(),
      jobsStatusSummary: {
        total: 2,
        active: 1,
        queued: 1,
        running: 0,
        succeeded: 1,
        failed: 0,
        canceled: 0,
      },
      columnOptions: [],
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
      onSetColumnVisible: vi.fn(),
      columnsDirty: false,
      onResetColumns: vi.fn(),
      onRefreshJobs: vi.fn(),
      jobsRefreshing: false,
      jobsCount: 2,
      bucketsError: null,
      jobsError: null,
      sortedJobs: [],
      columns: [],
      isCompact: false,
      tableScrollY: 640,
      isLoading: false,
      getJobSummary: vi.fn(),
      renderJobActions: vi.fn(),
      sortState: null,
      onSortChange: vi.fn(),
      theme: {
        borderColor: '#ddd',
        bg: '#fff',
        hoverBg: '#f5f5f5',
      },
      hasNextPage: true,
      onLoadMore,
      isFetchingNextPage: false,
      onTableContainerRef,
    })

    expect(result.scopeKey).toBe('token-a:profile-1')
    expect(result.toolbar.scopeKey).toBe('token-a:profile-1')
    expect(result.toolbar.activeProfileName).toBe('Primary')
    expect(result.toolbar.onOpenCreateUpload).toBe(onOpenCreateUpload)
    expect(result.toolbar.onOpenCreateDownload).toBe(onOpenCreateDownload)
    expect(result.table.onOpenCreateUpload).toBe(onOpenCreateUpload)
    expect(result.table.onOpenDownloadJob).toBe(onOpenCreateDownload)
    expect(result.table.onOpenDeleteJob).toBe(onOpenDeleteJob)
    expect(result.table.onLoadMore).toBe(onLoadMore)
    expect(result.table.onTableContainerRef).toBe(onTableContainerRef)
  })
})
