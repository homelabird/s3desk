import { act, renderHook } from '@testing-library/react'
import type { SetURLSearchParams } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Profile } from '../../../api/types'
import { useProfilesPageControllerState } from '../useProfilesPageControllerState'

function buildS3CompatibleProfile(overrides: Record<string, unknown> = {}): Profile {
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

describe('useProfilesPageControllerState', () => {
	it('opens and closes the create modal through search params', () => {
		const setSearchParams = vi.fn<SetURLSearchParams>()
		const searchParams = new URLSearchParams()

		const { result, rerender } = renderHook(
			(props: { apiToken: string; searchParams: URLSearchParams }) =>
				useProfilesPageControllerState({
					apiToken: props.apiToken,
					profileId: null,
					profiles: [],
					searchParams: props.searchParams,
					setSearchParams,
				}),
			{
				initialProps: {
					apiToken: 'token-a',
					searchParams,
				},
			},
		)

		act(() => {
			result.current.openCreateModal()
		})

		expect(setSearchParams).toHaveBeenCalledWith(expect.any(URLSearchParams), { replace: true })
		const openedParams = setSearchParams.mock.calls.at(-1)?.[0] as URLSearchParams
		expect(openedParams.get('create')).toBe('1')

		rerender({
			apiToken: 'token-a',
			searchParams: new URLSearchParams('create=1'),
		})
		expect(result.current.createOpen).toBe(true)

		act(() => {
			result.current.closeCreateModal()
		})

		const closedParams = setSearchParams.mock.calls.at(-1)?.[0] as URLSearchParams
		expect(closedParams.has('create')).toBe(false)
	})

	it('hides stale edit state after the scope changes', () => {
		const profile = buildS3CompatibleProfile()
		const { result, rerender } = renderHook(
			(props: { apiToken: string }) =>
				useProfilesPageControllerState({
					apiToken: props.apiToken,
					profileId: null,
					profiles: [profile],
					searchParams: new URLSearchParams(),
					setSearchParams: vi.fn(),
				}),
			{
				initialProps: { apiToken: 'token-a' },
			},
		)

		act(() => {
			result.current.openEditModal(profile)
		})

		expect(result.current.activeEditProfile?.id).toBe('profile-1')

		rerender({ apiToken: 'token-b' })

		expect(result.current.activeEditProfile).toBe(null)
	})

	it('computes onboarding visibility, attention rows, and edit initial values', () => {
		const profile = buildS3CompatibleProfile({
			validation: {
				valid: false,
				issues: [{ code: 'invalid', message: 'Needs update' }],
			},
		})

		const { result } = renderHook(() =>
			useProfilesPageControllerState({
				apiToken: 'token-a',
				profileId: null,
				profiles: [profile],
				searchParams: new URLSearchParams(),
				setSearchParams: vi.fn(),
			}),
		)

		expect(result.current.onboardingVisible).toBe(true)
		expect(result.current.tableRows).toHaveLength(1)
		expect(result.current.profilesNeedingAttention).toHaveLength(1)

		act(() => {
			result.current.openEditModal(profile)
		})

		expect(result.current.editInitialValues).toEqual(
			expect.objectContaining({
				name: 'Primary Profile',
				provider: 's3_compatible',
			}),
		)

		act(() => {
			result.current.dismissOnboarding()
		})

		expect(result.current.onboardingVisible).toBe(false)
	})
})
