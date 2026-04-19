import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { APIError } from '../../../api/client'
import { createMockApiClient } from '../../../test/mockApiClient'
import { buildDialogPreferenceKey, setDialogDismissed } from '../../../lib/dialogPreferences'
import { useBucketsPageState } from '../useBucketsPageState'

const {
	apiClientRef,
	messageErrorMock,
	messageSuccessMock,
	messageWarningMock,
	screensRef,
} = vi.hoisted(() => ({
	apiClientRef: { current: null as ReturnType<typeof createMockApiClient> | null },
	messageErrorMock: vi.fn(),
	messageSuccessMock: vi.fn(),
	messageWarningMock: vi.fn(),
	screensRef: { current: { lg: true } as Record<string, boolean> },
}))

vi.mock('../../../api/useAPIClient', () => ({
	useAPIClient: () => apiClientRef.current,
}))

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		Grid: {
			useBreakpoint: () => screensRef.current,
		},
		message: {
			success: (...args: unknown[]) => messageSuccessMock(...args),
			warning: (...args: unknown[]) => messageWarningMock(...args),
			error: (...args: unknown[]) => messageErrorMock(...args),
		},
	}
})

function createWrapper(queryClient: QueryClient) {
	return function Wrapper(props: PropsWithChildren) {
		return (
			<QueryClientProvider client={queryClient}>
				<MemoryRouter>{props.children}</MemoryRouter>
			</QueryClientProvider>
		)
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

function buildProfile(
	overrides: Record<string, unknown> = {},
) {
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
	window.localStorage.clear()
	apiClientRef.current = null
	screensRef.current = { lg: true }
	vi.restoreAllMocks()
	messageErrorMock.mockReset()
	messageSuccessMock.mockReset()
	messageWarningMock.mockReset()
})

describe('useBucketsPageState', () => {
	it('disables bucket queries when the selected profile cannot perform bucket CRUD', async () => {
		const listBuckets = vi.fn().mockResolvedValue([
			{ name: 'primary-bucket', createdAt: '2026-04-08T00:00:00Z' },
		])

		apiClientRef.current = createMockApiClient({
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
				useBucketsPageState({
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

	it('ignores stale delete callbacks captured before the scope changes', async () => {
		const deleteBucket = vi.fn().mockResolvedValue(undefined)

		apiClientRef.current = createMockApiClient({
			server: {
				getMeta: vi.fn().mockResolvedValue(buildMeta()),
			},
			profiles: {
				listProfiles: vi.fn().mockResolvedValue([buildProfile()]),
			},
			buckets: {
				listBuckets: vi.fn().mockResolvedValue([]),
				deleteBucket,
			},
		})

		const { result, rerender } = renderHook(
			(props: { apiToken: string; profileId: string | null }) => useBucketsPageState(props),
			{
				initialProps: { apiToken: 'token-a', profileId: 'profile-1' },
				wrapper: createWrapper(createQueryClient()),
			},
		)

		await waitFor(() => expect(result.current.profileResolved).toBe(true))

		const staleDeleteBucket = result.current.deleteBucket

		rerender({ apiToken: 'token-b', profileId: 'profile-1' })

		await waitFor(() => expect(result.current.currentScopeKey).toBe('token-b:profile-1'))

		await act(async () => {
			await staleDeleteBucket('primary-bucket')
		})

		expect(deleteBucket).not.toHaveBeenCalled()
		expect(messageSuccessMock).not.toHaveBeenCalledWith('Bucket deleted')
	})

	it('shows a warning instead of reopening the bucket_not_empty dialog after dismissal', async () => {
		const deleteBucket = vi.fn().mockRejectedValue(
			new APIError({
				status: 409,
				code: 'bucket_not_empty',
				message: 'bucket contains objects',
			}),
		)
		const dismissedKey = buildDialogPreferenceKey('warning', 'bucket_not_empty')
		setDialogDismissed(dismissedKey, true, 'token-a')

		apiClientRef.current = createMockApiClient({
			server: {
				getMeta: vi.fn().mockResolvedValue(buildMeta()),
			},
			profiles: {
				listProfiles: vi.fn().mockResolvedValue([buildProfile()]),
			},
			buckets: {
				listBuckets: vi.fn().mockResolvedValue([
					{ name: 'primary-bucket', createdAt: '2026-04-08T00:00:00Z' },
				]),
				deleteBucket,
			},
		})

		const { result } = renderHook(
			() =>
				useBucketsPageState({
					apiToken: 'token-a',
					profileId: 'profile-1',
				}),
			{
				wrapper: createWrapper(createQueryClient()),
			},
		)

		await waitFor(() => expect(result.current.bucketsQuery.isSuccess).toBe(true))

		await act(async () => {
			await result.current.deleteBucket('primary-bucket').catch(() => undefined)
		})

		await waitFor(() =>
			expect(messageWarningMock).toHaveBeenCalledWith(
				'Bucket "primary-bucket" isn’t empty. Open Objects or create a delete job from the Buckets page.',
			),
		)
		expect(result.current.bucketNotEmptyDialogBucket).toBe(null)
		expect(result.current.deletingBucket).toBe(null)
		expect(messageErrorMock).not.toHaveBeenCalled()
	})
})
