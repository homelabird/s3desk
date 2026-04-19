import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { message } from 'antd'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { queryKeys } from '../../../api/queryKeys'
import type { Profile } from '../../../api/types'
import { createMockApiClient } from '../../../test/mockApiClient'
import { useProfilesYamlImportExport } from '../useProfilesYamlImportExport'

const { parseProfileYamlMock } = vi.hoisted(() => ({
	parseProfileYamlMock: vi.fn(),
}))

vi.mock('../profileYaml', async () => {
	const actual = await vi.importActual<typeof import('../profileYaml')>('../profileYaml')
	return {
		...actual,
		parseProfileYaml: (...args: Parameters<typeof actual.parseProfileYaml>) => parseProfileYamlMock(...args),
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

function createWrapper(queryClient: QueryClient) {
	return function Wrapper(props: PropsWithChildren) {
		return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
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

function buildArgs(
	overrides: Partial<Parameters<typeof useProfilesYamlImportExport>[0]> = {},
): Parameters<typeof useProfilesYamlImportExport>[0] {
	return {
		api: createMockApiClient(),
		apiToken: 'token-a',
		currentScopeKey: 'token-a::profiles',
		queryClient: {
			invalidateQueries: vi.fn().mockResolvedValue(undefined),
		},
		isActiveRef: { current: true },
		serverScopeVersionRef: { current: 1 },
		...overrides,
	}
}

afterEach(() => {
	vi.restoreAllMocks()
	parseProfileYamlMock.mockReset()
})

describe('useProfilesYamlImportExport', () => {
	it('ignores stale export responses when switching profiles', async () => {
		const primaryExport = deferred<string>()
		const secondaryExport = deferred<string>()
		const exportProfileYaml = vi.fn((profileId: string) =>
			profileId === 'profile-1' ? primaryExport.promise : secondaryExport.promise,
		)
		const queryClient = new QueryClient({
			defaultOptions: {
				mutations: { retry: false },
			},
		})
		const args = buildArgs({
			api: createMockApiClient({
				profiles: { exportProfileYaml },
			}),
		})

		const { result } = renderHook(() => useProfilesYamlImportExport(args), {
			wrapper: createWrapper(queryClient),
		})

		act(() => {
			result.current.openYamlModal(buildProfile({ id: 'profile-1', name: 'Primary Profile' }))
		})
		await waitFor(() => expect(exportProfileYaml).toHaveBeenCalledWith('profile-1'))

		act(() => {
			result.current.openYamlModal(buildProfile({ id: 'profile-2', name: 'Secondary Profile' }))
		})
		await waitFor(() => expect(exportProfileYaml).toHaveBeenCalledWith('profile-2'))

		await act(async () => {
			primaryExport.resolve('name: stale-primary\n')
			await Promise.resolve()
		})

		expect(result.current.activeYamlProfile?.id).toBe('profile-2')
		expect(result.current.activeYamlDraft).toBe('')

		await act(async () => {
			secondaryExport.resolve('name: secondary\n')
			await Promise.resolve()
		})

		await waitFor(() => expect(result.current.activeYamlDraft).toBe('name: secondary\n'))
		expect(result.current.activeYamlProfile?.name).toBe('Secondary Profile')
		expect(result.current.activeExportingProfileId).toBe(null)
	})

	it('saves YAML, updates canonical state, and invalidates scoped list and TLS queries', async () => {
		const invalidateQueries = vi.fn().mockResolvedValue(undefined)
		const updateProfile = vi.fn().mockResolvedValue(
			buildProfile({ id: 'profile-9', name: 'Updated Profile' }),
		)
		const updateProfileTLS = vi.fn().mockResolvedValue(undefined)
		const deleteProfileTLS = vi.fn().mockResolvedValue(undefined)
		const exportProfileYaml = vi
			.fn()
			.mockResolvedValueOnce('name: old\n')
			.mockResolvedValueOnce('name: canonical\n')
		const successSpy = vi.spyOn(message, 'success').mockImplementation(() => undefined as never)

		parseProfileYamlMock.mockResolvedValue({
			request: { name: 'unused' },
			updateRequest: { name: 'Updated Profile' },
			tlsConfig: { mode: 'mtls', clientCertPem: 'cert', clientKeyPem: 'key' },
			hasTLSBlock: true,
		})

		const queryClient = new QueryClient({
			defaultOptions: {
				mutations: { retry: false },
			},
		})
		const args = buildArgs({
			api: createMockApiClient({
				profiles: {
					exportProfileYaml,
					updateProfile,
					updateProfileTLS,
					deleteProfileTLS,
				},
			}),
			queryClient: { invalidateQueries },
		})

		const { result } = renderHook(() => useProfilesYamlImportExport(args), {
			wrapper: createWrapper(queryClient),
		})

		act(() => {
			result.current.openYamlModal(buildProfile({ id: 'profile-9', name: 'Draft Profile' }))
		})

		await waitFor(() => expect(result.current.activeYamlDraft).toBe('name: old\n'))

		act(() => {
			result.current.setYamlDraft('name: updated\n')
		})

		act(() => {
			result.current.saveYaml()
		})

		await waitFor(() => expect(parseProfileYamlMock).toHaveBeenCalledWith('name: updated\n'))
		await waitFor(() => expect(updateProfile).toHaveBeenCalledWith('profile-9', { name: 'Updated Profile' }))
		await waitFor(() =>
			expect(updateProfileTLS).toHaveBeenCalledWith('profile-9', {
				mode: 'mtls',
				clientCertPem: 'cert',
				clientKeyPem: 'key',
			}),
		)
		expect(deleteProfileTLS).not.toHaveBeenCalled()

		await waitFor(() =>
			expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
				queryKey: queryKeys.profiles.list('token-a'),
				exact: true,
			}),
		)
		await waitFor(() =>
			expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
				queryKey: queryKeys.profiles.tls('profile-9', 'token-a'),
				exact: true,
			}),
		)

		expect(successSpy).toHaveBeenCalledWith('Profile YAML saved')
		expect(result.current.activeYamlProfile?.name).toBe('Updated Profile')
		expect(result.current.activeYamlContent).toBe('name: canonical\n')
		expect(result.current.activeYamlDraft).toBe('name: canonical\n')
		expect(result.current.activeYamlError).toBe(null)
	})

	it('ignores stale import success after the modal is closed and reopened', async () => {
		const createProfileRequest = deferred<Profile>()
		const createProfile = vi.fn().mockImplementation(() => createProfileRequest.promise)
		const invalidateQueries = vi.fn().mockResolvedValue(undefined)
		const successSpy = vi.spyOn(message, 'success').mockImplementation(() => undefined as never)

		parseProfileYamlMock.mockResolvedValue({
			request: { name: 'Imported Profile' },
			updateRequest: { name: 'Imported Profile' },
			tlsConfig: undefined,
			hasTLSBlock: false,
		})

		const queryClient = new QueryClient({
			defaultOptions: {
				mutations: { retry: false },
			},
		})
		const args = buildArgs({
			api: createMockApiClient({
				profiles: { createProfile, updateProfileTLS: vi.fn() },
			}),
			queryClient: { invalidateQueries },
		})

		const { result } = renderHook(() => useProfilesYamlImportExport(args), {
			wrapper: createWrapper(queryClient),
		})

		act(() => {
			result.current.openImportModal()
		})
		expect(result.current.activeImportOpen).toBe(true)
		expect(result.current.importSessionToken).toBe(1)

		act(() => {
			result.current.setImportText('name: imported\n')
			result.current.submitImport()
		})

		await waitFor(() => expect(createProfile).toHaveBeenCalledTimes(1))
		expect(result.current.activeImportLoading).toBe(true)

		act(() => {
			result.current.closeImportModal()
		})
		expect(result.current.activeImportOpen).toBe(false)
		expect(result.current.importSessionToken).toBe(2)

		act(() => {
			result.current.openImportModal()
		})
		expect(result.current.activeImportOpen).toBe(true)
		expect(result.current.importSessionToken).toBe(3)
		expect(result.current.activeImportText).toBe('')

		await act(async () => {
			createProfileRequest.resolve(buildProfile({ id: 'profile-imported', name: 'Imported Profile' }))
			await Promise.resolve()
		})

		expect(successSpy).not.toHaveBeenCalledWith('Imported profile "Imported Profile"')
		expect(invalidateQueries).not.toHaveBeenCalledWith({
			queryKey: queryKeys.profiles.list('token-a'),
			exact: true,
		})
		expect(result.current.activeImportOpen).toBe(true)
		expect(result.current.activeImportLoading).toBe(false)
		expect(result.current.activeImportText).toBe('')
	})
})
