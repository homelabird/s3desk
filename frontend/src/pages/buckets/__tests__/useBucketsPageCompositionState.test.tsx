import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useBucketsPageCompositionState } from '../useBucketsPageCompositionState'

const useBucketsPageStateMock = vi.fn()
const buildBucketsPageShellPropsMock = vi.fn()

vi.mock('../useBucketsPageState', () => ({
	useBucketsPageState: (...args: unknown[]) => useBucketsPageStateMock(...args),
}))

vi.mock('../buildBucketsPageShellProps', () => ({
	buildBucketsPageShellProps: (...args: unknown[]) => buildBucketsPageShellPropsMock(...args),
}))

describe('useBucketsPageCompositionState', () => {
	it('composes route shell props from buckets page state', () => {
		const state = {
			selectedProfile: { id: 'profile-1', name: 'Primary Profile' },
			buckets: [{ name: 'primary-bucket', createdAt: '2026-04-08T00:00:00Z' }],
		}
		const composition = {
			apiToken: 'token-a',
			profileId: 'profile-1',
			shell: {
				selectedProfile: state.selectedProfile,
				buckets: state.buckets,
			},
		}
		useBucketsPageStateMock.mockReturnValue(state)
		buildBucketsPageShellPropsMock.mockReturnValue(composition)

		const { result } = renderHook(() =>
			useBucketsPageCompositionState({
				apiToken: 'token-a',
				profileId: 'profile-1',
			}),
		)

		expect(useBucketsPageStateMock).toHaveBeenCalledWith({
			apiToken: 'token-a',
			profileId: 'profile-1',
		})
		expect(buildBucketsPageShellPropsMock).toHaveBeenCalledWith({
			apiToken: 'token-a',
			profileId: 'profile-1',
			state,
		})
		expect(result.current).toEqual(composition)
	})
})
