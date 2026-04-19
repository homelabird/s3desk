import { useQuery } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
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
