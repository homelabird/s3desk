import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { type PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { queryKeys } from '../../../api/queryKeys'
import type { Job, JobsListResponse } from '../../../api/types'
import { createMockApiClient } from '../../../test/mockApiClient'
import { useJobsUploadDetails } from '../useJobsUploadDetails'

function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: 30_000 },
			mutations: { retry: false },
		},
	})
}

function createWrapper(queryClient = createQueryClient()) {
	return ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function cacheJobsList(
	queryClient: QueryClient,
	profileId: string,
	apiToken: string,
	job: Job,
	updatedAt: number,
	secondPage = false,
) {
	const data: InfiniteData<JobsListResponse, string | undefined> = secondPage
		? {
				pages: [{ items: [], nextCursor: 'next-page' }, { items: [job] }],
				pageParams: [undefined, 'next-page'],
			}
		: { pages: [{ items: [job] }], pageParams: [undefined] }
	queryClient.setQueryData(queryKeys.jobs.list(profileId, apiToken, 'all', '', ''), data, { updatedAt })
}

describe('useJobsUploadDetails', () => {
	it('uses a fresh matching job from a loaded list page without refetching details', async () => {
		const cachedJob: Job = {
			id: 'job-cached',
			type: 'transfer_delete_prefix',
			status: 'succeeded',
			payload: { bucket: 'demo-bucket', prefix: 'cached/' },
			createdAt: '2024-01-01T00:00:00Z',
		}
		const queryClient = createQueryClient()
		cacheJobsList(queryClient, 'profile-1', 'token', cachedJob, Date.now())
		const getJob = vi.fn().mockResolvedValue(cachedJob)
		const api = createMockApiClient({ jobs: { getJob } })

		const { result } = renderHook(
			() =>
				useJobsUploadDetails({
					api,
					profileId: 'profile-1',
					apiToken: 'token',
					detailsJobId: cachedJob.id,
					detailsOpen: true,
				}),
			{ wrapper: createWrapper(queryClient) },
		)

		await waitFor(() => expect(result.current.jobDetailsQuery.data).toEqual(cachedJob))
		expect(result.current.jobDetailsQuery.fetchStatus).toBe('idle')
		expect(getJob).not.toHaveBeenCalled()
	})

	it('refetches details seeded from a multi-page list cache', async () => {
		const cachedJob: Job = {
			id: 'job-page-two',
			type: 'transfer_delete_prefix',
			status: 'running',
			payload: { source: 'page-two' },
			createdAt: '2024-01-01T00:00:00Z',
		}
		const refreshedJob: Job = { ...cachedJob, payload: { source: 'detail-api' } }
		const queryClient = createQueryClient()
		cacheJobsList(queryClient, 'profile-1', 'token', cachedJob, Date.now(), true)
		const getJob = vi.fn().mockResolvedValue(refreshedJob)
		const api = createMockApiClient({ jobs: { getJob } })

		const { result } = renderHook(
			() =>
				useJobsUploadDetails({
					api,
					profileId: 'profile-1',
					apiToken: 'token',
					detailsJobId: cachedJob.id,
					detailsOpen: true,
				}),
			{ wrapper: createWrapper(queryClient) },
		)

		await waitFor(() => expect(result.current.jobDetailsQuery.data).toEqual(refreshedJob))
		expect(getJob).toHaveBeenCalledTimes(1)
	})

	it('refetches details when the matching list cache is stale', async () => {
		const cachedJob: Job = {
			id: 'job-stale',
			type: 'transfer_delete_prefix',
			status: 'running',
			payload: { bucket: 'demo-bucket', prefix: 'stale/' },
			createdAt: '2024-01-01T00:00:00Z',
		}
		const refreshedJob: Job = { ...cachedJob, status: 'succeeded' }
		const queryClient = createQueryClient()
		cacheJobsList(queryClient, 'profile-1', 'token', cachedJob, 1)
		const getJob = vi.fn().mockResolvedValue(refreshedJob)
		const api = createMockApiClient({ jobs: { getJob } })

		const { result } = renderHook(
			() =>
				useJobsUploadDetails({
					api,
					profileId: 'profile-1',
					apiToken: 'token',
					detailsJobId: cachedJob.id,
					detailsOpen: true,
				}),
			{ wrapper: createWrapper(queryClient) },
		)

		await waitFor(() => expect(result.current.jobDetailsQuery.data).toEqual(refreshedJob))
		expect(getJob).toHaveBeenCalledTimes(1)
		expect(getJob).toHaveBeenCalledWith('profile-1', cachedJob.id)
	})

	it('refetches details when the matching list cache was invalidated', async () => {
		const cachedJob: Job = {
			id: 'job-invalidated',
			type: 'transfer_delete_prefix',
			status: 'running',
			payload: { source: 'invalidated-list' },
			createdAt: '2024-01-01T00:00:00Z',
		}
		const refreshedJob: Job = { ...cachedJob, payload: { source: 'detail-api' } }
		const queryClient = createQueryClient()
		const jobsQueryKey = queryKeys.jobs.list('profile-1', 'token', 'all', '', '')
		cacheJobsList(queryClient, 'profile-1', 'token', cachedJob, Date.now())
		await queryClient.invalidateQueries({ queryKey: jobsQueryKey, exact: true, refetchType: 'none' })
		const getJob = vi.fn().mockResolvedValue(refreshedJob)
		const api = createMockApiClient({ jobs: { getJob } })

		const { result } = renderHook(
			() =>
				useJobsUploadDetails({
					api,
					profileId: 'profile-1',
					apiToken: 'token',
					detailsJobId: cachedJob.id,
					detailsOpen: true,
				}),
			{ wrapper: createWrapper(queryClient) },
		)

		await waitFor(() => expect(result.current.jobDetailsQuery.data).toEqual(refreshedJob))
		expect(getJob).toHaveBeenCalledTimes(1)
	})

	it('does not seed details from another profile or api token', async () => {
		const cachedJob: Job = {
			id: 'job-scoped',
			type: 'transfer_delete_prefix',
			status: 'running',
			payload: { source: 'wrong-scope' },
			createdAt: '2024-01-01T00:00:00Z',
		}
		const fetchedJob: Job = { ...cachedJob, payload: { source: 'detail-api' } }
		const queryClient = createQueryClient()
		cacheJobsList(queryClient, 'profile-2', 'token', cachedJob, Date.now())
		cacheJobsList(queryClient, 'profile-1', 'other-token', cachedJob, Date.now())
		const getJob = vi.fn().mockResolvedValue(fetchedJob)
		const api = createMockApiClient({ jobs: { getJob } })

		const { result } = renderHook(
			() =>
				useJobsUploadDetails({
					api,
					profileId: 'profile-1',
					apiToken: 'token',
					detailsJobId: cachedJob.id,
					detailsOpen: true,
				}),
			{ wrapper: createWrapper(queryClient) },
		)

		await waitFor(() => expect(result.current.jobDetailsQuery.data).toEqual(fetchedJob))
		expect(getJob).toHaveBeenCalledTimes(1)
	})

	it('parses upload details for direct upload jobs', async () => {
		const getJob = vi.fn().mockResolvedValue({
			id: 'job-direct-upload',
			type: 'transfer_direct_upload',
			status: 'succeeded',
			payload: {
				bucket: 'demo-bucket',
				prefix: 'exports/',
				rootKind: 'file',
				rootName: 'alpha.txt',
				totalFiles: 1,
				totalBytes: 110676,
				items: [{ path: 'alpha.txt', key: 'exports/alpha.txt', size: 110676, etag: 'etag-alpha' }],
			},
			createdAt: '2024-01-01T00:00:00Z',
		})
		const getObjectMeta = vi.fn()
		const api = createMockApiClient({
			jobs: {
				getJob,
			},
			objects: {
				getObjectMeta,
			},
		})

		const { result } = renderHook(
			() =>
				useJobsUploadDetails({
					api,
					profileId: 'profile-1',
					apiToken: 'token',
					detailsJobId: 'job-direct-upload',
					detailsOpen: true,
				}),
			{
				wrapper: createWrapper(),
			},
		)

		await waitFor(() => {
			expect(result.current.uploadTablePageItems[0]?.etag).toBe('etag-alpha')
		})

		expect(result.current.uploadRootLabel).toBe('file alpha.txt')
		expect(result.current.uploadTablePageItems).toEqual([
			{
				key: 'exports/alpha.txt',
				path: 'alpha.txt',
				size: 110676,
				etag: 'etag-alpha',
			},
		])
		expect(getJob).toHaveBeenCalledWith('profile-1', 'job-direct-upload')
		expect(getObjectMeta).not.toHaveBeenCalled()
	})

	it('fetches only hashes missing from a verified upload payload', async () => {
		const getObjectMeta = vi.fn().mockResolvedValue({ etag: 'etag-legacy' })
		const api = createMockApiClient({
			jobs: {
				getJob: vi.fn().mockResolvedValue({
					id: 'job-direct-upload',
					type: 'transfer_direct_upload',
					status: 'succeeded',
					payload: {
						bucket: 'demo-bucket',
						items: [
							{ path: 'known.txt', key: 'known.txt', etag: 'etag-known' },
							{ path: 'hashless.txt', key: 'hashless.txt', etag: '' },
							{ path: 'legacy.txt', key: 'legacy.txt' },
						],
					},
					createdAt: '2024-01-01T00:00:00Z',
				}),
			},
			objects: { getObjectMeta },
		})

		const { result } = renderHook(
			() =>
				useJobsUploadDetails({
					api,
					profileId: 'profile-1',
					apiToken: 'token',
					detailsJobId: 'job-direct-upload',
					detailsOpen: true,
				}),
			{ wrapper: createWrapper() },
		)

		await waitFor(() => expect(result.current.uploadTablePageItems[2]?.etag).toBe('etag-legacy'))

		expect(result.current.uploadTablePageItems.map((item) => item.etag)).toEqual(['etag-known', '', 'etag-legacy'])
		expect(getObjectMeta).toHaveBeenCalledTimes(1)
		expect(getObjectMeta).toHaveBeenCalledWith(expect.objectContaining({
			profileId: 'profile-1',
			bucket: 'demo-bucket',
			key: 'legacy.txt',
			signal: expect.any(AbortSignal),
		}))
	})

	it('refetches upload etags when the api token changes', async () => {
		const getJob = vi.fn().mockResolvedValue({
			id: 'job-direct-upload',
			type: 'transfer_direct_upload',
			status: 'succeeded',
			payload: {
				bucket: 'demo-bucket',
				prefix: 'exports/',
				items: [{ path: 'alpha.txt', key: 'exports/alpha.txt', size: 110676 }],
			},
			createdAt: '2024-01-01T00:00:00Z',
		})
		const getObjectMeta = vi
			.fn()
			.mockResolvedValueOnce({ etag: 'etag-alpha' })
			.mockResolvedValueOnce({ etag: 'etag-beta' })
		const api = createMockApiClient({
			jobs: {
				getJob,
			},
			objects: {
				getObjectMeta,
			},
		})

		const { result, rerender } = renderHook(
			(props: { apiToken: string }) =>
				useJobsUploadDetails({
					api,
					profileId: 'profile-1',
					apiToken: props.apiToken,
					detailsJobId: 'job-direct-upload',
					detailsOpen: true,
				}),
			{
				initialProps: { apiToken: 'token-a' },
				wrapper: createWrapper(),
			},
		)

		await waitFor(() => {
			expect(result.current.uploadTablePageItems[0]?.etag).toBe('etag-alpha')
		})

		rerender({ apiToken: 'token-b' })

		await waitFor(() => {
			expect(result.current.uploadTablePageItems[0]?.etag).toBe('etag-beta')
		})

		expect(getObjectMeta).toHaveBeenCalledTimes(2)
	})

	it('loads object metadata only for the visible upload page', async () => {
		const firstPageKeys = Array.from({ length: 20 }, (_, index) => `file-${index}`)
		const secondPageKeys = Array.from({ length: 5 }, (_, index) => firstPageKeys.slice(index * 4, index * 4 + 4).join('|'))
		const items = [...firstPageKeys, ...secondPageKeys].map((key, index) => ({
			path: `file-${index}.txt`,
			key,
		}))
		const getObjectMeta = vi.fn().mockResolvedValue({ etag: 'etag' })
		const api = createMockApiClient({
			jobs: {
				getJob: vi.fn().mockResolvedValue({
					id: 'job-direct-upload',
					type: 'transfer_direct_upload',
					status: 'succeeded',
					payload: { bucket: 'demo-bucket', items },
					createdAt: '2024-01-01T00:00:00Z',
				}),
			},
			objects: { getObjectMeta },
		})

		const { result } = renderHook(
			() =>
				useJobsUploadDetails({
					api,
					profileId: 'profile-1',
					apiToken: 'token',
					detailsJobId: 'job-direct-upload',
					detailsOpen: true,
				}),
			{ wrapper: createWrapper() },
		)

		await waitFor(() => expect(getObjectMeta).toHaveBeenCalledTimes(20))
		expect(getObjectMeta.mock.calls.map(([request]) => request.key)).toEqual(items.slice(0, 20).map((item) => item.key))

		act(() => result.current.goToNextUploadTablePage())

		await waitFor(() => expect(getObjectMeta).toHaveBeenCalledTimes(25))
		expect(getObjectMeta.mock.calls.map(([request]) => request.key)).toEqual(items.map((item) => item.key))
		expect(result.current.uploadTablePageItems.map((item) => item.key)).toEqual(items.slice(20).map((item) => item.key))
	})

	it('aborts every visible-page metadata request when the details view closes', async () => {
		const signals: AbortSignal[] = []
		const getObjectMeta = vi.fn((request: { signal?: AbortSignal }) => {
			if (request.signal) signals.push(request.signal)
			return new Promise<never>((_, reject) => {
				request.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
			})
		})
		const api = createMockApiClient({
			jobs: {
				getJob: vi.fn().mockResolvedValue({
					id: 'job-direct-upload',
					type: 'transfer_direct_upload',
					status: 'succeeded',
					payload: {
						bucket: 'demo-bucket',
						items: [
							{ path: 'alpha.txt', key: 'alpha.txt' },
							{ path: 'beta.txt', key: 'beta.txt' },
						],
					},
					createdAt: '2024-01-01T00:00:00Z',
				}),
			},
			objects: { getObjectMeta },
		})
		const { rerender } = renderHook(
			({ detailsOpen }: { detailsOpen: boolean }) =>
				useJobsUploadDetails({
					api,
					profileId: 'profile-1',
					apiToken: 'token',
					detailsJobId: 'job-direct-upload',
					detailsOpen,
				}),
			{ initialProps: { detailsOpen: true }, wrapper: createWrapper() },
		)

		await waitFor(() => expect(getObjectMeta).toHaveBeenCalledTimes(2))
		expect(signals).toHaveLength(2)

		rerender({ detailsOpen: false })

		expect(signals.every((signal) => signal.aborted)).toBe(true)
	})

	it('starts a cached job on its first upload page', async () => {
		const buildJob = (id: string) => ({
			id,
			type: 'transfer_direct_upload',
			status: 'succeeded',
			payload: {
				bucket: 'demo-bucket',
				items: Array.from({ length: 4 }, (_, index) => ({
					path: `${id}-${index}`,
					key: `${id}-${index}`,
				})),
			},
			createdAt: '2024-01-01T00:00:00Z',
		})
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
		queryClient.setQueryData(queryKeys.jobs.detail('profile-1', 'job-a', 'token'), buildJob('job-a'))
		queryClient.setQueryData(queryKeys.jobs.detail('profile-1', 'job-b', 'token'), buildJob('job-b'))
		const getObjectMeta = vi.fn().mockResolvedValue({ etag: 'etag' })
		const api = createMockApiClient({
			jobs: { getJob: vi.fn() },
			objects: { getObjectMeta },
		})
		const wrapper = ({ children }: PropsWithChildren) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		)

		const { result, rerender } = renderHook(
			({ jobId }: { jobId: string }) =>
				useJobsUploadDetails({
					api,
					profileId: 'profile-1',
					apiToken: 'token',
					detailsJobId: jobId,
					detailsOpen: true,
					uploadTablePageSize: 2,
				}),
			{ initialProps: { jobId: 'job-a' }, wrapper },
		)

		await waitFor(() => expect(getObjectMeta).toHaveBeenCalledTimes(2))
		act(() => result.current.goToNextUploadTablePage())
		await waitFor(() => expect(getObjectMeta).toHaveBeenCalledTimes(4))

		rerender({ jobId: 'job-b' })
		await waitFor(() => expect(result.current.uploadTablePageItems[0]?.etag).toBe('etag'))

		expect(
			getObjectMeta.mock.calls.map(([request]) => request.key).filter((key) => key.startsWith('job-b')),
		).toEqual(['job-b-0', 'job-b-1'])
	})
})
