import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { queryKeys } from '../../../api/queryKeys'
import { createMockApiClient } from '../../../test/mockApiClient'
import { useProfilesPageData } from '../useProfilesPageData'

const { apiClientRef } = vi.hoisted(() => ({
	apiClientRef: { current: null as ReturnType<typeof createMockApiClient> | null },
}))

vi.mock('../../../api/useAPIClient', () => ({
	useAPIClient: () => apiClientRef.current,
}))

function createWrapper(queryClient: QueryClient, initialEntry = '/profiles') {
	return function Wrapper(props: PropsWithChildren) {
		return (
			<QueryClientProvider client={queryClient}>
				<MemoryRouter initialEntries={[initialEntry]}>{props.children}</MemoryRouter>
			</QueryClientProvider>
		)
	}
}

afterEach(() => {
	vi.restoreAllMocks()
	apiClientRef.current = null
})

describe('useProfilesPageData', () => {
	it('loads profiles and meta for the current api token and exposes search params state', async () => {
		const listProfiles = vi.fn().mockResolvedValue([
			{
				id: 'profile-1',
				name: 'Primary',
				provider: 's3_compatible',
				preserveLeadingSlash: false,
				tlsInsecureSkipVerify: false,
				createdAt: '2026-01-01T00:00:00Z',
				updatedAt: '2026-01-01T00:00:00Z',
			},
		])
		const getMeta = vi.fn().mockResolvedValue({
			version: 'test',
			serverAddr: '127.0.0.1:8080',
			dataDir: '/data',
			dbBackend: 'sqlite',
			staticDir: '/app/ui',
			apiTokenEnabled: true,
			encryptionEnabled: false,
			capabilities: {
				profileTls: { enabled: true, reason: '' },
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
		})

		apiClientRef.current = createMockApiClient({
			profiles: { listProfiles },
			server: { getMeta },
		})

		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		const { result } = renderHook(
			() =>
				useProfilesPageData({
					apiToken: 'token-a',
				}),
			{
				wrapper: createWrapper(queryClient, '/profiles?create=1'),
			},
		)

		await waitFor(() => expect(result.current.profilesQuery.isSuccess).toBe(true))
		await waitFor(() => expect(result.current.metaQuery.isSuccess).toBe(true))

		expect(listProfiles).toHaveBeenCalledTimes(1)
		expect(getMeta).toHaveBeenCalledTimes(1)
		expect(result.current.api).toBe(apiClientRef.current)
		expect(result.current.profilesQuery.data?.[0]?.id).toBe('profile-1')
		expect(result.current.metaQuery.data?.apiTokenEnabled).toBe(true)
		expect(result.current.searchParams.get('create')).toBe('1')

		act(() => {
			const next = new URLSearchParams(result.current.searchParams)
			next.set('edit', 'profile-1')
			result.current.setSearchParams(next, { replace: true })
		})

		await waitFor(() =>
			expect(result.current.searchParams.toString()).toBe('create=1&edit=profile-1'),
		)
	})

	it('invalidates only the scoped profiles list query for the provided token', async () => {
		apiClientRef.current = createMockApiClient({
			profiles: { listProfiles: vi.fn().mockResolvedValue([]) },
			server: {
				getMeta: vi.fn().mockResolvedValue({
					version: 'test',
					serverAddr: '127.0.0.1:8080',
					dataDir: '/data',
					dbBackend: 'sqlite',
					staticDir: '/app/ui',
					apiTokenEnabled: false,
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
				}),
			},
		})

		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})
		const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

		const { result } = renderHook(
			() =>
				useProfilesPageData({
					apiToken: 'token-a',
				}),
			{
				wrapper: createWrapper(queryClient),
			},
		)

		await act(async () => {
			await result.current.invalidateProfilesQuery('token-b')
		})

		expect(invalidateSpy).toHaveBeenCalledWith({
			queryKey: queryKeys.profiles.list('token-b'),
			exact: true,
		})
	})
})
