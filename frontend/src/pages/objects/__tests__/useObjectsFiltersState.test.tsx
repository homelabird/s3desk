import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useObjectsFiltersState } from '../useObjectsFiltersState'

describe('useObjectsFiltersState', () => {
	afterEach(() => {
		window.localStorage.clear()
	})

	it('migrates legacy object filters into profile-scoped keys', async () => {
		window.localStorage.setItem('objectsTypeFilter', JSON.stringify('folders'))
		window.localStorage.setItem('objectsFavoritesOnly', JSON.stringify(true))
		window.localStorage.setItem('objectsFavoritesSearch', JSON.stringify('reports'))
		window.localStorage.setItem('objectsExtFilter', JSON.stringify('pdf'))
		window.localStorage.setItem('objectsMinSize', JSON.stringify(128))
		window.localStorage.setItem('objectsMaxModifiedMs', JSON.stringify(123456))

		const { result } = renderHook(() => useObjectsFiltersState('token-a', 'profile-1'))

		expect(result.current.typeFilter).toBe('folders')
		expect(result.current.favoritesOnly).toBe(true)
		expect(result.current.favoritesSearch).toBe('reports')
		expect(result.current.extFilter).toBe('pdf')
		expect(result.current.minSize).toBe(128)
		expect(result.current.maxModifiedMs).toBe(123456)

		await waitFor(() => {
			expect(window.localStorage.getItem('objects:token-a:profile-1:typeFilter')).toBe(JSON.stringify('folders'))
			expect(window.localStorage.getItem('objects:token-a:profile-1:favoritesOnly')).toBe(JSON.stringify(true))
			expect(window.localStorage.getItem('objects:token-a:profile-1:favoritesSearch')).toBe(JSON.stringify('reports'))
			expect(window.localStorage.getItem('objects:token-a:profile-1:extFilter')).toBe(JSON.stringify('pdf'))
			expect(window.localStorage.getItem('objects:token-a:profile-1:minSize')).toBe(JSON.stringify(128))
			expect(window.localStorage.getItem('objects:token-a:profile-1:maxModifiedMs')).toBe(JSON.stringify(123456))
		})

		expect(window.localStorage.getItem('objectsTypeFilter')).toBeNull()
		expect(window.localStorage.getItem('objectsFavoritesOnly')).toBeNull()
		expect(window.localStorage.getItem('objectsFavoritesSearch')).toBeNull()
		expect(window.localStorage.getItem('objectsExtFilter')).toBeNull()
		expect(window.localStorage.getItem('objectsMinSize')).toBeNull()
		expect(window.localStorage.getItem('objectsMaxModifiedMs')).toBeNull()
	})

	it('keeps filter state isolated per profile', () => {
		const { result, rerender } = renderHook(
			({ apiToken, profileId }: { apiToken: string; profileId: string | null }) => useObjectsFiltersState(apiToken, profileId),
			{ initialProps: { apiToken: 'token-a', profileId: 'profile-1' } },
		)

		act(() => {
			result.current.setTypeFilter('files')
			result.current.setFavoritesOnly(true)
			result.current.setFavoritesSearch('alpha')
			result.current.setExtFilter('txt')
			result.current.setMinSize(64)
			result.current.setMaxModifiedMs(1000)
		})

		rerender({ apiToken: 'token-a', profileId: 'profile-2' })

		expect(result.current.typeFilter).toBe('all')
		expect(result.current.favoritesOnly).toBe(false)
		expect(result.current.favoritesSearch).toBe('')
		expect(result.current.extFilter).toBe('')
		expect(result.current.minSize).toBeNull()
		expect(result.current.maxModifiedMs).toBeNull()

		act(() => {
			result.current.setTypeFilter('folders')
			result.current.setFavoritesSearch('beta')
		})

		rerender({ apiToken: 'token-a', profileId: 'profile-1' })

		expect(result.current.typeFilter).toBe('files')
		expect(result.current.favoritesOnly).toBe(true)
		expect(result.current.favoritesSearch).toBe('alpha')
		expect(result.current.extFilter).toBe('txt')
		expect(result.current.minSize).toBe(64)
		expect(result.current.maxModifiedMs).toBe(1000)
	})

	it('keeps filter state isolated per api token for the same profile', () => {
		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) => useObjectsFiltersState(apiToken, 'profile-1'),
			{ initialProps: { apiToken: 'token-a' } },
		)

		act(() => {
			result.current.setTypeFilter('files')
			result.current.setFavoritesOnly(true)
		})

		rerender({ apiToken: 'token-b' })

		expect(result.current.typeFilter).toBe('all')
		expect(result.current.favoritesOnly).toBe(false)

		act(() => {
			result.current.setTypeFilter('folders')
		})

		rerender({ apiToken: 'token-a' })

		expect(result.current.typeFilter).toBe('files')
		expect(result.current.favoritesOnly).toBe(true)
	})
})
