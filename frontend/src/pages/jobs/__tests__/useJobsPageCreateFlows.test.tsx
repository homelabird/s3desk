import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockApiClient } from '../../../test/mockApiClient'
import type { TransfersContextValue } from '../../../components/Transfers'
import { useJobsPageCreateFlows } from '../useJobsPageCreateFlows'

const { messageInfo, messageWarning } = vi.hoisted(() => ({
  messageInfo: vi.fn(),
  messageWarning: vi.fn(),
}))

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd')
  return {
    ...actual,
    message: {
      success: vi.fn(),
      error: vi.fn(),
      info: (...args: unknown[]) => messageInfo(...args),
      warning: (...args: unknown[]) => messageWarning(...args),
    },
  }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function createTransfersStub(): TransfersContextValue {
  return {
    activeTab: 'uploads',
    closeTransfers: vi.fn(),
    clearAllTransfers: vi.fn(),
    clearCompletedDownloads: vi.fn(),
    clearCompletedUploads: vi.fn(),
    downloadTasks: [],
    openTransfers: vi.fn(),
    queueDownloadJobArtifact: vi.fn(),
    queueDownloadObject: vi.fn(),
    queueDownloadObjectsToDevice: vi.fn(),
    queueUploadFiles: vi.fn(),
    removeDownloadTask: vi.fn(),
    removeUploadTask: vi.fn(),
    retryDownloadTask: vi.fn(),
    retryUploadTask: vi.fn(),
    cancelDownloadTask: vi.fn(),
    cancelUploadTask: vi.fn(),
    uploadTasks: [],
  } as unknown as TransfersContextValue
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper(props: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
  }
}

function buildArgs(overrides: Partial<Parameters<typeof useJobsPageCreateFlows>[0]> = {}) {
  const transfers = createTransfersStub()
  return {
    api: createMockApiClient({
      objects: {
        listObjects: vi.fn().mockResolvedValue({
          items: [{ key: 'logs/app.log', size: 128 }],
          commonPrefixes: [],
          isTruncated: false,
          nextContinuationToken: undefined,
        }),
      },
    }),
    apiToken: 'token-a',
    profileId: 'profile-1' as string | null,
    queryClient: new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    }),
    transfers,
    uploadSupported: true,
    uploadDisabledReason: null,
    createJobWithRetry: vi.fn(),
    beginDownloadRequest: vi.fn(() => 1),
    isCurrentDownloadRequest: vi.fn((token: number) => token === 1),
    setCreateOpen: vi.fn(),
    setCreateDownloadOpen: vi.fn(),
    setCreateDeleteOpen: vi.fn(),
    setDeviceUploadLoading: vi.fn(),
    setDeviceDownloadLoading: vi.fn(),
    setDeleteJobPrefill: vi.fn(),
    beginDeleteRequest: vi.fn(() => 1),
    isCurrentDeleteRequest: vi.fn((token: number) => token === 1),
    ...overrides,
  }
}

describe('useJobsPageCreateFlows', () => {
  beforeEach(() => {
    messageInfo.mockReset()
    messageWarning.mockReset()
  })

  it('blocks device uploads when the provider does not support uploads', () => {
    const args = buildArgs({
      uploadSupported: false,
      uploadDisabledReason: 'Object API is unavailable.',
    })

    const { result } = renderHook(() => useJobsPageCreateFlows(args), {
      wrapper: createWrapper(args.queryClient),
    })

    act(() => {
      void result.current.onCreateUpload({
        bucket: 'bucket-a',
        prefix: 'logs/',
        files: [new File(['hello'], 'report.txt', { type: 'text/plain' })],
      })
    })

    expect(messageWarning).toHaveBeenCalledWith('Object API is unavailable.')
    expect(args.transfers.queueUploadFiles).not.toHaveBeenCalled()
    expect(args.setDeviceUploadLoading).not.toHaveBeenCalled()
  })

  it('ignores stale device download responses after the request token changes', async () => {
    const listObjectsRequest = deferred<{
      items: Array<{ key: string; size: number }>
      commonPrefixes: string[]
      isTruncated: boolean
      nextContinuationToken?: string | null
    }>()
    const api = createMockApiClient({
      objects: {
        listObjects: vi.fn().mockReturnValueOnce(listObjectsRequest.promise),
      },
    })
    let activeToken = 1
    const args = buildArgs({
      api,
      beginDownloadRequest: vi.fn(() => activeToken),
      isCurrentDownloadRequest: vi.fn((token: number) => token === activeToken),
    })

    const { result } = renderHook(() => useJobsPageCreateFlows(args), {
      wrapper: createWrapper(args.queryClient),
    })

    act(() => {
      void result.current.onCreateDownload({
        bucket: 'bucket-a',
        prefix: 'logs/',
        dirHandle: { name: 'downloads' } as FileSystemDirectoryHandle,
      })
    })

    await waitFor(() => expect(api.objects.listObjects).toHaveBeenCalledTimes(1))

    activeToken = 2

    await act(async () => {
      listObjectsRequest.resolve({
        items: [{ key: 'logs/app.log', size: 128 }],
        commonPrefixes: [],
        isTruncated: false,
        nextContinuationToken: undefined,
      })
      await Promise.resolve()
    })

    expect(args.transfers.queueDownloadObjectsToDevice).not.toHaveBeenCalled()
    expect(args.setCreateDownloadOpen).not.toHaveBeenCalledWith(false)
  })
})
