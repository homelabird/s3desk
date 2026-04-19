import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { APIError } from '../../../api/client'
import { createMockApiClient } from '../../../test/mockApiClient'
import { buildDialogPreferenceKey, setDialogDismissed } from '../../../lib/dialogPreferences'
import { buildBucketDeleteJobNavigationState, buildBucketObjectsNavigationState } from '../bucketNotEmptyNavigation'
import { useBucketsPageDeleteFlow } from '../useBucketsPageDeleteFlow'

const { messageSuccessMock, messageWarningMock, messageErrorMock } = vi.hoisted(() => ({
  messageSuccessMock: vi.fn(),
  messageWarningMock: vi.fn(),
  messageErrorMock: vi.fn(),
}))

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd')
  return {
    ...actual,
    message: {
      success: (...args: unknown[]) => messageSuccessMock(...args),
      warning: (...args: unknown[]) => messageWarningMock(...args),
      error: (...args: unknown[]) => messageErrorMock(...args),
    },
  }
})

function createWrapper(queryClient: QueryClient) {
  return function Wrapper(props: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
  }
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
  messageSuccessMock.mockReset()
  messageWarningMock.mockReset()
  messageErrorMock.mockReset()
})

describe('useBucketsPageDeleteFlow', () => {
  it('ignores stale delete callbacks captured before the scope changes', async () => {
    const deleteBucketApi = vi.fn().mockResolvedValue(undefined)
    const api = createMockApiClient({
      buckets: {
        deleteBucket: deleteBucketApi,
      },
    })

    const latestScopeKeyRef = { current: 'token-a:profile-1' }
    const bucketsPageContextVersionRef = { current: 1 }
    const setDeletingBucketState = vi.fn()
    const setBucketNotEmptyDialogState = vi.fn()
    const navigate = vi.fn()

    const { result, rerender } = renderHook(
      (props: { apiToken: string; currentScopeKey: string }) =>
        useBucketsPageDeleteFlow({
          api,
          apiToken: props.apiToken,
          profileId: 'profile-1',
          queryClient: createQueryClient(),
          navigate,
          currentScopeKey: props.currentScopeKey,
          latestScopeKeyRef,
          bucketsPageContextVersionRef,
          bucketNotEmptyDialogBucket: null,
          setDeletingBucketState,
          setBucketNotEmptyDialogState,
        }),
      {
        initialProps: { apiToken: 'token-a', currentScopeKey: 'token-a:profile-1' },
        wrapper: createWrapper(createQueryClient()),
      },
    )

    const staleDeleteBucket = result.current.deleteBucket
    latestScopeKeyRef.current = 'token-b:profile-1'
    bucketsPageContextVersionRef.current = 2
    rerender({ apiToken: 'token-b', currentScopeKey: 'token-b:profile-1' })

    await act(async () => {
      await staleDeleteBucket('primary-bucket')
    })

    expect(deleteBucketApi).not.toHaveBeenCalled()
    expect(messageSuccessMock).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('shows a warning instead of reopening the bucket_not_empty dialog after dismissal', async () => {
    const deleteBucketApi = vi.fn().mockRejectedValue(
      new APIError({
        status: 409,
        code: 'bucket_not_empty',
        message: 'bucket contains objects',
      }),
    )
    const api = createMockApiClient({
      buckets: {
        deleteBucket: deleteBucketApi,
      },
    })
    setDialogDismissed(buildDialogPreferenceKey('warning', 'bucket_not_empty'), true, 'token-a')

    const { result } = renderHook(
      () =>
        useBucketsPageDeleteFlow({
          api,
          apiToken: 'token-a',
          profileId: 'profile-1',
          queryClient: createQueryClient(),
          navigate: vi.fn(),
          currentScopeKey: 'token-a:profile-1',
          latestScopeKeyRef: { current: 'token-a:profile-1' },
          bucketsPageContextVersionRef: { current: 1 },
          bucketNotEmptyDialogBucket: null,
          setDeletingBucketState: vi.fn(),
          setBucketNotEmptyDialogState: vi.fn(),
        }),
      {
        wrapper: createWrapper(createQueryClient()),
      },
    )

    await act(async () => {
      await result.current.deleteBucket('primary-bucket').catch(() => undefined)
    })

    await waitFor(() =>
      expect(messageWarningMock).toHaveBeenCalledWith(
        'Bucket "primary-bucket" isn’t empty. Open Objects or create a delete job from the Buckets page.',
      ),
    )
    expect(messageErrorMock).not.toHaveBeenCalled()
  })

  it('navigates to objects and jobs from the bucket-not-empty dialog actions', () => {
    const navigate = vi.fn()
    const setBucketNotEmptyDialogState = vi.fn()

    const { result } = renderHook(
      () =>
        useBucketsPageDeleteFlow({
          api: createMockApiClient(),
          apiToken: 'token-a',
          profileId: 'profile-1',
          queryClient: createQueryClient(),
          navigate,
          currentScopeKey: 'token-a:profile-1',
          latestScopeKeyRef: { current: 'token-a:profile-1' },
          bucketsPageContextVersionRef: { current: 1 },
          bucketNotEmptyDialogBucket: 'primary-bucket',
          setDeletingBucketState: vi.fn(),
          setBucketNotEmptyDialogState,
        }),
      {
        wrapper: createWrapper(createQueryClient()),
      },
    )

    act(() => {
      result.current.openBucketNotEmptyObjects()
      result.current.openBucketNotEmptyDeleteJob()
    })

    expect(setBucketNotEmptyDialogState).toHaveBeenNthCalledWith(1, null)
    expect(setBucketNotEmptyDialogState).toHaveBeenNthCalledWith(2, null)
    expect(navigate).toHaveBeenNthCalledWith(1, '/objects', {
      state: buildBucketObjectsNavigationState('primary-bucket'),
    })
    expect(navigate).toHaveBeenNthCalledWith(2, '/jobs', {
      state: buildBucketDeleteJobNavigationState('primary-bucket'),
    })
  })
})
