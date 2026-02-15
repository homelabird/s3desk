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
		const { result } = renderHook(() => useObjectsSearchState({ debounceMs: 250 }))

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
		expect(window.localStorage.getItem('objectsSearch')).toBe(JSON.stringify('reports'))
	})

	it('clears both committed and draft search', () => {
		window.localStorage.setItem('objectsSearch', JSON.stringify('invoices'))

		const { result } = renderHook(() => useObjectsSearchState())

		expect(result.current.search).toBe('invoices')
		expect(result.current.searchDraft).toBe('invoices')

		act(() => {
			result.current.clearSearch()
		})

		expect(result.current.search).toBe('')
		expect(result.current.searchDraft).toBe('')
		expect(window.localStorage.getItem('objectsSearch')).toBe(JSON.stringify(''))
	})
})
