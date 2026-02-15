import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { type PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { APIClient } from '../../../api/client'
import { useJobsActionMutations } from '../useJobsActionMutations'

const { messageSuccess, messageError } = vi.hoisted(() => ({
	messageSuccess: vi.fn(),
	messageError: vi.fn(),
}))

vi.mock('antd', () => ({
	message: {
		success: messageSuccess,
		error: messageError,
	},
}))

function wrapperWithClient(queryClient: QueryClient) {
	return ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useJobsActionMutations', () => {
	beforeEach(() => {
		messageSuccess.mockReset()
		messageError.mockReset()
	})

	it('runs cancel, retry and delete mutations with invalidation', async () => {
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		})
		const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

		const cancelJob = vi.fn().mockResolvedValue({ id: 'job-cancel' })
		const retryJob = vi.fn().mockResolvedValue({ id: 'job-retry' })
		const deleteJob = vi.fn().mockResolvedValue(undefined)
		const onJobDeleted = vi.fn()

		const api = {
			cancelJob,
			retryJob,
			deleteJob,
		} as unknown as APIClient

		const { result } = renderHook(
			() =>
				useJobsActionMutations({
					api,
					profileId: 'profile-1',
					queryClient,
					onJobDeleted,
				}),
			{ wrapper: wrapperWithClient(queryClient) },
		)

		act(() => {
			result.current.cancelMutation.mutate('job-cancel')
		})
		await waitFor(() => expect(cancelJob).toHaveBeenCalledWith('profile-1', 'job-cancel'))

		act(() => {
			result.current.retryMutation.mutate('job-retry')
		})
		await waitFor(() => expect(retryJob).toHaveBeenCalledWith('profile-1', 'job-retry'))

		await act(async () => {
			await result.current.deleteJobMutation.mutateAsync('job-delete')
		})
		expect(deleteJob).toHaveBeenCalledWith('profile-1', 'job-delete')
		expect(onJobDeleted).toHaveBeenCalledWith('job-delete')

		expect(messageError).not.toHaveBeenCalled()
		expect(messageSuccess).toHaveBeenCalled()
		expect(invalidateSpy).toHaveBeenCalled()
	})
})
