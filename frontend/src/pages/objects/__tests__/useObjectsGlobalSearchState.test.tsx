import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useObjectsGlobalSearchState } from '../useObjectsGlobalSearchState'

describe('useObjectsGlobalSearchState', () => {
	afterEach(() => {
		window.localStorage.clear()
	})

	it('migrates legacy global search filters into profile-scoped keys', async () => {
		window.localStorage.setItem('objectsGlobalSearch', JSON.stringify('invoice'))
		window.localStorage.setItem('objectsGlobalSearchPrefix', JSON.stringify('reports/'))
		window.localStorage.setItem('objectsGlobalSearchLimit', JSON.stringify(25))
		window.localStorage.setItem('objectsGlobalSearchExt', JSON.stringify('.PDF'))
		window.localStorage.setItem('objectsGlobalSearchMinSize', JSON.stringify(512))
		window.localStorage.setItem('objectsGlobalSearchMaxModifiedMs', JSON.stringify(7890))

		const { result } = renderHook(() => useObjectsGlobalSearchState({ apiToken: 'token-a', profileId: 'profile-1' }))

		expect(result.current.globalSearch).toBe('invoice')
		expect(result.current.globalSearchPrefix).toBe('reports/')
		expect(result.current.globalSearchLimit).toBe(25)
		expect(result.current.globalSearchExt).toBe('pdf')
		expect(result.current.globalSearchMinSize).toBe(512)
		expect(result.current.globalSearchMaxModifiedMs).toBe(7890)

		await waitFor(() => {
			expect(window.localStorage.getItem('objects:token-a:profile-1:globalSearch')).toBe(JSON.stringify('invoice'))
			expect(window.localStorage.getItem('objects:token-a:profile-1:globalSearchPrefix')).toBe(JSON.stringify('reports/'))
			expect(window.localStorage.getItem('objects:token-a:profile-1:globalSearchLimit')).toBe(JSON.stringify(25))
			expect(window.localStorage.getItem('objects:token-a:profile-1:globalSearchExt')).toBe(JSON.stringify('pdf'))
			expect(window.localStorage.getItem('objects:token-a:profile-1:globalSearchMinSize')).toBe(JSON.stringify(512))
			expect(window.localStorage.getItem('objects:token-a:profile-1:globalSearchMaxModifiedMs')).toBe(JSON.stringify(7890))
		})

		expect(window.localStorage.getItem('objectsGlobalSearch')).toBeNull()
		expect(window.localStorage.getItem('objectsGlobalSearchPrefix')).toBeNull()
		expect(window.localStorage.getItem('objectsGlobalSearchLimit')).toBeNull()
		expect(window.localStorage.getItem('objectsGlobalSearchExt')).toBeNull()
		expect(window.localStorage.getItem('objectsGlobalSearchMinSize')).toBeNull()
		expect(window.localStorage.getItem('objectsGlobalSearchMaxModifiedMs')).toBeNull()
	})

	it('keeps global search state isolated per profile', async () => {
		const { result, rerender } = renderHook(
			({ apiToken, profileId, bucket }: { apiToken: string; profileId: string | null; bucket: string }) =>
				useObjectsGlobalSearchState({ apiToken, profileId, bucket }),
			{ initialProps: { apiToken: 'token-a', profileId: 'profile-1', bucket: 'bucket-a' } },
		)

		act(() => {
			result.current.setGlobalSearch('alpha')
			result.current.setGlobalSearchPrefix('docs/')
			result.current.setGlobalSearchLimit(50)
			result.current.setGlobalSearchExt('.txt')
			result.current.setGlobalSearchMinSize(64)
		})

		await waitFor(() => {
			expect(result.current.globalSearchDraft).toBe('alpha')
		})

		rerender({ apiToken: 'token-a', profileId: 'profile-2', bucket: 'bucket-a' })

		await waitFor(() => {
			expect(result.current.globalSearch).toBe('')
			expect(result.current.globalSearchDraft).toBe('')
			expect(result.current.globalSearchPrefix).toBe('')
			expect(result.current.globalSearchLimit).toBe(100)
			expect(result.current.globalSearchExt).toBe('')
			expect(result.current.globalSearchMinSize).toBeNull()
		})

		act(() => {
			result.current.setGlobalSearch('beta')
			result.current.setGlobalSearchPrefix('images/')
		})

		rerender({ apiToken: 'token-a', profileId: 'profile-1', bucket: 'bucket-a' })

		await waitFor(() => {
			expect(result.current.globalSearch).toBe('alpha')
			expect(result.current.globalSearchDraft).toBe('alpha')
			expect(result.current.globalSearchPrefix).toBe('docs/')
			expect(result.current.globalSearchLimit).toBe(50)
			expect(result.current.globalSearchExt).toBe('txt')
			expect(result.current.globalSearchMinSize).toBe(64)
		})
	})

	it('resets index job draft state when the profile or bucket changes', async () => {
		const { result, rerender } = renderHook(
			({ apiToken, profileId, bucket }: { apiToken: string; profileId: string | null; bucket: string }) =>
				useObjectsGlobalSearchState({ apiToken, profileId, bucket }),
			{ initialProps: { apiToken: 'token-a', profileId: 'profile-1', bucket: 'bucket-a' } },
		)

		act(() => {
			result.current.setIndexPrefix('docs/')
			result.current.setIndexFullReindex(false)
		})

		expect(result.current.indexPrefix).toBe('docs/')
		expect(result.current.indexFullReindex).toBe(false)

		rerender({ apiToken: 'token-a', profileId: 'profile-2', bucket: 'bucket-a' })

		await waitFor(() => {
			expect(result.current.indexPrefix).toBe('')
			expect(result.current.indexFullReindex).toBe(true)
		})

		act(() => {
			result.current.setIndexPrefix('images/')
			result.current.setIndexFullReindex(false)
		})

		rerender({ apiToken: 'token-a', profileId: 'profile-2', bucket: 'bucket-b' })

		await waitFor(() => {
			expect(result.current.indexPrefix).toBe('')
			expect(result.current.indexFullReindex).toBe(true)
		})
	})

	it('keeps global search state isolated per api token for the same profile', async () => {
		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsGlobalSearchState({ apiToken, profileId: 'profile-1', bucket: 'bucket-a' }),
			{ initialProps: { apiToken: 'token-a' } },
		)

		act(() => {
			result.current.setGlobalSearch('alpha')
			result.current.setGlobalSearchPrefix('docs/')
		})

		await waitFor(() => {
			expect(result.current.globalSearch).toBe('alpha')
		})

		rerender({ apiToken: 'token-b' })

		await waitFor(() => {
			expect(result.current.globalSearch).toBe('')
			expect(result.current.globalSearchPrefix).toBe('')
		})

		act(() => {
			result.current.setGlobalSearch('beta')
		})

		rerender({ apiToken: 'token-a' })

		await waitFor(() => {
			expect(result.current.globalSearch).toBe('alpha')
			expect(result.current.globalSearchPrefix).toBe('docs/')
		})
	})

	it('resets index job draft state when the api token changes', async () => {
		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsGlobalSearchState({ apiToken, profileId: 'profile-1', bucket: 'bucket-a' }),
			{ initialProps: { apiToken: 'token-a' } },
		)

		act(() => {
			result.current.setIndexPrefix('docs/')
			result.current.setIndexFullReindex(false)
		})

		expect(result.current.indexPrefix).toBe('docs/')
		expect(result.current.indexFullReindex).toBe(false)

		rerender({ apiToken: 'token-b' })

		await waitFor(() => {
			expect(result.current.indexPrefix).toBe('')
			expect(result.current.indexFullReindex).toBe(true)
		})
	})
})
