import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { type PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockApiClient } from '../../../test/mockApiClient'
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

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

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
		const retryJob = vi.fn().mockResolvedValue({ id: 'job-retry-new' })
		const deleteJob = vi.fn().mockResolvedValue(undefined)
		const onJobDeleted = vi.fn()

		const api = createMockApiClient({
			jobs: {
				cancelJob,
				retryJob,
				deleteJob,
			},
		})

		const { result } = renderHook(
			() =>
				useJobsActionMutations({
					api,
					apiToken: 'token',
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
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token'], exact: false })
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['job', 'profile-1', 'job-cancel', 'token'], exact: true })
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['job', 'profile-1', 'job-retry', 'token'], exact: true })
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['job', 'profile-1', 'job-retry-new', 'token'], exact: true })
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['job', 'profile-1', 'job-delete', 'token'], exact: true })
		expect(
			invalidateSpy.mock.calls.filter(
				([args]) =>
					JSON.stringify(args) === JSON.stringify({ queryKey: ['jobs', 'profile-1', 'token'], exact: false }),
			),
		).toHaveLength(4)
	})

	it('ignores stale delete responses after the jobs scope changes', async () => {
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		})
		const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
		const deleteJobRequest = deferred<void>()
		const deleteJob = vi.fn().mockReturnValue(deleteJobRequest.promise)
		const onJobDeleted = vi.fn()

		const api = createMockApiClient({
			jobs: {
				deleteJob,
			},
		})

		const { result, rerender } = renderHook(
			({ apiToken, profileId }) =>
				useJobsActionMutations({
					api,
					apiToken,
					profileId,
					queryClient,
					onJobDeleted,
				}),
			{
				initialProps: { apiToken: 'token-a', profileId: 'profile-1' as string | null },
				wrapper: wrapperWithClient(queryClient),
			},
		)

		act(() => {
			result.current.deleteJobMutation.mutate('job-delete')
		})

		await waitFor(() => expect(deleteJob).toHaveBeenCalledWith('profile-1', 'job-delete'))
		expect(result.current.deletingJobId).toBe('job-delete')

		rerender({ apiToken: 'token-b', profileId: 'profile-2' })
		expect(result.current.deletingJobId).toBeNull()

		await act(async () => {
			deleteJobRequest.resolve(undefined)
			await Promise.resolve()
		})

		expect(onJobDeleted).not.toHaveBeenCalled()
		expect(messageSuccess).not.toHaveBeenCalled()
		expect(messageError).not.toHaveBeenCalled()
		expect(result.current.deletingJobId).toBeNull()
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token-a'], exact: false })
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['job', 'profile-1', 'job-delete', 'token-a'], exact: true })
	})
})
