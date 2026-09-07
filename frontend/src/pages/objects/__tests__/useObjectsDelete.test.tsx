import '@testing-library/jest-dom/vitest'
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { APIError } from '../../../api/client'
import { queryKeys } from '../../../api/queryKeys'
import { createMockApiClient } from '../../../test/mockApiClient'
import {
	completeClaimedObjectJob,
	isObjectJobCompletionClaimed,
	releaseObjectJobCompletion,
} from '../objectsQueryCache'
import { useObjectsDelete } from '../useObjectsDelete'

const messageSuccessMock = vi.fn()
const messageErrorMock = vi.fn()
const invalidateObjectQueriesForPrefixMock = vi.fn()
const publishObjectsRefreshMock = vi.fn()

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		message: {
			success: (...args: unknown[]) => messageSuccessMock(...args),
			error: (...args: unknown[]) => messageErrorMock(...args),
		},
	}
})

vi.mock('../objectsQueryCache', async () => {
	const actual = await vi.importActual<typeof import('../objectsQueryCache')>('../objectsQueryCache')
	return {
		...actual,
		invalidateObjectQueriesForPrefix: (...args: unknown[]) => invalidateObjectQueriesForPrefixMock(...args),
	}
})

vi.mock('../objectsRefreshEvents', async () => {
	const actual = await vi.importActual<typeof import('../objectsRefreshEvents')>('../objectsRefreshEvents')
	return {
		...actual,
		publishObjectsRefresh: (...args: unknown[]) => publishObjectsRefreshMock(...args),
	}
})

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	})

	function Wrapper(props: PropsWithChildren) {
		return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
	}

	return { Wrapper, queryClient }
}

describe('useObjectsDelete', () => {
	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
		messageSuccessMock.mockClear()
		messageErrorMock.mockClear()
		invalidateObjectQueriesForPrefixMock.mockClear()
		publishObjectsRefreshMock.mockClear()
	})

	it('refreshes object queries and tree once immediately after a direct delete', async () => {
		const { Wrapper } = createWrapper()
		const api = createMockApiClient({
			objects: {
				deleteObjects: vi.fn().mockResolvedValue({ deleted: 1 }),
			},
			jobs: {
				getJob: vi.fn(),
			},
		})
		const createJobWithRetry = vi.fn()
		const setSelectedKeys = vi.fn()
		const { result } = renderHook(
			() =>
				useObjectsDelete({
					api,
					profileId: 'profile-1',
					apiToken: 'token-1',
					bucket: 'bucket-a',
					prefix: 'logs/',
					createJobWithRetry,
					setSelectedKeys,
				}),
			{ wrapper: Wrapper },
		)

		await act(async () => {
			await result.current.deleteMutation.mutateAsync(['logs/app.log'])
		})

		expect(invalidateObjectQueriesForPrefixMock).toHaveBeenCalledTimes(1)
		expect(publishObjectsRefreshMock).toHaveBeenCalledTimes(1)
		expect(setSelectedKeys).toHaveBeenCalledTimes(1)
		expect(createJobWithRetry).not.toHaveBeenCalled()
		expect(api.jobs.getJob).not.toHaveBeenCalled()
	})

	it.each(
		(['direct', 'bulk', 'prefix'] as const).flatMap((operation) =>
			(['profile', 'bucket', 'auth'] as const).map((change) => ({ operation, change })),
		),
	)('keeps a paused $operation delete in its original scope after a $change change', async ({ operation, change }) => {
		const { Wrapper, queryClient } = createWrapper()
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')
		const api = createMockApiClient({
			objects: { deleteObjects: vi.fn().mockResolvedValue({ deleted: 1 }) },
			jobs: { getJob: vi.fn() },
		})
		const nextApi = createMockApiClient({
			objects: { deleteObjects: vi.fn().mockResolvedValue({ deleted: 1 }) },
			jobs: { getJob: vi.fn() },
		})
		const createJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-original', status: 'queued' })
		const nextCreateJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-next', status: 'queued' })
		const setSelectedKeys = vi.fn()
		const initialProps = {
			api, createJobWithRetry, apiToken: 'token-1', profileId: 'profile-1', bucket: 'bucket-a', prefix: 'logs/',
		}
		const { result, rerender, unmount } = renderHook(
			(props) => useObjectsDelete({ ...props, setSelectedKeys }),
			{ initialProps, wrapper: Wrapper },
		)
		const keys = Array.from({ length: operation === 'bulk' ? 1001 : 1 }, (_, i) => `logs/file-${i}.txt`)
		let deletePromise!: Promise<unknown>
		try {
			onlineManager.setOnline(false)
			act(() => {
				deletePromise = operation === 'prefix'
					? result.current.deletePrefixJobMutation.mutateAsync({ prefix: 'logs/', dryRun: false })
					: result.current.deleteMutation.mutateAsync(keys)
			})
			await waitFor(() => expect(queryClient.getMutationCache().getAll()[0]?.state.isPaused).toBe(true))
			expect(api.objects.deleteObjects).not.toHaveBeenCalled()
			expect(createJobWithRetry).not.toHaveBeenCalled()
			rerender({
				...initialProps,
				api: change === 'bucket' ? api : nextApi,
				createJobWithRetry: change === 'bucket' ? createJobWithRetry : nextCreateJobWithRetry,
				profileId: change === 'profile' ? 'profile-2' : initialProps.profileId,
				bucket: change === 'bucket' ? 'bucket-b' : initialProps.bucket,
				apiToken: change === 'auth' ? 'token-2' : initialProps.apiToken,
			})
			expect(result.current.deleteMutation.isPending).toBe(false)
			expect(result.current.deletePrefixJobMutation.isPending).toBe(false)
			expect(result.current.deletingKey).toBeNull()
			await act(async () => {
				onlineManager.setOnline(true)
				await deletePromise
			})
			expect(nextApi.objects.deleteObjects).not.toHaveBeenCalled()
			expect(nextCreateJobWithRetry).not.toHaveBeenCalled()
			if (operation === 'direct') {
				expect(api.objects.deleteObjects).toHaveBeenCalledExactlyOnceWith({
					profileId: 'profile-1', bucket: 'bucket-a', keys,
				})
				expect(createJobWithRetry).not.toHaveBeenCalled()
			} else {
				expect(api.objects.deleteObjects).not.toHaveBeenCalled()
				expect(createJobWithRetry).toHaveBeenCalledExactlyOnceWith(operation === 'bulk' ? {
					type: 's3_delete_objects', payload: { bucket: 'bucket-a', keys },
				} : {
					type: 'transfer_delete_prefix',
					payload: { bucket: 'bucket-a', prefix: 'logs/', dryRun: false, deleteAll: false, allowUnsafePrefix: false, include: [], exclude: [] },
				})
				expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.jobs.scope('profile-1', 'token-1'), exact: false })
			}
			expect(api.jobs.getJob).not.toHaveBeenCalled()
			expect(nextApi.jobs.getJob).not.toHaveBeenCalled()
			expect(setSelectedKeys).not.toHaveBeenCalled()
			expect(messageSuccessMock).not.toHaveBeenCalled()
			expect(invalidateObjectQueriesForPrefixMock).not.toHaveBeenCalled()
			expect(publishObjectsRefreshMock).not.toHaveBeenCalled()
		} finally {
			onlineManager.setOnline(true)
			unmount()
			queryClient.clear()
		}
	})

	it('waits for a delete job to succeed before refreshing object queries and tree once', async () => {
		vi.useFakeTimers()
		const { Wrapper } = createWrapper()
		const getJob = vi
			.fn()
			.mockResolvedValueOnce({ id: 'job-1', status: 'running' })
			.mockResolvedValueOnce({ id: 'job-1', status: 'succeeded' })
		const api = createMockApiClient({
			jobs: { getJob },
		})
		const createJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-1', status: 'queued' })
		const setSelectedKeys = vi.fn()
		const { result } = renderHook(
			() =>
				useObjectsDelete({
					api,
					profileId: 'profile-1',
					apiToken: 'token-1',
					bucket: 'bucket-a',
					prefix: 'logs/',
					createJobWithRetry,
					setSelectedKeys,
				}),
			{ wrapper: Wrapper },
		)
		const keys = Array.from({ length: 1001 }, (_, index) => `logs/object-${index}.txt`)

		await act(async () => {
			await result.current.deleteMutation.mutateAsync(keys)
			await Promise.resolve()
		})

		expect(getJob).toHaveBeenCalledTimes(1)
		expect(invalidateObjectQueriesForPrefixMock).not.toHaveBeenCalled()
		expect(publishObjectsRefreshMock).not.toHaveBeenCalled()
		expect(setSelectedKeys).toHaveBeenCalledTimes(1)

		await act(async () => {
			await vi.advanceTimersByTimeAsync(1000)
		})

		expect(getJob).toHaveBeenCalledTimes(2)
		expect(invalidateObjectQueriesForPrefixMock).toHaveBeenCalledTimes(1)
		expect(publishObjectsRefreshMock).toHaveBeenCalledTimes(1)
	})

	it.each([
		{ status: 'failed' as const, prefixJob: false, refreshPrefix: 'logs/', source: 'delete_objects' },
		{ status: 'canceled' as const, prefixJob: true, refreshPrefix: 'logs/archive/', source: 'delete_prefix' },
	])('refreshes scoped object queries and tree once when a delete job is $status', async ({
		status,
		prefixJob,
		refreshPrefix,
		source,
	}) => {
		const { Wrapper } = createWrapper()
		const jobId = `job-${status}`
		const api = createMockApiClient({
			jobs: {
				getJob: vi.fn().mockResolvedValue({ id: jobId, status, error: `${status} detail` }),
			},
		})
		const createJobWithRetry = vi.fn().mockResolvedValue({ id: jobId, status: 'queued' })
		const setSelectedKeys = vi.fn()
		const { result } = renderHook(
			() =>
				useObjectsDelete({
					api,
					profileId: 'profile-1',
					apiToken: 'token-1',
					bucket: 'bucket-a',
					prefix: 'logs/',
					createJobWithRetry,
					setSelectedKeys,
				}),
			{ wrapper: Wrapper },
		)

		await act(async () => {
			if (prefixJob) {
				await result.current.deletePrefixJobMutation.mutateAsync({ prefix: refreshPrefix, dryRun: false })
			} else {
				await result.current.deleteMutation.mutateAsync(
					Array.from({ length: 1001 }, (_, index) => `logs/object-${index}.txt`),
				)
			}
		})
		await waitFor(() => expect(invalidateObjectQueriesForPrefixMock).toHaveBeenCalledTimes(1))

		expect(invalidateObjectQueriesForPrefixMock).toHaveBeenCalledWith(expect.anything(), {
			profileId: 'profile-1',
			bucket: 'bucket-a',
			changedPrefix: refreshPrefix,
			apiToken: 'token-1',
		})
		expect(publishObjectsRefreshMock).toHaveBeenCalledWith({
			apiToken: 'token-1',
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: refreshPrefix,
			source,
		})
		expect(messageErrorMock).toHaveBeenCalledWith(`${status} detail`)
	})

	it('keeps watching past the former 60-poll limit', async () => {
		vi.useFakeTimers()
		const { Wrapper } = createWrapper()
		let pollCount = 0
		const getJob = vi.fn().mockImplementation(async () => ({
			id: 'job-long',
			status: ++pollCount > 60 ? 'succeeded' : 'running',
		}))
		const api = createMockApiClient({ jobs: { getJob } })
		const createJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-long', status: 'queued' })
		const { result } = renderHook(
			() =>
				useObjectsDelete({
					api,
					profileId: 'profile-1',
					apiToken: 'token-1',
					bucket: 'bucket-a',
					prefix: 'logs/',
					createJobWithRetry,
					setSelectedKeys: vi.fn(),
				}),
			{ wrapper: Wrapper },
		)

		await act(async () => {
			await result.current.deleteMutation.mutateAsync(
				Array.from({ length: 1001 }, (_, index) => `logs/object-${index}.txt`),
			)
			await Promise.resolve()
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(60_000)
		})

		expect(getJob).toHaveBeenCalledTimes(61)
		expect(invalidateObjectQueriesForPrefixMock).toHaveBeenCalledTimes(1)
		expect(publishObjectsRefreshMock).toHaveBeenCalledTimes(1)
	})

	it('uses realtime completion while connected and resumes polling after disconnect', async () => {
		vi.useFakeTimers()
		const { Wrapper } = createWrapper()
		const getJob = vi
			.fn()
			.mockResolvedValueOnce({ id: 'job-reconnect', status: 'running' })
			.mockResolvedValueOnce({ id: 'job-reconnect', status: 'succeeded' })
		const api = createMockApiClient({ jobs: { getJob } })
		const createJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-reconnect', status: 'queued' })
		const { result, rerender } = renderHook(
			({ eventsConnected }: { eventsConnected: boolean }) =>
				useObjectsDelete({
					api,
					profileId: 'profile-1',
					apiToken: 'token-1',
					bucket: 'bucket-a',
					prefix: 'logs/',
					createJobWithRetry,
					setSelectedKeys: vi.fn(),
					eventsConnected,
				}),
			{
				initialProps: { eventsConnected: true },
				wrapper: Wrapper,
			},
		)

		await act(async () => {
			await result.current.deleteMutation.mutateAsync(
				Array.from({ length: 1001 }, (_, index) => `logs/object-${index}.txt`),
			)
			await Promise.resolve()
		})
		expect(getJob).toHaveBeenCalledOnce()
		await act(async () => {
			await vi.advanceTimersByTimeAsync(29_000)
		})
		expect(getJob).toHaveBeenCalledOnce()

		rerender({ eventsConnected: false })
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1000)
		})
		expect(getJob).toHaveBeenCalledTimes(2)
		expect(invalidateObjectQueriesForPrefixMock).toHaveBeenCalledOnce()
		expect(publishObjectsRefreshMock).toHaveBeenCalledOnce()
	})

	it('stops the delete-job watcher and releases its realtime claim on unmount', async () => {
		vi.useFakeTimers()
		const { Wrapper } = createWrapper()
		const getJob = vi.fn().mockResolvedValue({ id: 'job-running', status: 'running' })
		const api = createMockApiClient({ jobs: { getJob } })
		const createJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-running', status: 'queued' })
		const { result, unmount } = renderHook(
			() =>
				useObjectsDelete({
					api,
					profileId: 'profile-1',
					apiToken: 'token-1',
					bucket: 'bucket-a',
					prefix: 'logs/',
					createJobWithRetry,
					setSelectedKeys: vi.fn(),
				}),
			{ wrapper: Wrapper },
		)

		await act(async () => {
			await result.current.deleteMutation.mutateAsync(
				Array.from({ length: 1001 }, (_, index) => `logs/object-${index}.txt`),
			)
			await Promise.resolve()
		})
		expect(getJob).toHaveBeenCalledTimes(1)
		expect(isObjectJobCompletionClaimed({ apiToken: 'token-1', profileId: 'profile-1', jobId: 'job-running' })).toBe(true)

		unmount()
		await act(async () => {
			await vi.advanceTimersByTimeAsync(5000)
		})

		expect(getJob).toHaveBeenCalledTimes(1)
		expect(isObjectJobCompletionClaimed({ apiToken: 'token-1', profileId: 'profile-1', jobId: 'job-running' })).toBe(false)
		expect(invalidateObjectQueriesForPrefixMock).not.toHaveBeenCalled()
		expect(publishObjectsRefreshMock).not.toHaveBeenCalled()
	})

	it('does not start a delete-job watcher when job creation resolves after unmount', async () => {
		const { Wrapper } = createWrapper()
		const jobRequest = deferred<{ id: string; status: 'queued' }>()
		const getJob = vi.fn()
		const api = createMockApiClient({ jobs: { getJob } })
		const createJobWithRetry = vi.fn().mockReturnValue(jobRequest.promise)
		const { result, unmount } = renderHook(
			() =>
				useObjectsDelete({
					api,
					profileId: 'profile-1',
					apiToken: 'token-1',
					bucket: 'bucket-a',
					prefix: 'logs/',
					createJobWithRetry,
					setSelectedKeys: vi.fn(),
				}),
			{ wrapper: Wrapper },
		)

		let deletePromise!: Promise<unknown>
		await act(async () => {
			deletePromise = result.current.deleteMutation.mutateAsync(
				Array.from({ length: 1001 }, (_, index) => `logs/object-${index}.txt`),
			)
		})
		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledOnce())
		unmount()

		await act(async () => {
			jobRequest.resolve({ id: 'job-after-unmount', status: 'queued' })
			await deletePromise
		})

		expect(getJob).not.toHaveBeenCalled()
		expect(isObjectJobCompletionClaimed({
			apiToken: 'token-1',
			profileId: 'profile-1',
			jobId: 'job-after-unmount',
		})).toBe(false)
	})

	it('stops non-retryable polling and lets realtime complete the claimed job once', async () => {
		vi.useFakeTimers()
		const { Wrapper } = createWrapper()
		const getJob = vi.fn().mockRejectedValue(new APIError({
			status: 403,
			code: 'forbidden',
			message: 'forbidden',
			normalizedError: { code: 'forbidden', retryable: false },
		}))
		const api = createMockApiClient({ jobs: { getJob } })
		const createJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-realtime', status: 'queued' })
		const { result, unmount } = renderHook(
			() =>
				useObjectsDelete({
					api,
					profileId: 'profile-1',
					apiToken: 'token-1',
					bucket: 'bucket-a',
					prefix: 'logs/',
					createJobWithRetry,
					setSelectedKeys: vi.fn(),
				}),
			{ wrapper: Wrapper },
		)
		const scope = { apiToken: 'token-1', profileId: 'profile-1', jobId: 'job-realtime' }

		await act(async () => {
			await result.current.deleteMutation.mutateAsync(
				Array.from({ length: 1001 }, (_, index) => `logs/object-${index}.txt`),
			)
			await Promise.resolve()
		})
		expect(getJob).toHaveBeenCalledOnce()

		await act(async () => {
			await vi.advanceTimersByTimeAsync(60_000)
		})
		expect(getJob).toHaveBeenCalledOnce()
		expect(isObjectJobCompletionClaimed(scope)).toBe(true)

		const completion = { status: 'succeeded' as const }
		await act(async () => {
			expect(completeClaimedObjectJob(scope, completion)).toBe(true)
			await Promise.resolve()
			await Promise.resolve()
		})
		expect(invalidateObjectQueriesForPrefixMock).toHaveBeenCalledOnce()
		expect(isObjectJobCompletionClaimed(scope)).toBe(false)

		act(() => {
			expect(completeClaimedObjectJob(scope, completion)).toBe(true)
		})
		expect(invalidateObjectQueriesForPrefixMock).toHaveBeenCalledOnce()
		expect(publishObjectsRefreshMock).toHaveBeenCalledOnce()

		unmount()
		expect(completeClaimedObjectJob(scope, completion)).toBe(true)
		releaseObjectJobCompletion(scope)
	})

	it('backs off repeated transient delete-job poll failures', async () => {
		vi.useFakeTimers()
		const { Wrapper } = createWrapper()
		const getJob = vi.fn().mockRejectedValue(new APIError({
			status: 500,
			code: 'internal_error',
			message: 'temporary failure',
			normalizedError: { code: 'internal_error', retryable: true },
		}))
		const api = createMockApiClient({ jobs: { getJob } })
		const createJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-backoff', status: 'queued' })
		const { result } = renderHook(
			() =>
				useObjectsDelete({
					api,
					profileId: 'profile-1',
					apiToken: 'token-1',
					bucket: 'bucket-a',
					prefix: 'logs/',
					createJobWithRetry,
					setSelectedKeys: vi.fn(),
				}),
			{ wrapper: Wrapper },
		)

		await act(async () => {
			await result.current.deleteMutation.mutateAsync(
				Array.from({ length: 1001 }, (_, index) => `logs/object-${index}.txt`),
			)
			await Promise.resolve()
		})
		expect(getJob).toHaveBeenCalledOnce()

		await act(async () => {
			await vi.advanceTimersByTimeAsync(999)
		})
		expect(getJob).toHaveBeenCalledOnce()
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1)
		})
		expect(getJob).toHaveBeenCalledTimes(2)
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1999)
		})
		expect(getJob).toHaveBeenCalledTimes(2)
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1)
		})
		expect(getJob).toHaveBeenCalledTimes(3)
	})

	it('ignores stale direct-delete responses after the objects context changes', async () => {
		const { Wrapper, queryClient } = createWrapper()
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')
		const deleteRequest = deferred<{ deleted: number }>()
		const api = createMockApiClient({
			objects: {
				deleteObjects: vi.fn().mockReturnValue(deleteRequest.promise),
			},
		})
		const createJobWithRetry = vi.fn()
		const setSelectedKeys = vi.fn()

		const { result, rerender } = renderHook(
			({ apiToken, profileId, bucket, prefix }) =>
				useObjectsDelete({
					api,
					profileId,
					apiToken,
					bucket,
					prefix,
					createJobWithRetry,
					setSelectedKeys,
				}),
			{
				initialProps: { apiToken: 'token-1', profileId: 'profile-1', bucket: 'bucket-a', prefix: 'logs/' },
				wrapper: Wrapper,
			},
		)

		let deletePromise!: Promise<unknown>
		await act(async () => {
			deletePromise = result.current.deleteMutation.mutateAsync(['logs/app.log'])
		})
		await waitFor(() => expect(result.current.deleteMutation.isPending).toBe(true))

		rerender({ apiToken: 'token-1', profileId: 'profile-2', bucket: 'bucket-b', prefix: 'archive/' })
		expect(result.current.deleteMutation.isPending).toBe(false)
		expect(result.current.deletingKey).toBeNull()

		await act(async () => {
			deleteRequest.resolve({ deleted: 1 })
			await deletePromise
		})

		expect(setSelectedKeys).not.toHaveBeenCalled()
		expect(messageSuccessMock).not.toHaveBeenCalled()
		expect(invalidateQueriesSpy).not.toHaveBeenCalledWith({ queryKey: queryKeys.jobs.scope('profile-1', 'token-1'), exact: false })
		expect(invalidateObjectQueriesForPrefixMock).not.toHaveBeenCalled()
		expect(publishObjectsRefreshMock).not.toHaveBeenCalled()
	})

	it('ignores stale direct-delete responses after the api token changes', async () => {
		const { Wrapper, queryClient } = createWrapper()
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')
		const deleteRequest = deferred<{ deleted: number }>()
		const api = createMockApiClient({
			objects: {
				deleteObjects: vi.fn().mockReturnValue(deleteRequest.promise),
			},
		})
		const createJobWithRetry = vi.fn()
		const setSelectedKeys = vi.fn()

		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsDelete({
					api,
					profileId: 'profile-1',
					apiToken,
					bucket: 'bucket-a',
					prefix: 'logs/',
					createJobWithRetry,
					setSelectedKeys,
				}),
			{
				initialProps: { apiToken: 'token-1' },
				wrapper: Wrapper,
			},
		)

		let deletePromise!: Promise<unknown>
		await act(async () => {
			deletePromise = result.current.deleteMutation.mutateAsync(['logs/app.log'])
		})
		await waitFor(() => expect(result.current.deleteMutation.isPending).toBe(true))

		rerender({ apiToken: 'token-2' })
		expect(result.current.deleteMutation.isPending).toBe(false)
		expect(result.current.deletingKey).toBeNull()

		await act(async () => {
			deleteRequest.resolve({ deleted: 1 })
			await deletePromise
		})

		expect(setSelectedKeys).not.toHaveBeenCalled()
		expect(messageSuccessMock).not.toHaveBeenCalled()
		expect(invalidateQueriesSpy).not.toHaveBeenCalledWith({ queryKey: queryKeys.jobs.scope('profile-1', 'token-2'), exact: false })
		expect(invalidateObjectQueriesForPrefixMock).not.toHaveBeenCalled()
		expect(publishObjectsRefreshMock).not.toHaveBeenCalled()
	})

	it('ignores stale delete-prefix job responses after the objects context changes', async () => {
		const { Wrapper, queryClient } = createWrapper()
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')
		const jobRequest = deferred<{ id: string }>()
		const api = createMockApiClient({
			jobs: {
				getJob: vi.fn(),
			},
		})
		const createJobWithRetry = vi.fn().mockReturnValue(jobRequest.promise)
		const setSelectedKeys = vi.fn()

		const { result, rerender } = renderHook(
			({ apiToken, profileId, bucket, prefix }) =>
				useObjectsDelete({
					api,
					profileId,
					apiToken,
					bucket,
					prefix,
					createJobWithRetry,
					setSelectedKeys,
				}),
			{
				initialProps: { apiToken: 'token-1', profileId: 'profile-1', bucket: 'bucket-a', prefix: 'logs/' },
				wrapper: Wrapper,
			},
		)

		let deletePromise!: Promise<unknown>
		await act(async () => {
			deletePromise = result.current.deletePrefixJobMutation.mutateAsync({
				prefix: 'logs/',
				dryRun: false,
			})
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))
		expect(result.current.deletePrefixJobMutation.isPending).toBe(true)

		rerender({ apiToken: 'token-1', profileId: 'profile-2', bucket: 'bucket-b', prefix: 'archive/' })
		expect(result.current.deletePrefixJobMutation.isPending).toBe(false)

		await act(async () => {
			jobRequest.resolve({ id: 'job-stale' })
			await deletePromise
		})

		expect(messageSuccessMock).not.toHaveBeenCalled()
		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.jobs.scope('profile-1', 'token-1'), exact: false })
		expect(api.jobs.getJob).not.toHaveBeenCalled()
	})
})
