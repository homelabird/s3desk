import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useUploadsPageCompositionState } from '../useUploadsPageCompositionState'

const useUploadsPageStateMock = vi.fn()
const buildUploadsPagePresentationPropsMock = vi.fn()

vi.mock('../useUploadsPageState', () => ({
	useUploadsPageState: (...args: unknown[]) => useUploadsPageStateMock(...args),
}))

vi.mock('../buildUploadsPagePresentationProps', () => ({
	buildUploadsPagePresentationProps: (...args: unknown[]) => buildUploadsPagePresentationPropsMock(...args),
}))

describe('useUploadsPageCompositionState', () => {
	it('composes route shell props with presentation props from uploads page state', () => {
		const state = {
			selectedProfile: { id: 'profile-1', name: 'Primary Profile' },
			bucket: 'primary-bucket',
		}
		const presentation = {
			header: { subtitle: 'Uploads ready' },
			targetSource: { show: true },
		}
		useUploadsPageStateMock.mockReturnValue(state)
		buildUploadsPagePresentationPropsMock.mockReturnValue(presentation)

		const { result } = renderHook(() =>
			useUploadsPageCompositionState({
				apiToken: 'token-a',
				profileId: 'profile-1',
			}),
		)

		expect(useUploadsPageStateMock).toHaveBeenCalledWith({
			apiToken: 'token-a',
			profileId: 'profile-1',
		})
		expect(buildUploadsPagePresentationPropsMock).toHaveBeenCalledWith(state)
		expect(result.current).toEqual({
			route: {
				apiToken: 'token-a',
				profileId: 'profile-1',
			},
			presentation,
		})
	})
})
