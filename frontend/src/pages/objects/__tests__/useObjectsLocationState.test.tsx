import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useObjectsLocationState } from '../useObjectsLocationState'

describe('useObjectsLocationState', () => {
	beforeEach(() => {
		window.localStorage.clear()
	})

	it('tracks location history and supports back/forward navigation', async () => {
		const { result } = renderHook(() => useObjectsLocationState({ apiToken: 'token-a', profileId: 'profile-1' }))

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
		const { result } = renderHook(() => useObjectsLocationState({ apiToken: 'token-a', profileId: 'profile-1' }))

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
			result.current.openPathModal()
		})
		act(() => {
			result.current.setPathDraft('docs/reports')
		})
		act(() => {
			result.current.commitPathDraft()
		})
		expect(result.current.prefix).toBe('docs/reports/')
	})

	it('scopes stored location state by profile id', async () => {
		const { result, rerender } = renderHook(({ apiToken, profileId }) => useObjectsLocationState({ apiToken, profileId }), {
			initialProps: { apiToken: 'token-a', profileId: 'profile-a' },
		})

		await waitFor(() => expect(result.current.tabs.length).toBe(1))

		act(() => {
			result.current.navigateToLocation('bucket-a', 'folder-a', { recordHistory: true })
		})
		expect(result.current.bucket).toBe('bucket-a')
		expect(result.current.prefix).toBe('folder-a/')

		rerender({ apiToken: 'token-a', profileId: 'profile-b' })
		await waitFor(() => expect(result.current.tabs.length).toBe(1))
		expect(result.current.bucket).toBe('')
		expect(result.current.prefix).toBe('')

		act(() => {
			result.current.navigateToLocation('bucket-b', 'folder-b', { recordHistory: true })
		})
		expect(result.current.bucket).toBe('bucket-b')
		expect(result.current.prefix).toBe('folder-b/')

		rerender({ apiToken: 'token-a', profileId: 'profile-a' })
		await waitFor(() => expect(result.current.bucket).toBe('bucket-a'))
		expect(result.current.prefix).toBe('folder-a/')
	})

	it('scopes stored location state by api token for the same profile id', async () => {
		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) => useObjectsLocationState({ apiToken, profileId: 'profile-a' }),
			{ initialProps: { apiToken: 'token-a' } },
		)

		await waitFor(() => expect(result.current.tabs.length).toBe(1))

		act(() => {
			result.current.navigateToLocation('bucket-a', 'folder-a', { recordHistory: true })
		})

		rerender({ apiToken: 'token-b' })
		await waitFor(() => expect(result.current.tabs.length).toBe(1))
		expect(result.current.bucket).toBe('')
		expect(result.current.prefix).toBe('')

		act(() => {
			result.current.navigateToLocation('bucket-b', 'folder-b', { recordHistory: true })
		})

		rerender({ apiToken: 'token-a' })
		await waitFor(() => expect(result.current.bucket).toBe('bucket-a'))
		expect(result.current.prefix).toBe('folder-a/')
	})

	it('hides the path modal when the api token changes even if the location matches', async () => {
		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) => useObjectsLocationState({ apiToken, profileId: 'profile-a' }),
			{ initialProps: { apiToken: 'token-a' } },
		)

		await waitFor(() => expect(result.current.tabs.length).toBe(1))

		act(() => {
			result.current.navigateToLocation('bucket-a', 'docs', { recordHistory: true })
		})

		rerender({ apiToken: 'token-b' })
		await waitFor(() => expect(result.current.tabs.length).toBe(1))

		act(() => {
			result.current.navigateToLocation('bucket-a', 'docs', { recordHistory: true })
		})
		await waitFor(() => expect(result.current.bucket).toBe('bucket-a'))
		act(() => {
			result.current.openPathModal()
		})
		act(() => {
			result.current.setPathDraft('docs/custom')
		})

		expect(result.current.pathModalOpen).toBe(true)
		expect(result.current.pathDraft).toBe('docs/custom')

		rerender({ apiToken: 'token-a' })

		expect(result.current.pathModalOpen).toBe(false)
		expect(result.current.pathDraft).toBe('docs/')
	})
})
