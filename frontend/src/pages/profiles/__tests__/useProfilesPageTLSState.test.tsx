import { useQuery } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { queryKeys } from '../../../api/queryKeys'
import { createMockApiClient } from '../../../test/mockApiClient'
import type { ProfileFormValues } from '../profileTypes'
import { useProfilesPageTLSState } from '../useProfilesPageTLSState'

vi.mock('@tanstack/react-query', async () => {
	const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
	return {
		...actual,
		useQuery: vi.fn(),
	}
})

const useQueryMock = vi.mocked(useQuery)

function buildValues(overrides: Partial<ProfileFormValues> = {}): ProfileFormValues {
	return {
		provider: 's3_compatible',
		name: 'Profile',
		endpoint: 'http://127.0.0.1:9000',
		publicEndpoint: '',
		region: 'us-east-1',
		accessKeyId: 'access',
		secretAccessKey: 'secret',
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
		...overrides,
	}
}

describe('useProfilesPageTLSState', () => {
	it('keeps the failed status visible during retry and suppresses duplicate refetches', async () => {
		let finish!: () => void
		const pending = new Promise<void>((resolve) => { finish = resolve })
		const refetch = vi.fn(() => pending)
		const query = { data: null, isFetching: false, isError: true, error: new Error('TLS status unavailable'), refetch }
		useQueryMock.mockReturnValue(query as never)
		const { result, rerender } = renderHook(() => useProfilesPageTLSState({
			api: createMockApiClient(), apiToken: 'token-a', queryClient: { invalidateQueries: vi.fn() },
			activeEditProfile: { id: 'profile-2', name: 'Edited', provider: 's3_compatible' } as never,
			tlsCapability: { enabled: true },
		}))
		act(() => {
			result.current.retryTLSStatus()
			result.current.retryTLSStatus()
		})
		expect(refetch).toHaveBeenCalledOnce()
		expect(refetch).toHaveBeenCalledWith({ cancelRefetch: false })
		useQueryMock.mockReturnValue({ ...query, isFetching: true, isError: false, error: null } as never)
		rerender()
		expect(result.current.tlsStatusError).toContain('TLS status unavailable')
		act(() => result.current.retryTLSStatus())
		expect(refetch).toHaveBeenCalledOnce()
		useQueryMock.mockReturnValue({ ...query, data: { mode: 'mtls' }, isFetching: false, isError: false, error: null } as never)
		await act(async () => { finish(); await pending })
		rerender()
		expect(result.current.tlsStatusError).toBeNull()
		expect(result.current.tlsStatus).toEqual({ mode: 'mtls' })
	})

	it.each(['profile', 'token'] as const)('ignores an old retry handler after the %s scope changes', (changedScope) => {
		const refetch = vi.fn().mockResolvedValue(undefined)
		useQueryMock.mockReturnValue({ data: null, isFetching: false, isError: true, error: new Error('TLS status unavailable'), refetch } as never)
		const { result, rerender } = renderHook(({ apiToken, profileId }) => useProfilesPageTLSState({
			api: createMockApiClient(), apiToken, queryClient: { invalidateQueries: vi.fn() },
			activeEditProfile: { id: profileId, name: 'Edited', provider: 's3_compatible' } as never,
			tlsCapability: { enabled: true },
		}), { initialProps: { apiToken: 'token-a', profileId: 'profile-2' } })
		const oldRetry = result.current.retryTLSStatus
		rerender(changedScope === 'profile' ? { apiToken: 'token-a', profileId: 'profile-3' } : { apiToken: 'token-b', profileId: 'profile-2' })
		act(oldRetry)
		expect(refetch).not.toHaveBeenCalled()
	})

	it.each(['closed', 'disabled', 'fetching'] as const)('does not refetch TLS status while %s', (blocked) => {
		const refetch = vi.fn().mockResolvedValue(undefined)
		useQueryMock.mockReturnValue({ data: null, isFetching: blocked === 'fetching', isError: true, error: new Error('TLS status unavailable'), refetch } as never)
		const { result } = renderHook(() => useProfilesPageTLSState({
			api: createMockApiClient(), apiToken: 'token-a', queryClient: { invalidateQueries: vi.fn() },
			activeEditProfile: blocked === 'closed' ? null : { id: 'profile-2', name: 'Edited', provider: 's3_compatible' } as never,
			tlsCapability: { enabled: blocked !== 'disabled' },
		}))
		act(() => result.current.retryTLSStatus())
		expect(refetch).not.toHaveBeenCalled()
	})

	it('keeps a newer retry warning when an earlier profile retry settles', async () => {
		let finishOld!: () => void
		let finishNew!: () => void
		const oldPending = new Promise<void>((resolve) => { finishOld = resolve })
		const newPending = new Promise<void>((resolve) => { finishNew = resolve })
		const query = { data: null, isFetching: false, isError: true, error: new Error('Old TLS status unavailable'), refetch: vi.fn(() => oldPending) }
		useQueryMock.mockReturnValue(query as never)
		const { result, rerender } = renderHook(({ profileId }) => useProfilesPageTLSState({
			api: createMockApiClient(), apiToken: 'token-a', queryClient: { invalidateQueries: vi.fn() },
			activeEditProfile: { id: profileId, name: 'Edited', provider: 's3_compatible' } as never,
			tlsCapability: { enabled: true },
		}), { initialProps: { profileId: 'profile-2' } })
		act(() => result.current.retryTLSStatus())
		useQueryMock.mockReturnValue({ ...query, error: new Error('New TLS status unavailable'), refetch: vi.fn(() => newPending) } as never)
		rerender({ profileId: 'profile-3' })
		act(() => result.current.retryTLSStatus())
		useQueryMock.mockReturnValue({ ...query, isFetching: true, isError: false, error: null } as never)
		rerender({ profileId: 'profile-3' })
		await act(async () => { finishOld(); await oldPending })
		expect(result.current.tlsStatusError).toContain('New TLS status unavailable')
		await act(async () => { finishNew(); await newPending })
	})

	it('configures TLS status query from active edit profile and capability', () => {
		useQueryMock.mockReturnValue({
			data: { mode: 'mtls' },
			isFetching: true,
			isError: false,
			error: null,
		} as never)

		const api = createMockApiClient({
			profiles: {
				getProfileTLS: vi.fn(),
			},
		})

		const { result } = renderHook(() =>
			useProfilesPageTLSState({
				api,
				apiToken: 'token-a',
				queryClient: { invalidateQueries: vi.fn() },
				activeEditProfile: { id: 'profile-2', name: 'Edited', provider: 's3_compatible' } as never,
				tlsCapability: { enabled: true },
			}),
		)

		expect(useQueryMock).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: queryKeys.profiles.tls('profile-2', 'token-a'),
				enabled: true,
			}),
		)
		expect(result.current).toMatchObject({
			tlsCapability: { enabled: true },
			tlsStatus: { mode: 'mtls' },
			tlsStatusLoading: true,
			tlsStatusError: null,
		})
	})

	it('applies create and edit TLS updates and invalidates the scoped TLS query', async () => {
		useQueryMock.mockReturnValue({
			data: null,
			isFetching: false,
			isError: false,
			error: null,
		} as never)

		const updateProfileTLS = vi.fn().mockResolvedValue(undefined)
		const deleteProfileTLS = vi.fn().mockResolvedValue(undefined)
		const invalidateQueries = vi.fn().mockResolvedValue(undefined)
		const api = createMockApiClient({
			profiles: {
				getProfileTLS: vi.fn(),
				updateProfileTLS,
				deleteProfileTLS,
			},
		})

		const { result } = renderHook(() =>
			useProfilesPageTLSState({
				api,
				apiToken: 'token-a',
				queryClient: { invalidateQueries },
				activeEditProfile: null,
				tlsCapability: { enabled: true },
			}),
		)

		await result.current.applyTLSUpdate(
			'profile-1',
			buildValues({
				tlsEnabled: true,
				tlsClientCertPem: 'cert',
				tlsClientKeyPem: 'key',
				tlsCaCertPem: 'ca',
			}),
			'create',
			'token-a',
		)

		expect(updateProfileTLS).toHaveBeenNthCalledWith(1, 'profile-1', {
			mode: 'mtls',
			clientCertPem: 'cert',
			clientKeyPem: 'key',
			caCertPem: 'ca',
		})
		expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
			queryKey: queryKeys.profiles.tls('profile-1', 'token-a'),
			exact: true,
		})

		await result.current.applyTLSUpdate(
			'profile-1',
			buildValues({
				tlsAction: 'disable',
			}),
			'edit',
			'token-a',
		)

		expect(deleteProfileTLS).toHaveBeenCalledWith('profile-1')
		expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
			queryKey: queryKeys.profiles.tls('profile-1', 'token-a'),
			exact: true,
		})
	})
})
