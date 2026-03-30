import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ensureDomShims } from '../../../test/domShims'
import { createMockApiClient } from '../../../test/mockApiClient'
import type { TransfersContextValue } from '../../../components/Transfers'
import { useJobsPageController } from '../useJobsPageController'

const {
	apiClientRef,
	transfersRef,
	messageSuccess,
	messageError,
	messageInfo,
	messageWarning,
	retryRealtimeMock,
} = vi.hoisted(() => ({
	apiClientRef: { current: null as ReturnType<typeof createMockApiClient> | null },
	transfersRef: { current: null as TransfersContextValue | null },
	messageSuccess: vi.fn(),
	messageError: vi.fn(),
	messageInfo: vi.fn(),
	messageWarning: vi.fn(),
	retryRealtimeMock: vi.fn(),
}))

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		message: {
			success: (...args: unknown[]) => messageSuccess(...args),
			error: (...args: unknown[]) => messageError(...args),
			info: (...args: unknown[]) => messageInfo(...args),
			warning: (...args: unknown[]) => messageWarning(...args),
		},
	}
})

vi.mock('../../../api/client', async () => {
	const actual = await vi.importActual<typeof import('../../../api/client')>('../../../api/client')
	return {
		...actual,
		APIClient: vi.fn().mockImplementation(() => apiClientRef.current),
	}
})

vi.mock('../../../components/useTransfers', () => ({
	useTransfers: () => transfersRef.current,
}))

vi.mock('../useJobsRealtimeEvents', () => ({
	useJobsRealtimeEvents: () => ({
		eventsConnected: true,
		eventsTransport: 'ws' as const,
		eventsRetryCount: 0,
		eventsRetryThreshold: 3,
		retryRealtime: retryRealtimeMock,
	}),
}))

vi.mock('../useJobsActionMutations', () => ({
	useJobsActionMutations: () => ({
		cancelingJobId: null,
		retryingJobId: null,
		deletingJobId: null,
		cancelMutation: { mutate: vi.fn(), isPending: false },
		retryMutation: { mutate: vi.fn(), isPending: false },
		deleteJobMutation: { mutateAsync: vi.fn(), isPending: false },
	}),
}))

vi.mock('../useJobsTableColumns', () => ({
	useJobsTableColumns: () => [],
}))

vi.mock('../../../lib/useIsOffline', () => ({
	useIsOffline: () => false,
}))

vi.mock('../../../lib/jobQueue', () => ({
	withJobQueueRetry: (fn: () => Promise<unknown>) => fn(),
}))

beforeAll(() => {
	ensureDomShims()
})

function setMatchMedia(matches: boolean) {
	Object.defineProperty(window, 'matchMedia', {
		writable: true,
		value: vi.fn().mockImplementation(() => ({
			matches,
			media: '(min-width: 768px)',
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	})
}

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (error?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
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
		return (
			<QueryClientProvider client={queryClient}>
				<MemoryRouter>{props.children}</MemoryRouter>
			</QueryClientProvider>
		)
	}
}

describe('useJobsPageController', () => {
	beforeEach(() => {
		setMatchMedia(true)
		localStorage.clear()
		messageSuccess.mockReset()
		messageError.mockReset()
		messageInfo.mockReset()
		messageWarning.mockReset()
		retryRealtimeMock.mockReset()
		transfersRef.current = createTransfersStub()
	})

	it('ignores stale device download responses after closing the modal', async () => {
		const listObjectsRequest = deferred<{
			items: Array<{ key: string; size: number }>
			commonPrefixes: string[]
			isTruncated: boolean
			nextContinuationToken?: string | null
		}>()
		const listObjects = vi.fn().mockReturnValueOnce(listObjectsRequest.promise)
		apiClientRef.current = createMockApiClient({
			server: {
				getMeta: vi.fn().mockResolvedValue({ capabilities: { providers: {} } }),
			},
			profiles: {
				listProfiles: vi.fn().mockResolvedValue([]),
			},
			buckets: {
				listBuckets: vi.fn().mockResolvedValue([]),
			},
			jobs: {
				listJobs: vi.fn().mockResolvedValue({ items: [], nextCursor: undefined }),
			},
			objects: {
				listObjects,
			},
		})

		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		})

		const { result } = renderHook(
			() =>
				useJobsPageController({
					apiToken: 'token',
					profileId: 'profile-1',
				}),
			{ wrapper: createWrapper(queryClient) },
		)

		await waitFor(() => expect(listObjects).not.toHaveBeenCalled())

		act(() => {
			result.current.onOpenCreateDownload()
			result.current.onCreateDownload({
				bucket: 'bucket-a',
				prefix: 'logs/',
				dirHandle: { name: 'downloads' } as FileSystemDirectoryHandle,
			})
		})

		await waitFor(() => expect(listObjects).toHaveBeenCalledTimes(1))
		expect(result.current.deviceDownloadLoading).toBe(true)

		act(() => {
			result.current.onCloseDownload()
		})

		await act(async () => {
			listObjectsRequest.resolve({
				items: [{ key: 'logs/app.log', size: 128 }],
				commonPrefixes: [],
				isTruncated: false,
				nextContinuationToken: undefined,
			})
			await Promise.resolve()
		})

		expect(transfersRef.current?.queueDownloadObjectsToDevice).not.toHaveBeenCalled()
		expect(result.current.createDownloadOpen).toBe(false)
		expect(result.current.deviceDownloadLoading).toBe(false)
	})

	it('keeps the current delete modal open when an older create request resolves', async () => {
		const createJobRequest = deferred<{ id: string }>()
		const createJob = vi.fn().mockReturnValueOnce(createJobRequest.promise)
		apiClientRef.current = createMockApiClient({
			server: {
				getMeta: vi.fn().mockResolvedValue({ capabilities: { providers: {} } }),
			},
			profiles: {
				listProfiles: vi.fn().mockResolvedValue([]),
			},
			buckets: {
				listBuckets: vi.fn().mockResolvedValue([]),
			},
			jobs: {
				listJobs: vi.fn().mockResolvedValue({ items: [], nextCursor: undefined }),
				createJob,
			},
		})

		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		})
		const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

		const { result } = renderHook(
			() =>
				useJobsPageController({
					apiToken: 'token',
					profileId: 'profile-1',
				}),
			{ wrapper: createWrapper(queryClient) },
		)

		act(() => {
			result.current.onOpenDeleteJob()
			result.current.onCreateDelete({
				bucket: 'bucket-a',
				prefix: 'logs/',
				deleteAll: false,
				allowUnsafePrefix: false,
				include: [],
				exclude: [],
				dryRun: false,
			})
		})

		await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1))

		act(() => {
			result.current.onCloseDelete()
			result.current.onOpenDeleteJob()
		})

		await act(async () => {
			createJobRequest.resolve({ id: 'job-delete-1' })
			await Promise.resolve()
		})

		expect(result.current.createDeleteOpen).toBe(true)
		expect(messageSuccess).not.toHaveBeenCalled()
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token'], exact: false })
	})

	it('closes transient overlays when the api token changes for the same profile', async () => {
		apiClientRef.current = createMockApiClient({
			server: {
				getMeta: vi.fn().mockResolvedValue({ capabilities: { providers: {} } }),
			},
			profiles: {
				listProfiles: vi.fn().mockResolvedValue([]),
			},
			buckets: {
				listBuckets: vi.fn().mockResolvedValue([]),
			},
			jobs: {
				listJobs: vi.fn().mockResolvedValue({ items: [], nextCursor: undefined }),
			},
		})

		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		})

		const { result, rerender } = renderHook(
			(props: { apiToken: string; profileId: string | null }) => useJobsPageController(props),
			{
				initialProps: { apiToken: 'token-a', profileId: 'profile-1' as string | null },
				wrapper: createWrapper(queryClient),
			},
		)

		act(() => {
			result.current.onOpenCreateUpload()
			result.current.onOpenCreateDownload()
			result.current.onOpenDeleteJob()
			result.current.onOpenDetails('job-1')
			result.current.onOpenLogs('job-1')
		})

		expect(result.current.createOpen).toBe(true)
		expect(result.current.createDownloadOpen).toBe(true)
		expect(result.current.createDeleteOpen).toBe(true)
		expect(result.current.detailsOpen).toBe(true)
		expect(result.current.logDrawerRequest.jobId).toBe('job-1')

		rerender({ apiToken: 'token-b', profileId: 'profile-1' })

		expect(result.current.createOpen).toBe(false)
		expect(result.current.createDownloadOpen).toBe(false)
		expect(result.current.createDeleteOpen).toBe(false)
		expect(result.current.detailsOpen).toBe(false)
		expect(result.current.detailsJobId).toBeNull()
		expect(result.current.logDrawerRequest.jobId).toBeNull()
	})
})
