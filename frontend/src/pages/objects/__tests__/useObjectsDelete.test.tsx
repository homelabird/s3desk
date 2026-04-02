import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMockApiClient } from '../../../test/mockApiClient'
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
		vi.restoreAllMocks()
		messageSuccessMock.mockClear()
		messageErrorMock.mockClear()
		invalidateObjectQueriesForPrefixMock.mockClear()
		publishObjectsRefreshMock.mockClear()
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

		rerender({ apiToken: 'token-1', profileId: 'profile-2', bucket: 'bucket-b', prefix: 'archive/' })

		await act(async () => {
			deleteRequest.resolve({ deleted: 1 })
			await deletePromise
		})

		expect(setSelectedKeys).not.toHaveBeenCalled()
		expect(messageSuccessMock).not.toHaveBeenCalled()
		expect(invalidateQueriesSpy).not.toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token-1'], exact: false })
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

		rerender({ apiToken: 'token-2' })

		await act(async () => {
			deleteRequest.resolve({ deleted: 1 })
			await deletePromise
		})

		expect(setSelectedKeys).not.toHaveBeenCalled()
		expect(messageSuccessMock).not.toHaveBeenCalled()
		expect(invalidateQueriesSpy).not.toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token-2'], exact: false })
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

		rerender({ apiToken: 'token-1', profileId: 'profile-2', bucket: 'bucket-b', prefix: 'archive/' })

		await act(async () => {
			jobRequest.resolve({ id: 'job-stale' })
			await deletePromise
		})

		expect(messageSuccessMock).not.toHaveBeenCalled()
		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token-1'], exact: false })
		expect(api.jobs.getJob).not.toHaveBeenCalled()
	})
})
