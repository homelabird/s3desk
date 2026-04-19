import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

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
				listBuckets: async () => [
					{ name: 'bucket-a', createdAt: '2026-04-08T00:00:00Z' },
					{ name: 'bucket-b', createdAt: '2026-04-08T00:00:00Z' },
				],
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
				}),
			{ wrapper: createWrapper(queryClient) },
		)

		await waitFor(() => expect(result.current.selectedProfile?.id).toBe('profile-1'))
		await waitFor(() => expect(result.current.jobs).toHaveLength(1))

		expect(result.current.uploadSupported).toBe(false)
		expect(result.current.uploadDisabledReason).toBe('Object API is unavailable.')
		expect(result.current.bucketOptions).toEqual([
			{ label: 'bucket-a', value: 'bucket-a' },
			{ label: 'bucket-b', value: 'bucket-b' },
		])
		expect(result.current.jobs[0]?.id).toBe('job-1')
	})
})
