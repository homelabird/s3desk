import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMockApiClient } from '../../../test/mockApiClient'
import { useBucketsPageQueriesState } from '../useBucketsPageQueriesState'

function createWrapper(queryClient: QueryClient) {
	return function Wrapper(props: PropsWithChildren) {
		return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
	}
}

function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	})
}

function buildMeta() {
	return {
		version: 'test',
		serverAddr: '127.0.0.1:8080',
		dataDir: '/data',
		dbBackend: 'sqlite',
		staticDir: '/app/ui',
		apiTokenEnabled: true,
		encryptionEnabled: false,
		capabilities: {
			profileTls: { enabled: false, reason: 'disabled' },
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
}

function buildProfile(overrides: Record<string, unknown> = {}) {
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
	}
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('useBucketsPageQueriesState', () => {
	it('disables bucket queries when the selected profile cannot perform bucket CRUD', async () => {
		const listBuckets = vi.fn().mockResolvedValue([
			{ name: 'primary-bucket', createdAt: '2026-04-08T00:00:00Z' },
		])
		const api = createMockApiClient({
			server: {
				getMeta: vi.fn().mockResolvedValue(buildMeta()),
			},
			profiles: {
				listProfiles: vi.fn().mockResolvedValue([
					buildProfile({
						provider: 'gcp_gcs',
						projectNumber: '',
						endpoint: '',
						anonymous: false,
					}),
				]),
			},
			buckets: {
				listBuckets,
			},
		})

		const { result } = renderHook(
			() =>
				useBucketsPageQueriesState({
					api,
					apiToken: 'token-a',
					profileId: 'profile-1',
				}),
			{
				wrapper: createWrapper(createQueryClient()),
			},
		)

		await waitFor(() => expect(result.current.profileResolved).toBe(true))

		expect(result.current.bucketCrudSupported).toBe(false)
		expect(result.current.bucketCrudUnsupportedReason).toBe(
			'GCS bucket operations require Project Number on this profile.',
		)
		expect(result.current.bucketsQuery.fetchStatus).toBe('idle')
		expect(result.current.showBucketsEmpty).toBe(false)
		expect(listBuckets).not.toHaveBeenCalled()
	})
})
