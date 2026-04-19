import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it } from 'vitest'

import type { MetaResponse, Profile } from '../../../api/types'
import { createMockApiClient } from '../../../test/mockApiClient'
import { useUploadsPageQueriesState } from '../useUploadsPageQueriesState'

type MetaOverrides = Omit<Partial<MetaResponse>, 'capabilities'> & {
	capabilities?: Partial<MetaResponse['capabilities']>
}

function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	})
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

describe('useUploadsPageQueriesState', () => {
	it('derives selected profile, upload support, and bucket options from query data', async () => {
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
		})

		const { result } = renderHook(
			() =>
				useUploadsPageQueriesState({
					api,
					apiToken: 'token-a',
					profileId: 'profile-1',
				}),
			{
				wrapper: createWrapper(createQueryClient()),
			},
		)

		await waitFor(() => expect(result.current.selectedProfile?.id).toBe('profile-1'))
		await waitFor(() => expect(result.current.bucketsQuery.isSuccess).toBe(true))

		expect(result.current.uploadsSupported).toBe(false)
		expect(result.current.uploadsUnsupportedReason).toBe('Object API is unavailable.')
		expect(result.current.bucketOptions).toEqual([
			{ label: 'bucket-a', value: 'bucket-a' },
			{ label: 'bucket-b', value: 'bucket-b' },
		])
		expect(result.current.showBucketsEmpty).toBe(false)
	})
})
