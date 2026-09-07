import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { APIError } from '../../../api/client'
import { queryKeys } from '../../../api/queryKeys'
import { createMockApiClient } from '../../../test/mockApiClient'
import { useBucketsPageCreateState } from '../useBucketsPageCreateState'
import { useBucketsPageScopeState } from '../useBucketsPageScopeState'

const {
	messageErrorMock,
	messageSuccessMock,
	messageWarningMock,
} = vi.hoisted(() => ({
	messageErrorMock: vi.fn(),
	messageSuccessMock: vi.fn(),
	messageWarningMock: vi.fn(),
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
	vi.restoreAllMocks()
	messageErrorMock.mockReset()
	messageSuccessMock.mockReset()
	messageWarningMock.mockReset()
})

describe('useBucketsPageCreateState', () => {
	it.each(['success', 'partial', 'error'] as const)('suppresses a %s result after leaving the page while preserving the created bucket cache', async (outcome) => {
		const queryClient = createQueryClient()
		const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
		const createBucket = vi.fn().mockResolvedValue(undefined)
		if (outcome === 'partial') createBucket.mockRejectedValue(new APIError({
			status: 500, code: 'bucket_defaults_apply_failed', message: 'secure defaults failed',
			details: { bucketCreated: true, applySection: 'retention' },
		}))
		if (outcome === 'error') createBucket.mockRejectedValue(new Error('creation denied'))
		const api = createMockApiClient({ buckets: { createBucket } })
		const closeCreateModal = vi.fn()
		const initialProps = { api, apiToken: 'token-a', profileId: 'profile-1' }
		const { result, unmount } = renderHook((props) => {
			const scope = useBucketsPageScopeState(props)
			return useBucketsPageCreateState({
				...props, queryClient, closeCreateModal, bucketsPageContextVersionRef: scope.bucketsPageContextVersionRef,
			})
		}, { initialProps, wrapper: createWrapper(queryClient) })
		try {
			onlineManager.setOnline(false)
			act(() => result.current.submitCreateBucket({ name: 'primary-bucket' }))
			const mutation = queryClient.getMutationCache().getAll()[0]
			await waitFor(() => expect(mutation.state.context).toBeDefined())
			expect(mutation.state.isPaused).toBe(true)
			expect(createBucket).not.toHaveBeenCalled()
			unmount()
			onlineManager.setOnline(true)
			await queryClient.resumePausedMutations()
			await waitFor(() => expect(mutation.state.status).toBe(outcome === 'success' ? 'success' : 'error'))
			expect(createBucket).toHaveBeenCalledExactlyOnceWith('profile-1', { name: 'primary-bucket' })
			if (outcome === 'error') expect(invalidateQueries).not.toHaveBeenCalled()
			else expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({ queryKey: queryKeys.buckets.list('profile-1', 'token-a'), exact: true })
			expect(closeCreateModal).not.toHaveBeenCalled()
			expect(messageSuccessMock).not.toHaveBeenCalled()
			expect(messageWarningMock).not.toHaveBeenCalled()
			expect(messageErrorMock).not.toHaveBeenCalled()
		} finally {
			onlineManager.setOnline(true)
			unmount()
			queryClient.clear()
		}
	})

	it('warns and closes the modal when secure defaults fail after bucket creation', async () => {
		const createBucket = vi.fn().mockRejectedValue(
			new APIError({
				status: 500,
				code: 'bucket_defaults_apply_failed',
				message: 'secure defaults failed',
				details: {
					bucketCreated: true,
					applySection: 'retention',
				},
			}),
		)
		const invalidateQueries = vi.fn().mockResolvedValue(undefined)
		const queryClient = createQueryClient()
		queryClient.invalidateQueries = invalidateQueries
		const closeCreateModal = vi.fn()

		const { result } = renderHook(
			() =>
				useBucketsPageCreateState({
					api: createMockApiClient({
						buckets: {
							createBucket,
						},
					}),
					apiToken: 'token-a',
					profileId: 'profile-1',
					queryClient,
					bucketsPageContextVersionRef: { current: 1 },
					closeCreateModal,
				}),
			{
				wrapper: createWrapper(queryClient),
			},
		)

		await act(async () => {
			result.current.submitCreateBucket({ name: 'primary-bucket' })
		})

		await waitFor(() =>
			expect(messageWarningMock).toHaveBeenCalledWith(
				'Bucket created, but secure defaults failed while applying retention.',
			),
		)
		expect(closeCreateModal).toHaveBeenCalledTimes(1)
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.buckets.list('profile-1', 'token-a'),
			exact: true,
		})
		expect(messageSuccessMock).not.toHaveBeenCalled()
		expect(messageErrorMock).not.toHaveBeenCalled()
	})
})
