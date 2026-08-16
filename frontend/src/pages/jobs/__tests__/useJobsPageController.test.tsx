import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, type InitialEntry } from 'react-router'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { queryKeys } from '../../../api/queryKeys'
import { ensureDomShims } from '../../../test/domShims'
import { createMockApiClient } from '../../../test/mockApiClient'
import type { TransfersContextValue } from '../../../components/transfersTypes'
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

vi.mock('../../../api/useAPIClient', () => ({
	useAPIClient: () => apiClientRef.current,
}))

vi.mock('../../../components/useTransfers', () => ({
	useTransfers: () => transfersRef.current,
	useTransfersCommands: () => transfersRef.current,
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

function createWrapper(queryClient: QueryClient, initialEntries: InitialEntry[] = ['/']) {
	return function Wrapper(props: PropsWithChildren) {
		return (
			<QueryClientProvider client={queryClient}>
				<MemoryRouter initialEntries={initialEntries}>{props.children}</MemoryRouter>
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
			result.current.overlaysHost.createFlow.onSubmitDelete({
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
			result.current.overlaysHost.createFlow.onCloseDelete()
			result.current.onOpenDeleteJob()
		})

		await act(async () => {
			createJobRequest.resolve({ id: 'job-delete-1' })
			await Promise.resolve()
		})

		expect(result.current.overlaysHost.createFlow.createDeleteOpen).toBe(true)
		expect(messageSuccess).not.toHaveBeenCalled()
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.jobs.scope('profile-1', 'token'), exact: false })
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
			result.current.onOpenDeleteJob()
			result.current.onOpenDetails('job-1')
			result.current.overlaysHost.detailsState.onOpenLogs('job-1')
		})

		expect(result.current.overlaysHost.createFlow.createDeleteOpen).toBe(true)
		expect(result.current.overlaysHost.detailsState.detailsOpen).toBe(true)
		expect(result.current.overlaysHost.logsState.logRequestJobId).toBe('job-1')

		rerender({ apiToken: 'token-b', profileId: 'profile-1' })

		expect(result.current.overlaysHost.createFlow.createDeleteOpen).toBe(false)
		expect(result.current.overlaysHost.detailsState.detailsOpen).toBe(false)
		expect(result.current.overlaysHost.detailsState.detailsJobId).toBeNull()
		expect(result.current.overlaysHost.logsState.logRequestJobId).toBeNull()
	})

	it('hydrates the delete modal prefill from route state on initial render', async () => {
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

		const { result } = renderHook(
			() =>
				useJobsPageController({
					apiToken: 'token',
					profileId: 'profile-1',
				}),
			{
				wrapper: createWrapper(queryClient, [
					{
						pathname: '/jobs',
						state: {
							openDeleteJob: true,
							bucket: 'bucket-a',
							prefix: 'logs/',
							deleteAll: true,
						},
					},
				]),
			},
		)

		await waitFor(() => expect(result.current.overlaysHost.createFlow.createDeleteOpen).toBe(true))
		expect(result.current.overlaysHost.bucketState.deleteBucket).toBe('bucket-a')
		expect(result.current.overlaysHost.bucketState.deletePrefill).toEqual({
			prefix: 'logs/',
			deleteAll: true,
		})
	})

})
