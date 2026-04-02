import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TransfersContextValue } from '../../../components/Transfers'
import { useObjectsZipJobs } from '../useObjectsZipJobs'

const messageOpenMock = vi.fn()
const messageErrorMock = vi.fn()

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		message: {
			open: (...args: unknown[]) => messageOpenMock(...args),
			error: (...args: unknown[]) => messageErrorMock(...args),
		},
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
		return (
			<MemoryRouter>
				<QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
			</MemoryRouter>
		)
	}

	return { Wrapper, queryClient }
}

function createTransfersStub(): TransfersContextValue {
	return {
		activeTab: 'downloads',
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

describe('useObjectsZipJobs', () => {
	afterEach(() => {
		vi.restoreAllMocks()
		messageOpenMock.mockClear()
		messageErrorMock.mockClear()
	})

	it('ignores stale prefix-zip responses after the objects context changes', async () => {
		const { Wrapper, queryClient } = createWrapper()
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')
		const pendingJob = deferred<{ id: string; status: string }>()
		const createJobWithRetry = vi.fn().mockReturnValue(pendingJob.promise)
		const transfers = createTransfersStub()

		const { result, rerender } = renderHook(
			({ apiToken, profileId, bucket, prefix }) =>
				useObjectsZipJobs({
					profileId,
					apiToken,
					bucket,
					prefix,
					transfers,
					createJobWithRetry,
				}),
			{
				initialProps: { apiToken: 'token-1', profileId: 'profile-1', bucket: 'bucket-a', prefix: 'docs/' },
				wrapper: Wrapper,
			},
		)

		act(() => {
			result.current.zipPrefixJobMutation.mutate({ prefix: 'logs/' })
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))

		rerender({ apiToken: 'token-1', profileId: 'profile-2', bucket: 'bucket-b', prefix: 'archive/' })

		await act(async () => {
			pendingJob.resolve({ id: 'job-stale-prefix', status: 'queued' })
			await Promise.resolve()
		})

		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token-1'], exact: false })
		expect(transfers.queueDownloadJobArtifact).not.toHaveBeenCalled()
		expect(messageOpenMock).not.toHaveBeenCalled()
	})

	it('ignores stale object-zip responses after the objects context changes', async () => {
		const { Wrapper, queryClient } = createWrapper()
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')
		const pendingJob = deferred<{ id: string; status: string }>()
		const createJobWithRetry = vi.fn().mockReturnValue(pendingJob.promise)
		const transfers = createTransfersStub()

		const { result, rerender } = renderHook(
			({ apiToken, profileId, bucket, prefix }) =>
				useObjectsZipJobs({
					profileId,
					apiToken,
					bucket,
					prefix,
					transfers,
					createJobWithRetry,
				}),
			{
				initialProps: { apiToken: 'token-1', profileId: 'profile-1', bucket: 'bucket-a', prefix: 'docs/' },
				wrapper: Wrapper,
			},
		)

		act(() => {
			result.current.zipObjectsJobMutation.mutate({ keys: ['docs/a.txt', 'docs/b.txt'] })
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))

		rerender({ apiToken: 'token-1', profileId: 'profile-2', bucket: 'bucket-b', prefix: 'archive/' })

		await act(async () => {
			pendingJob.resolve({ id: 'job-stale-objects', status: 'queued' })
			await Promise.resolve()
		})

		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token-1'], exact: false })
		expect(transfers.queueDownloadJobArtifact).not.toHaveBeenCalled()
		expect(messageOpenMock).not.toHaveBeenCalled()
	})

	it('ignores stale prefix-zip responses after the api token changes', async () => {
		const { Wrapper, queryClient } = createWrapper()
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')
		const pendingJob = deferred<{ id: string; status: string }>()
		const createJobWithRetry = vi.fn().mockReturnValue(pendingJob.promise)
		const transfers = createTransfersStub()

		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsZipJobs({
					profileId: 'profile-1',
					apiToken,
					bucket: 'bucket-a',
					prefix: 'docs/',
					transfers,
					createJobWithRetry,
				}),
			{
				initialProps: { apiToken: 'token-1' },
				wrapper: Wrapper,
			},
		)

		act(() => {
			result.current.zipPrefixJobMutation.mutate({ prefix: 'logs/' })
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))

		rerender({ apiToken: 'token-2' })

		await act(async () => {
			pendingJob.resolve({ id: 'job-stale-prefix', status: 'queued' })
			await Promise.resolve()
		})

		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token-1'], exact: false })
		expect(transfers.queueDownloadJobArtifact).not.toHaveBeenCalled()
		expect(messageOpenMock).not.toHaveBeenCalled()
	})
})
