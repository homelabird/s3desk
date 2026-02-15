import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useObjectsLocationState } from '../useObjectsLocationState'

describe('useObjectsLocationState', () => {
	beforeEach(() => {
		window.localStorage.clear()
	})

	it('tracks location history and supports back/forward navigation', async () => {
		const { result } = renderHook(() => useObjectsLocationState({ profileId: 'profile-1' }))

		await waitFor(() => expect(result.current.tabs.length).toBe(1))
		expect(result.current.prefix).toBe('')

		act(() => {
			result.current.navigateToLocation('bucket-a', 'folder-one', { recordHistory: true })
		})

		expect(result.current.bucket).toBe('bucket-a')
		expect(result.current.prefix).toBe('folder-one/')
		expect(result.current.canGoBack).toBe(true)
		expect(result.current.canGoForward).toBe(false)

		act(() => {
			result.current.navigateToLocation('bucket-a', 'folder-two', { recordHistory: true })
		})

		expect(result.current.prefix).toBe('folder-two/')

		act(() => {
			result.current.goBack()
		})
		expect(result.current.prefix).toBe('folder-one/')
		expect(result.current.canGoForward).toBe(true)

		act(() => {
			result.current.goForward()
		})
		expect(result.current.prefix).toBe('folder-two/')
	})

	it('updates bookmarks and commits path draft', async () => {
		const { result } = renderHook(() => useObjectsLocationState({ profileId: 'profile-1' }))

		await waitFor(() => expect(result.current.tabs.length).toBe(1))

		act(() => {
			result.current.navigateToLocation('bucket-a', 'docs', { recordHistory: true })
		})
		expect(result.current.isBookmarked).toBe(false)

		act(() => {
			result.current.toggleBookmark()
		})
		expect(result.current.isBookmarked).toBe(true)

		act(() => {
			result.current.setPathDraft('docs/reports')
		})
		act(() => {
			result.current.commitPathDraft()
		})
		expect(result.current.prefix).toBe('docs/reports/')
	})
})
