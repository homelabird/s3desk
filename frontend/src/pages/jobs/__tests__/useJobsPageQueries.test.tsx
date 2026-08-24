import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MetaResponse, Profile } from '../../../api/types'
import { createMockApiClient } from '../../../test/mockApiClient'
import { useJobsPageQueries } from '../useJobsPageQueries'

type MetaOverrides = Omit<Partial<MetaResponse>, 'capabilities'> & {
	capabilities?: Partial<MetaResponse['capabilities']>
}

function createWrapper(queryClient: QueryClient) {
	return function Wrapper(props: PropsWithChildren) {
		return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
	}
}

function buildMeta(overrides: MetaOverrides = {}): MetaResponse {
	const base: MetaResponse = {
		version: 'test',
		serverAddr: '127.0.0.1:8080',
		dataDir: '/data',
		dbBackend: 'sqlite',
		staticDir: '/app/ui',
		apiTokenEnabled: true,
		encryptionEnabled: false,
		capabilities: {
			profileTls: { enabled: false, reason: 'disabled' },
			serverBackup: {
				export: { enabled: true, reason: '' },
				restoreStaging: { enabled: true, reason: '' },
			},
			providers: {},
		},
		allowedLocalDirs: [],
		jobConcurrency: 1,
		uploadSessionTTLSeconds: 3600,
		uploadDirectStream: false,
		transferEngine: {
			name: 'rclone',
			available: true,
			compatible: true,
			minVersion: '1.52.0',
			path: '/usr/bin/rclone',
			version: 'v1.66.0',
		},
	}
	return {
		...base,
		...overrides,
		capabilities: {
			...base.capabilities,
			...overrides.capabilities,
		},
	}
}

function buildProfile(overrides: Partial<Profile> = {}): Profile {
	return {
		id: 'profile-1',
		name: 'Primary Profile',
		provider: 's3_compatible',
		endpoint: 'http://127.0.0.1:9000',
		region: 'us-east-1',
		forcePathStyle: false,
		preserveLeadingSlash: false,
		tlsInsecureSkipVerify: false,
		createdAt: '2026-04-08T00:00:00Z',
		updatedAt: '2026-04-08T00:00:00Z',
		...overrides,
	} as Profile
}

describe('useJobsPageQueries', () => {
	beforeEach(() => {
		localStorage.clear()
	})

	it('derives selected profile, bucket options, and upload capability from query data', async () => {
		const listBuckets = vi.fn().mockResolvedValue([
			{ name: 'bucket-a', createdAt: '2026-04-08T00:00:00Z' },
			{ name: 'bucket-b', createdAt: '2026-04-08T00:00:00Z' },
		])
		const api = createMockApiClient({
			server: {
				getMeta: async () =>
					buildMeta({
						capabilities: {
							profileTls: { enabled: false, reason: 'disabled' },
							providers: {
								s3_compatible: {
									bucketCrud: true,
									objectCrud: false,
									jobTransfer: true,
									bucketPolicy: true,
									gcsIamPolicy: false,
									azureContainerAccessPolicy: false,
									presignedUpload: false,
									presignedMultipartUpload: false,
									directUpload: false,
									reasons: {
										objectCrud: 'Object API is unavailable.',
									},
								},
							},
						},
					}),
			},
			profiles: {
				listProfiles: async () => [buildProfile({ id: 'profile-1', name: 'Primary' })],
			},
			buckets: {
				listBuckets,
			},
			jobs: {
				listJobs: async () => ({
					items: [
						{
							id: 'job-1',
							type: 'transfer_delete_prefix',
							status: 'queued',
							payload: {},
							createdAt: '2026-01-01T00:00:00Z',
							updatedAt: '2026-01-01T00:00:00Z',
						},
					],
					nextCursor: undefined,
				}),
			},
		})

		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		})

		const { result, rerender } = renderHook(
			({ bucketsEnabled }) =>
				useJobsPageQueries({
					api,
					apiToken: 'token',
					profileId: 'profile-1',
					filters: {
						statusFilter: 'all',
						typeFilterNormalized: '',
						errorCodeFilterNormalized: '',
					},
					eventsConnected: true,
					bucketsEnabled,
				}),
			{ wrapper: createWrapper(queryClient), initialProps: { bucketsEnabled: false } },
		)

		await waitFor(() => expect(result.current.selectedProfile?.id).toBe('profile-1'))
		await waitFor(() => expect(result.current.jobs).toHaveLength(1))

		expect(result.current.uploadSupported).toBe(false)
		expect(result.current.uploadDisabledReason).toBe('Object API is unavailable.')
		expect(result.current.bucketsQuery.fetchStatus).toBe('idle')
		expect(listBuckets).not.toHaveBeenCalled()

		rerender({ bucketsEnabled: true })
		await waitFor(() => expect(result.current.bucketOptions).toHaveLength(2))
		expect(result.current.bucketOptions).toEqual([
			{ label: 'bucket-a', value: 'bucket-a' },
			{ label: 'bucket-b', value: 'bucket-b' },
		])
		expect(listBuckets).toHaveBeenCalledOnce()
		expect(result.current.jobs[0]?.id).toBe('job-1')
	})

	it('aborts the bucket lookup when the create modal closes', async () => {
		const listBuckets = vi.fn((_profileId: string, signal?: AbortSignal) =>
			new Promise<never>((_resolve, reject) => {
				signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
			}),
		)
		const api = createMockApiClient({
			server: {
				getMeta: async () =>
					buildMeta({
						capabilities: {
							providers: {
								s3_compatible: {
									bucketCrud: true,
									objectCrud: true,
									jobTransfer: true,
									bucketPolicy: true,
									gcsIamPolicy: false,
									azureContainerAccessPolicy: false,
									presignedUpload: false,
									presignedMultipartUpload: false,
									directUpload: false,
									reasons: {},
								},
							},
						},
					}),
			},
			profiles: { listProfiles: async () => [buildProfile()] },
			buckets: { listBuckets },
			jobs: { listJobs: async () => ({ items: [], nextCursor: undefined }) },
		})
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const { rerender } = renderHook(
			({ bucketsEnabled }: { bucketsEnabled: boolean }) =>
				useJobsPageQueries({
					api,
					apiToken: 'token',
					profileId: 'profile-1',
					filters: {
						statusFilter: 'all',
						typeFilterNormalized: '',
						errorCodeFilterNormalized: '',
					},
					eventsConnected: true,
					bucketsEnabled,
				}),
			{ initialProps: { bucketsEnabled: true }, wrapper: createWrapper(queryClient) },
		)

		await waitFor(() => expect(listBuckets).toHaveBeenCalledOnce())
		const signal = listBuckets.mock.calls[0]?.[1]
		expect(signal).toBeInstanceOf(AbortSignal)

		rerender({ bucketsEnabled: false })

		expect(signal?.aborted).toBe(true)
	})

	it('keeps job listing active but skips bucket lookup when bucket CRUD is unsupported', async () => {
		const listBuckets = vi.fn().mockResolvedValue([
			{ name: 'bucket-a', createdAt: '2026-04-08T00:00:00Z' },
		])
		const api = createMockApiClient({
			server: {
				getMeta: async () => buildMeta(),
			},
			profiles: {
				listProfiles: async () => [
					buildProfile({
						id: 'profile-1',
						provider: 'gcp_gcs',
						projectNumber: '',
						endpoint: '',
					}),
				],
			},
			buckets: {
				listBuckets,
			},
			jobs: {
				listJobs: async () => ({
					items: [
						{
							id: 'job-1',
							type: 'transfer_delete_prefix',
							status: 'queued',
							payload: {},
							createdAt: '2026-01-01T00:00:00Z',
							updatedAt: '2026-01-01T00:00:00Z',
						},
					],
					nextCursor: undefined,
				}),
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
				useJobsPageQueries({
					api,
					apiToken: 'token',
					profileId: 'profile-1',
					filters: {
						statusFilter: 'all',
						typeFilterNormalized: '',
						errorCodeFilterNormalized: '',
					},
					eventsConnected: true,
					bucketsEnabled: true,
				}),
			{ wrapper: createWrapper(queryClient) },
		)

		await waitFor(() => expect(result.current.selectedProfile?.id).toBe('profile-1'))
		await waitFor(() => expect(result.current.jobs).toHaveLength(1))

		expect(result.current.bucketsQuery.fetchStatus).toBe('idle')
		expect(result.current.bucketOptions).toEqual([])
		expect(result.current.jobs[0]?.id).toBe('job-1')
		expect(listBuckets).not.toHaveBeenCalled()
	})

	it('loads all statuses from the API for the virtual active filter', async () => {
		const listJobs = vi.fn().mockResolvedValue({
			items: [
				{
					id: 'job-active',
					type: 'transfer_sync_staging_to_s3',
					status: 'queued',
					payload: {},
					createdAt: '2026-01-01T00:00:00Z',
					updatedAt: '2026-01-01T00:00:00Z',
				},
			],
			nextCursor: undefined,
		})
		const api = createMockApiClient({
			server: { getMeta: async () => buildMeta() },
			profiles: { listProfiles: async () => [buildProfile({ id: 'profile-1' })] },
			buckets: { listBuckets: async () => [] },
			jobs: { listJobs },
		})
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		})

		const { result } = renderHook(
			() =>
				useJobsPageQueries({
					api,
					apiToken: 'token',
					profileId: 'profile-1',
					filters: {
						statusFilter: 'active',
						typeFilterNormalized: '',
						errorCodeFilterNormalized: '',
					},
					eventsConnected: true,
					bucketsEnabled: false,
				}),
			{ wrapper: createWrapper(queryClient) },
		)

		await waitFor(() => expect(result.current.jobs).toHaveLength(1))

		expect(listJobs).toHaveBeenCalledWith('profile-1', expect.objectContaining({ status: undefined }))
	})

	it('polls one jobs page frequently and multiple pages at a lower fallback rate', async () => {
		vi.useFakeTimers()
		const listJobs = vi.fn().mockImplementation(async (_profileId: string, args: { cursor?: string }) => ({
			items: [
				{
					id: args.cursor ? 'job-2' : 'job-1',
					type: 'transfer_delete_prefix',
					status: 'queued',
					payload: {},
					createdAt: '2026-01-01T00:00:00Z',
					updatedAt: '2026-01-01T00:00:00Z',
				},
			],
			nextCursor: args.cursor ? undefined : 'next-page',
		}))
		const api = createMockApiClient({
			server: { getMeta: async () => buildMeta() },
			profiles: { listProfiles: async () => [buildProfile()] },
			buckets: { listBuckets: async () => [] },
			jobs: { listJobs },
		})
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		})
		const { result, unmount } = renderHook(
			() =>
				useJobsPageQueries({
					api,
					apiToken: 'token',
					profileId: 'profile-1',
					filters: {
						statusFilter: 'all',
						typeFilterNormalized: '',
						errorCodeFilterNormalized: '',
					},
					eventsConnected: false,
					bucketsEnabled: false,
				}),
			{ wrapper: createWrapper(queryClient) },
		)

		try {
			await vi.waitFor(() => expect(result.current.jobs).toHaveLength(1))
			await act(async () => {
				await vi.advanceTimersByTimeAsync(5_000)
			})
			await vi.waitFor(() => expect(listJobs).toHaveBeenCalledTimes(2))

			await act(async () => {
				await result.current.jobsQuery.fetchNextPage()
			})
			await vi.waitFor(() => expect(result.current.jobs).toHaveLength(2))
			expect(listJobs).toHaveBeenCalledTimes(3)

			await act(async () => {
				await vi.advanceTimersByTimeAsync(10_001)
			})
			expect(listJobs).toHaveBeenCalledTimes(3)

			await act(async () => {
				await vi.advanceTimersByTimeAsync(20_000)
			})
			await vi.waitFor(() => expect(listJobs).toHaveBeenCalledTimes(5))
		} finally {
			unmount()
			queryClient.clear()
			vi.useRealTimers()
		}
	})

	it('aborts the current jobs page when the profile scope changes', async () => {
		const signals: AbortSignal[] = []
		const listJobs = vi.fn((_profileId: string, args?: { signal?: AbortSignal }) => {
			if (args?.signal) signals.push(args.signal)
			return new Promise<never>(() => {})
		})
		const api = createMockApiClient({
			server: { getMeta: async () => buildMeta() },
			profiles: { listProfiles: async () => [buildProfile(), buildProfile({ id: 'profile-2' })] },
			buckets: { listBuckets: async () => [] },
			jobs: { listJobs },
		})
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const { rerender, unmount } = renderHook(
			({ profileId }) =>
				useJobsPageQueries({
					api,
					apiToken: 'token',
					profileId,
					filters: { statusFilter: 'all', typeFilterNormalized: '', errorCodeFilterNormalized: '' },
					eventsConnected: false,
					bucketsEnabled: false,
				}),
			{ wrapper: createWrapper(queryClient), initialProps: { profileId: 'profile-1' } },
		)

		await waitFor(() => expect(listJobs).toHaveBeenCalledOnce())
		rerender({ profileId: 'profile-2' })

		await waitFor(() => expect(signals[0]?.aborted).toBe(true))
		await waitFor(() => expect(listJobs).toHaveBeenCalledTimes(2))
		unmount()
		expect(signals[1]?.aborted).toBe(true)
	})
})
