import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useObjectsSearchState } from '../useObjectsSearchState'

describe('useObjectsSearchState', () => {
	beforeEach(() => {
		window.localStorage.clear()
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('debounces draft changes before committing search', () => {
		const { result } = renderHook(() => useObjectsSearchState({ apiToken: 'token-a', profileId: 'profile-1', debounceMs: 250 }))

		expect(result.current.search).toBe('')
		expect(result.current.searchDraft).toBe('')

		act(() => {
			result.current.setSearchDraft('reports')
		})
		expect(result.current.search).toBe('')
		expect(result.current.searchDraft).toBe('reports')

		act(() => {
			vi.advanceTimersByTime(249)
		})
		expect(result.current.search).toBe('')

		act(() => {
			vi.advanceTimersByTime(1)
		})
		expect(result.current.search).toBe('reports')
		expect(window.localStorage.getItem('objects:token-a:profile-1:search')).toBe(JSON.stringify('reports'))
	})

	it('clears both committed and draft search', () => {
		window.localStorage.setItem('objects:token-a:profile-1:search', JSON.stringify('invoices'))

		const { result } = renderHook(() => useObjectsSearchState({ apiToken: 'token-a', profileId: 'profile-1' }))

		expect(result.current.search).toBe('invoices')
		expect(result.current.searchDraft).toBe('invoices')

		act(() => {
			result.current.clearSearch()
		})

		expect(result.current.search).toBe('')
		expect(result.current.searchDraft).toBe('')
		expect(window.localStorage.getItem('objects:token-a:profile-1:search')).toBe(JSON.stringify(''))
	})

	it('migrates the legacy global search key into a profile-scoped key', () => {
		window.localStorage.setItem('objectsSearch', JSON.stringify('invoices'))

		const { result } = renderHook(() => useObjectsSearchState({ apiToken: 'token-a', profileId: 'profile-1' }))

		expect(result.current.search).toBe('invoices')
		expect(window.localStorage.getItem('objects:token-a:profile-1:search')).toBe(JSON.stringify('invoices'))
		expect(window.localStorage.getItem('objectsSearch')).toBeNull()
	})

	it('keeps search isolated per profile', () => {
		const { result, rerender } = renderHook(
			({ apiToken, profileId }: { apiToken: string; profileId: string | null }) =>
				useObjectsSearchState({ apiToken, profileId, debounceMs: 0 }),
			{ initialProps: { apiToken: 'token-a', profileId: 'profile-1' } },
		)

		act(() => {
			result.current.setSearchDraft('alpha')
		})
		act(() => {
			vi.runAllTimers()
		})

		expect(result.current.search).toBe('alpha')

		rerender({ apiToken: 'token-a', profileId: 'profile-2' })

		expect(result.current.search).toBe('')
		expect(result.current.searchDraft).toBe('')

		act(() => {
			result.current.setSearchDraft('beta')
		})
		act(() => {
			vi.runAllTimers()
		})

		expect(result.current.search).toBe('beta')

		rerender({ apiToken: 'token-a', profileId: 'profile-1' })

		expect(result.current.search).toBe('alpha')
		expect(result.current.searchDraft).toBe('alpha')
	})

	it('keeps search isolated per api token for the same profile', () => {
		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) => useObjectsSearchState({ apiToken, profileId: 'profile-1', debounceMs: 0 }),
			{ initialProps: { apiToken: 'token-a' } },
		)

		act(() => {
			result.current.setSearchDraft('alpha')
		})
		act(() => {
			vi.runAllTimers()
		})

		rerender({ apiToken: 'token-b' })

		expect(result.current.search).toBe('')
		expect(result.current.searchDraft).toBe('')

		act(() => {
			result.current.setSearchDraft('beta')
		})
		act(() => {
			vi.runAllTimers()
		})

		rerender({ apiToken: 'token-a' })

		expect(result.current.search).toBe('alpha')
		expect(result.current.searchDraft).toBe('alpha')
	})
})
