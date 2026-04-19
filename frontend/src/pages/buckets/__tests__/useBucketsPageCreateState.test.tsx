import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { APIError } from '../../../api/client'
import { createMockApiClient } from '../../../test/mockApiClient'
import { useBucketsPageCreateState } from '../useBucketsPageCreateState'

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
			queryKey: ['buckets', 'profile-1', 'token-a'],
			exact: true,
		})
		expect(messageSuccessMock).not.toHaveBeenCalled()
		expect(messageErrorMock).not.toHaveBeenCalled()
	})
})
