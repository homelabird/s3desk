import { act, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it } from 'vitest'

import { useProfilesPageScopeState } from '../useProfilesPageScopeState'

describe('useProfilesPageScopeState', () => {
	it('keeps the current mount active when StrictMode replays effects', () => {
		const { result, unmount } = renderHook(
			() => useProfilesPageScopeState('token-a'),
			{ wrapper: StrictMode },
		)

		expect(result.current.isActiveRef.current).toBe(true)
		unmount()
		expect(result.current.isActiveRef.current).toBe(false)
	})

	it('tracks modal sessions independently and bumps scope version when the api token changes', () => {
		const { result, rerender, unmount } = renderHook(
			(props: { apiToken: string }) => useProfilesPageScopeState(props.apiToken),
			{
				initialProps: { apiToken: 'token-a' },
			},
		)

		expect(result.current.currentScopeKey).toBe('token-a')
		expect(result.current.createModalSession).toBe(0)
		expect(result.current.editModalSession).toBe(0)
		expect(result.current.serverScopeVersionRef.current).toBe(1)
		expect(result.current.isActiveRef.current).toBe(true)

		act(() => {
			result.current.advanceCreateModalSession()
			result.current.advanceEditModalSession()
			result.current.advanceEditModalSession()
		})

		expect(result.current.createModalSession).toBe(1)
		expect(result.current.editModalSession).toBe(2)

		rerender({ apiToken: 'token-b' })

		expect(result.current.currentScopeKey).toBe('token-b')
		expect(result.current.serverScopeVersionRef.current).toBe(2)
		expect(result.current.createModalSession).toBe(1)
		expect(result.current.editModalSession).toBe(2)

		unmount()
		expect(result.current.isActiveRef.current).toBe(false)
	})
})
