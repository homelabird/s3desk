import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useProfilesPageCompositionState } from '../useProfilesPageCompositionState'

const useProfilesPageStateMock = vi.fn()

vi.mock('../useProfilesPageState', () => ({
	useProfilesPageState: (...args: unknown[]) => useProfilesPageStateMock(...args),
}))

describe('useProfilesPageCompositionState', () => {
	it('wraps profiles page shell props in a composition object', () => {
		const shell = {
			onOpenImportModal: vi.fn(),
			onOpenCreateModal: vi.fn(),
			onboarding: { visible: true },
			status: { currentScopeKey: 'token-a::profiles' },
			hasOpenModal: false,
			dialogs: { createOpen: false },
		}
		const setProfileId = vi.fn()
		useProfilesPageStateMock.mockReturnValue(shell)

		const { result } = renderHook(() =>
			useProfilesPageCompositionState({
				apiToken: 'token-a',
				profileId: 'profile-1',
				setProfileId,
			}),
		)

		expect(useProfilesPageStateMock).toHaveBeenCalledWith({
			apiToken: 'token-a',
			profileId: 'profile-1',
			setProfileId,
		})
		expect(result.current).toEqual({
			shell,
		})
	})
})
