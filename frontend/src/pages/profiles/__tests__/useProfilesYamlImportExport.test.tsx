import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { message } from 'antd'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { queryKeys } from '../../../api/queryKeys'
import type { Profile } from '../../../api/types'
import { createMockApiClient } from '../../../test/mockApiClient'
import { useProfilesYamlImportExport } from '../useProfilesYamlImportExport'
import { useProfilesPageScopeState } from '../useProfilesPageScopeState'

const { parseProfileYamlForUpdateMock, parseProfileYamlMock } = vi.hoisted(() => ({
	parseProfileYamlForUpdateMock: vi.fn(),
	parseProfileYamlMock: vi.fn(),
}))

vi.mock('../profileYaml', async () => {
	const actual = await vi.importActual<typeof import('../profileYaml')>('../profileYaml')
	return {
		...actual,
		parseProfileYamlForUpdate: (...args: Parameters<typeof actual.parseProfileYamlForUpdate>) =>
			parseProfileYamlForUpdateMock(...args),
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
	parseProfileYamlForUpdateMock.mockReset()
	parseProfileYamlMock.mockReset()
})

describe('useProfilesYamlImportExport', () => {
	it.each(['success', 'tls failure', 'export failure', 'update failure'] as const)(
		'refreshes persisted YAML changes after unmount (%s)', async (outcome) => {
			const update = deferred<Profile>()
			const updateProfile = vi.fn(() => update.promise)
			const updateProfileTLS = vi.fn().mockImplementation(async () => {
				if (outcome === 'tls failure') throw new Error('TLS unavailable')
			})
			const exportProfileYaml = vi.fn().mockResolvedValueOnce('name: initial\n').mockImplementation(async () => {
				if (outcome === 'export failure') throw new Error('Export unavailable')
				return 'name: canonical\n'
			})
			parseProfileYamlForUpdateMock.mockResolvedValue({
				updateRequest: { name: 'Updated Profile' }, hasTLSBlock: true,
				tlsConfig: { mode: 'mtls', clientCertPem: 'test-cert', clientKeyPem: 'test-key' },
			})
			const args = buildArgs({ api: createMockApiClient({ profiles: { updateProfile, updateProfileTLS, exportProfileYaml } }) })
			const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
			const success = vi.spyOn(message, 'success').mockImplementation(() => undefined as never)
			const error = vi.spyOn(message, 'error').mockImplementation(() => undefined as never)
			const { result, unmount } = renderHook(() => {
				const scope = useProfilesPageScopeState(args.apiToken)
				return useProfilesYamlImportExport({ ...args, ...scope })
			}, { wrapper: createWrapper(queryClient) })
			act(() => result.current.openYamlModal(buildProfile()))
			await waitFor(() => expect(result.current.activeYamlDraft).toBe('name: initial\n'))
			act(() => result.current.saveYaml())
			await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1))
			unmount()
			await act(async () => {
				if (outcome === 'update failure') update.reject(new Error('Update unavailable'))
				else update.resolve(buildProfile({ name: 'Updated Profile' }))
			})
			await waitFor(() => expect(queryClient.isMutating()).toBe(0))
			if (outcome === 'update failure') {
				expect(args.queryClient.invalidateQueries).not.toHaveBeenCalled()
				expect(updateProfileTLS).not.toHaveBeenCalled()
			} else {
				expect(args.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.profiles.list('token-a'), exact: true })
				expect(args.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.profiles.tls('profile-1', 'token-a'), exact: true })
				expect(updateProfileTLS).toHaveBeenCalledTimes(1)
			}
			expect(success).not.toHaveBeenCalled()
			expect(error).not.toHaveBeenCalled()
			queryClient.clear()
		},
	)

	it.each(['success', 'tls failure', 'create failure'] as const)('refreshes a persisted import after unmount (%s)', async (outcome) => {
		const create = deferred<Profile>()
		const createProfile = vi.fn(() => create.promise)
		const updateProfileTLS = vi.fn().mockImplementation(async () => {
			if (outcome === 'tls failure') throw new Error('TLS unavailable')
		})
		parseProfileYamlMock.mockResolvedValue({
			request: { name: 'Imported Profile' },
			tlsConfig: { mode: 'mtls', clientCertPem: 'test-cert', clientKeyPem: 'test-key' },
		})
		const args = buildArgs({ api: createMockApiClient({ profiles: { createProfile, updateProfileTLS } }) })
		const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
		const success = vi.spyOn(message, 'success').mockImplementation(() => undefined as never)
		const error = vi.spyOn(message, 'error').mockImplementation(() => undefined as never)
		const { result, unmount } = renderHook(() => {
			const scope = useProfilesPageScopeState(args.apiToken)
			return useProfilesYamlImportExport({ ...args, ...scope })
		}, { wrapper: createWrapper(queryClient) })
		act(() => result.current.openImportModal())
		act(() => result.current.setImportText('name: imported\n'))
		act(() => result.current.submitImport())
		await waitFor(() => expect(createProfile).toHaveBeenCalledTimes(1))
		unmount()
		await act(async () => {
			if (outcome === 'create failure') create.reject(new Error('Create unavailable'))
			else create.resolve(buildProfile({ name: 'Imported Profile' }))
		})
		await waitFor(() => expect(queryClient.isMutating()).toBe(0))
		if (outcome === 'create failure') {
			expect(args.queryClient.invalidateQueries).not.toHaveBeenCalled()
			expect(updateProfileTLS).not.toHaveBeenCalled()
		} else {
			expect(args.queryClient.invalidateQueries).toHaveBeenCalledExactlyOnceWith({ queryKey: queryKeys.profiles.list('token-a'), exact: true })
			expect(updateProfileTLS).toHaveBeenCalledTimes(1)
		}
		expect(success).not.toHaveBeenCalled()
		expect(error).not.toHaveBeenCalled()
		queryClient.clear()
	})

	it.each([['success', true], ['failure', true], ['success', false]] as const)(
		'preserves a newer YAML draft when an earlier save ends with %s (reopened: %s)', async (outcome, reopen) => {
		const update = deferred<Profile>()
		const updateProfile = vi.fn(() => update.promise)
		const exportProfileYaml = vi.fn().mockResolvedValue('name: initial\n')
		parseProfileYamlForUpdateMock.mockResolvedValue({ updateRequest: { name: 'Saved Profile' }, hasTLSBlock: false })
		const args = buildArgs({ api: createMockApiClient({ profiles: { updateProfile, exportProfileYaml } }) })
		const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
		const success = vi.spyOn(message, 'success').mockImplementation(() => undefined as never)
		const error = vi.spyOn(message, 'error').mockImplementation(() => undefined as never)
		const { result, unmount } = renderHook(() => useProfilesYamlImportExport(args), { wrapper: createWrapper(queryClient) })
		act(() => result.current.openYamlModal(buildProfile()))
		await waitFor(() => expect(result.current.activeYamlDraft).toBe('name: initial\n'))
		act(() => result.current.saveYaml())
		await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1))
		if (reopen) {
			act(() => result.current.closeYamlModal())
			act(() => result.current.openYamlModal(buildProfile()))
			await waitFor(() => expect(result.current.activeYamlDraft).toBe('name: initial\n'))
		}
		act(() => result.current.setYamlDraft('name: new unsaved draft\n'))
		await act(async () => {
			if (outcome === 'failure') update.reject(new Error('Old save failed'))
			else update.resolve(buildProfile({ name: 'Saved Profile' }))
		})
		await waitFor(() => expect(queryClient.isMutating()).toBe(0))
		expect(result.current.activeYamlDraft).toBe('name: new unsaved draft\n')
		expect(result.current.activeYamlProfile?.name).toBe(reopen ? 'Primary Profile' : 'Saved Profile')
		expect(result.current.activeYamlError).toBe(null)
		if (reopen) expect(success).not.toHaveBeenCalled()
		else expect(success).toHaveBeenCalledWith('Profile YAML saved')
		expect(error).not.toHaveBeenCalled()
		unmount()
		queryClient.clear()
	})

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

	it('loads secret-inclusive YAML only through the explicit action', async () => {
		const exportProfileYaml = vi
			.fn()
			.mockResolvedValueOnce('name: sanitized\n')
			.mockResolvedValueOnce('name: full\nsecretAccessKey: secret\n')
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
			result.current.openYamlModal(buildProfile({ id: 'profile-7', name: 'Secure Profile' }))
		})

		await waitFor(() => expect(result.current.activeYamlDraft).toBe('name: sanitized\n'))
		expect(result.current.activeYamlIncludesSecrets).toBe(false)
		expect(exportProfileYaml).toHaveBeenNthCalledWith(1, 'profile-7')

		act(() => {
			result.current.loadYamlWithSecrets()
		})

		await waitFor(() => expect(result.current.activeYamlDraft).toBe('name: full\nsecretAccessKey: secret\n'))
		expect(result.current.activeYamlIncludesSecrets).toBe(true)
		expect(exportProfileYaml).toHaveBeenNthCalledWith(2, 'profile-7', { includeSecrets: true })
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

		parseProfileYamlForUpdateMock.mockResolvedValue({
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

		await waitFor(() => expect(parseProfileYamlForUpdateMock).toHaveBeenCalledWith('name: updated\n'))
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

	it('refreshes a completed import without changing a reopened modal', async () => {
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
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.profiles.list('token-a'),
			exact: true,
		})
		expect(result.current.activeImportOpen).toBe(true)
		expect(result.current.activeImportLoading).toBe(false)
		expect(result.current.activeImportText).toBe('')
	})
})
