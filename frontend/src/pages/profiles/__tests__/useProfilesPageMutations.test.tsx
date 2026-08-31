import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { message } from 'antd'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMockApiClient } from '../../../test/mockApiClient'
import type { ProfileFormValues } from '../profileTypes'
import { useProfilesPageMutations } from '../useProfilesPageMutations'

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
		profileId: 'profile-1',
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
			profileId: 'profile-1',
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
