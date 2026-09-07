import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { message } from 'antd'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMockApiClient } from '../../../test/mockApiClient'
import type { ProfileFormValues } from '../profileTypes'
import { useProfilesPageMutations } from '../useProfilesPageMutations'
import { useProfilesPageScopeState } from '../useProfilesPageScopeState'
import { useProfilesPageTLSState } from '../useProfilesPageTLSState'

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

function buildProfileFormValues(name = 'Created Profile'): ProfileFormValues {
	return {
		provider: 's3_compatible',
		name,
		endpoint: 'http://127.0.0.1:9000',
		publicEndpoint: '',
		region: 'us-east-1',
		accessKeyId: 'demo-access',
		secretAccessKey: 'demo-secret',
		sessionToken: '',
		clearSessionToken: false,
		forcePathStyle: false,
		azureAccountName: '',
		azureAccountKey: '',
		azureEndpoint: '',
		azureSubscriptionId: '',
		azureResourceGroup: '',
		azureTenantId: '',
		azureClientId: '',
		azureClientSecret: '',
		azureUseEmulator: false,
		gcpAnonymous: false,
		gcpServiceAccountJson: '',
		gcpEndpoint: '',
		gcpProjectNumber: '',
		ociNamespace: '',
		ociCompartment: '',
		ociEndpoint: '',
		ociAuthProvider: '',
		ociConfigFile: '',
		ociConfigProfile: '',
		preserveLeadingSlash: false,
		tlsInsecureSkipVerify: false,
		tlsEnabled: false,
		tlsAction: 'keep',
		tlsClientCertPem: '',
		tlsClientKeyPem: '',
		tlsCaCertPem: '',
	}
}

function buildBaseArgs(
	overrides: Partial<Parameters<typeof useProfilesPageMutations>[0]> = {},
): Parameters<typeof useProfilesPageMutations>[0] {
	return {
		api: createMockApiClient(),
		apiToken: 'token-a',
		currentScopeKey: 'token-a::profiles',
		setProfileId: vi.fn(),
		createModalSession: 1,
		editModalSession: 1,
		closeCreateModal: vi.fn(),
		closeEditModal: vi.fn(),
		invalidateProfilesQuery: vi.fn().mockResolvedValue(undefined),
		applyTLSUpdate: vi.fn().mockResolvedValue(undefined),
		isActiveRef: { current: true },
		serverScopeVersionRef: { current: 1 },
		...overrides,
	}
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('useProfilesPageMutations', () => {
	it.each(['create', 'edit', 'delete'] as const)('finishes %s cache and TLS work after the page unmounts', async (operation) => {
		const request = deferred<{ id: string }>()
		const save = vi.fn().mockImplementation(() => request.promise)
		const updateProfileTLS = vi.fn().mockResolvedValue(undefined)
		const deleteProfileTLS = vi.fn().mockResolvedValue(undefined)
		const args = buildBaseArgs({
			api: createMockApiClient({ profiles: {
				createProfile: save, updateProfile: save, deleteProfile: save, updateProfileTLS, deleteProfileTLS,
			} }),
		})
		const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
		const success = vi.spyOn(message, 'success').mockImplementation(() => undefined as never)
		const { result, unmount } = renderHook(() => {
			const scope = useProfilesPageScopeState(args.apiToken)
			const tls = useProfilesPageTLSState({
				api: args.api, apiToken: args.apiToken, queryClient, activeEditProfile: null, tlsCapability: { enabled: true },
			})
			return useProfilesPageMutations({ ...args, ...scope, applyTLSUpdate: tls.applyTLSUpdate })
		}, { wrapper: createWrapper(queryClient) })
		const values = { ...buildProfileFormValues(), tlsEnabled: true, tlsAction: 'disable' as const,
			tlsClientCertPem: 'test-cert', tlsClientKeyPem: 'test-key' }
		let pending!: Promise<unknown>
		act(() => {
			pending = operation === 'create' ? result.current.createMutation.mutateAsync(values)
				: operation === 'edit' ? result.current.updateMutation.mutateAsync({ id: 'profile-1', values })
					: result.current.deleteMutation.mutateAsync('profile-1')
		})
		await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
		unmount()
		await act(async () => { request.resolve({ id: 'profile-1' }); await pending })
		expect(args.invalidateProfilesQuery).toHaveBeenCalledExactlyOnceWith('token-a')
		if (operation === 'create') {
			expect(updateProfileTLS).toHaveBeenCalledExactlyOnceWith('profile-1', {
				mode: 'mtls', clientCertPem: 'test-cert', clientKeyPem: 'test-key',
			})
		} else if (operation === 'edit') {
			expect(deleteProfileTLS).toHaveBeenCalledExactlyOnceWith('profile-1')
		} else {
			expect(updateProfileTLS).not.toHaveBeenCalled()
			expect(deleteProfileTLS).not.toHaveBeenCalled()
		}
		expect(args.setProfileId).not.toHaveBeenCalled()
		expect(args.closeCreateModal).not.toHaveBeenCalled()
		expect(args.closeEditModal).not.toHaveBeenCalled()
		expect(success).not.toHaveBeenCalled()
		queryClient.clear()
	})

	it.each([
		['create', false], ['create', true], ['edit', false], ['edit', true],
	] as const)('reports a late %s TLS failure only while the page is active (unmounted: %s)', async (operation, leavePage) => {
		const tls = deferred<void>()
		const args = buildBaseArgs({
			api: createMockApiClient({ profiles: {
				createProfile: vi.fn().mockResolvedValue({ id: 'profile-1' }),
				updateProfile: vi.fn().mockResolvedValue({ id: 'profile-1' }),
			} }),
			applyTLSUpdate: vi.fn(() => tls.promise),
		})
		const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
		vi.spyOn(message, 'success').mockImplementation(() => undefined as never)
		const error = vi.spyOn(message, 'error').mockImplementation(() => undefined as never)
		const { result, unmount } = renderHook(() => {
			const scope = useProfilesPageScopeState(args.apiToken)
			return useProfilesPageMutations({ ...args, ...scope })
		}, { wrapper: createWrapper(queryClient) })
		let pending!: Promise<unknown>
		act(() => {
			pending = operation === 'create' ? result.current.createMutation.mutateAsync(buildProfileFormValues())
				: result.current.updateMutation.mutateAsync({ id: 'profile-1', values: buildProfileFormValues() })
		})
		await waitFor(() => expect(args.applyTLSUpdate).toHaveBeenCalledTimes(1))
		if (leavePage) unmount()
		await act(async () => { tls.reject(new Error('TLS unavailable')); await pending })
		if (leavePage) expect(error).not.toHaveBeenCalled()
		else expect(error).toHaveBeenCalledWith('mTLS update failed: TLS unavailable')
		if (!leavePage) unmount()
		queryClient.clear()
	})

	it('leaves active profile reconciliation to the app after deletion refresh', async () => {
		const refresh = deferred<void>()
		const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
		const invalidateProfilesQuery = vi.fn(() => refresh.promise)
		const setProfileId = vi.fn()
		vi.spyOn(message, 'success').mockImplementation(() => undefined as never)
		const initialArgs = buildBaseArgs({
			api: createMockApiClient({ profiles: { deleteProfile: vi.fn().mockResolvedValue(undefined) } }),
			invalidateProfilesQuery, setProfileId,
		})
		const { result, unmount } = renderHook((args) => useProfilesPageMutations(args), {
			initialProps: initialArgs, wrapper: createWrapper(queryClient),
		})
		act(() => result.current.deleteMutation.mutate('profile-1'))
		await waitFor(() => expect(invalidateProfilesQuery).toHaveBeenCalledWith('token-a'))
		await act(async () => { refresh.resolve() })
		await waitFor(() => expect(result.current.deleteMutation.isSuccess).toBe(true))
		expect(setProfileId).not.toHaveBeenCalled()
		unmount()
		queryClient.clear()
	})

	it('ignores stale create success for a newer modal session while still refreshing the current scope', async () => {
		const createRequest = deferred<{
			id: string
			name: string
			provider: string
			endpoint: string
			region: string
			forcePathStyle: boolean
			preserveLeadingSlash: boolean
			tlsInsecureSkipVerify: boolean
			createdAt: string
			updatedAt: string
		}>()
		const createProfile = vi.fn().mockImplementation(() => createRequest.promise)
		const invalidateProfilesQuery = vi.fn().mockResolvedValue(undefined)
		const applyTLSUpdate = vi.fn().mockResolvedValue(undefined)
		const setProfileId = vi.fn()
		const closeCreateModal = vi.fn()
		const successSpy = vi.spyOn(message, 'success').mockImplementation(() => undefined as never)

		const queryClient = new QueryClient({
			defaultOptions: {
				mutations: { retry: false },
			},
		})
		const values = buildProfileFormValues()
		const initialArgs = buildBaseArgs({
			api: createMockApiClient({
				profiles: { createProfile },
			}),
			setProfileId,
			closeCreateModal,
			invalidateProfilesQuery,
			applyTLSUpdate,
			createModalSession: 1,
		})

		const { result, rerender } = renderHook((args) => useProfilesPageMutations(args), {
			initialProps: initialArgs,
			wrapper: createWrapper(queryClient),
		})

		act(() => {
			result.current.createMutation.mutate(values)
		})

		await waitFor(() => expect(createProfile).toHaveBeenCalledTimes(1))

		rerender({
			...initialArgs,
			createModalSession: 2,
		})

		await act(async () => {
			createRequest.resolve({
				id: 'profile-created',
				name: 'Created Profile',
				provider: 's3_compatible',
				endpoint: 'http://127.0.0.1:9000',
				region: 'us-east-1',
				forcePathStyle: false,
				preserveLeadingSlash: false,
				tlsInsecureSkipVerify: false,
				createdAt: '2026-04-08T00:00:00Z',
				updatedAt: '2026-04-08T00:00:00Z',
			})
			await Promise.resolve()
		})

		await waitFor(() => expect(invalidateProfilesQuery).toHaveBeenCalledWith('token-a'))
		await waitFor(() =>
			expect(applyTLSUpdate).toHaveBeenCalledWith('profile-created', values, 'create', 'token-a'),
		)

		expect(setProfileId).not.toHaveBeenCalled()
		expect(closeCreateModal).not.toHaveBeenCalled()
		expect(successSpy).not.toHaveBeenCalledWith('Profile created')
		expect(result.current.createLoading).toBe(false)
	})

	it('keeps the newer delete request active when an older delete resolves first', async () => {
		const firstDeleteRequest = deferred<void>()
		const secondDeleteRequest = deferred<void>()
		const deleteProfile = vi.fn((id: string) =>
			id === 'profile-1' ? firstDeleteRequest.promise : secondDeleteRequest.promise,
		)
		const invalidateProfilesQuery = vi.fn().mockResolvedValue(undefined)
		const setProfileId = vi.fn()
		const successSpy = vi.spyOn(message, 'success').mockImplementation(() => undefined as never)

		const queryClient = new QueryClient({
			defaultOptions: {
				mutations: { retry: false },
			},
		})
		const args = buildBaseArgs({
			api: createMockApiClient({
				profiles: { deleteProfile },
			}),
			setProfileId,
			invalidateProfilesQuery,
		})

		const { result } = renderHook(() => useProfilesPageMutations(args), {
			wrapper: createWrapper(queryClient),
		})

		act(() => {
			result.current.deleteMutation.mutate('profile-1')
		})
		await waitFor(() => expect(deleteProfile).toHaveBeenCalledWith('profile-1'))
		expect(result.current.deletingProfileId).toBe('profile-1')

		act(() => {
			result.current.deleteMutation.mutate('profile-2')
		})
		await waitFor(() => expect(deleteProfile).toHaveBeenCalledWith('profile-2'))
		expect(result.current.deletingProfileId).toBe('profile-2')

		await act(async () => {
			firstDeleteRequest.resolve()
			await Promise.resolve()
		})

		await waitFor(() => expect(invalidateProfilesQuery).toHaveBeenCalledWith('token-a'))

		expect(setProfileId).not.toHaveBeenCalled()
		expect(successSpy).not.toHaveBeenCalledWith('Profile deleted')
		expect(result.current.deletingProfileId).toBe('profile-2')
	})

	it('aborts replaced profile tests and connectivity requests from an old scope', async () => {
		const testSignals: AbortSignal[] = []
		const benchmarkSignals: AbortSignal[] = []
		const pendingRequest = (signals: AbortSignal[]) => (_id: string, signal?: AbortSignal) => {
			expect(signal).toBeInstanceOf(AbortSignal)
			signals.push(signal!)
			return new Promise<never>((_resolve, reject) => {
				signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
			})
		}
		const testProfile = vi.fn(pendingRequest(testSignals))
		const benchmarkProfile = vi.fn(pendingRequest(benchmarkSignals))
		const serverScopeVersionRef = { current: 1 }
		const queryClient = new QueryClient({
			defaultOptions: {
				mutations: { retry: false },
			},
		})
		const initialArgs = buildBaseArgs({
			api: createMockApiClient({
				profiles: { testProfile, benchmarkProfile },
			}),
			serverScopeVersionRef,
		})

		const { result, rerender } = renderHook((args) => useProfilesPageMutations(args), {
			initialProps: initialArgs,
			wrapper: createWrapper(queryClient),
		})

		act(() => result.current.testMutation.mutate('profile-1'))
		await waitFor(() => expect(testSignals).toHaveLength(1))

		act(() => result.current.testMutation.mutate('profile-1'))
		await waitFor(() => expect(testSignals).toHaveLength(2))
		expect(testSignals[0]?.aborted).toBe(true)
		expect(testSignals[1]?.aborted).toBe(false)
		await waitFor(() => expect(result.current.testingProfileId).toBe('profile-1'))

		act(() => result.current.benchmarkMutation.mutate('profile-1'))
		await waitFor(() => expect(benchmarkSignals).toHaveLength(1))
		expect(benchmarkSignals[0]?.aborted).toBe(false)

		serverScopeVersionRef.current = 2
		rerender({
			...initialArgs,
			apiToken: 'token-b',
			currentScopeKey: 'token-b::profiles',
		})

		await waitFor(() => expect(testSignals[1]?.aborted).toBe(true))
		expect(benchmarkSignals[0]?.aborted).toBe(true)
	})
})
