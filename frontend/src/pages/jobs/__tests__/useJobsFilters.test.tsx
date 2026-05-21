import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { legacyTokenProfileScopedStorageKey, profileScopedStorageKey } from '../../../lib/profileScopedStorage'
import { useJobsFilters } from '../useJobsFilters'

describe('useJobsFilters', () => {
	afterEach(() => {
		window.localStorage.clear()
	})

	it('migrates legacy global filter keys into profile-scoped keys', async () => {
		window.localStorage.setItem('jobsStatusFilter', JSON.stringify('failed'))
		window.localStorage.setItem('jobsSearchFilter', JSON.stringify('invoice'))
		window.localStorage.setItem('jobsTypeFilter', JSON.stringify('s3_index_objects'))
		window.localStorage.setItem('jobsErrorCodeFilter', JSON.stringify('AccessDenied'))

		const { result } = renderHook(() => useJobsFilters('token-a', 'profile-1'))

		expect(result.current.statusFilter).toBe('failed')
		expect(result.current.searchFilter).toBe('invoice')
		expect(result.current.typeFilter).toBe('s3_index_objects')
		expect(result.current.errorCodeFilter).toBe('AccessDenied')

		await waitFor(() => {
			expect(window.localStorage.getItem(profileScopedStorageKey('jobs', 'token-a', 'profile-1', 'statusFilter'))).toBe(JSON.stringify('failed'))
			expect(window.localStorage.getItem(profileScopedStorageKey('jobs', 'token-a', 'profile-1', 'searchFilter'))).toBe(JSON.stringify('invoice'))
			expect(window.localStorage.getItem(profileScopedStorageKey('jobs', 'token-a', 'profile-1', 'typeFilter'))).toBe(JSON.stringify('s3_index_objects'))
			expect(window.localStorage.getItem(profileScopedStorageKey('jobs', 'token-a', 'profile-1', 'errorCodeFilter'))).toBe(JSON.stringify('AccessDenied'))
		})

		expect(window.localStorage.getItem('jobsStatusFilter')).toBeNull()
		expect(window.localStorage.getItem('jobsSearchFilter')).toBeNull()
		expect(window.localStorage.getItem('jobsTypeFilter')).toBeNull()
		expect(window.localStorage.getItem('jobsErrorCodeFilter')).toBeNull()
	})

	it('migrates legacy raw-token profile-scoped filter keys into origin-scoped keys', async () => {
		window.localStorage.setItem(
			legacyTokenProfileScopedStorageKey('jobs', 'token-a', 'profile-1', 'statusFilter'),
			JSON.stringify('failed'),
		)
		window.localStorage.setItem(
			legacyTokenProfileScopedStorageKey('jobs', 'token-a', 'profile-1', 'searchFilter'),
			JSON.stringify('invoice'),
		)

		const { result } = renderHook(() => useJobsFilters('token-a', 'profile-1'))

		expect(result.current.statusFilter).toBe('failed')
		expect(result.current.searchFilter).toBe('invoice')

		await waitFor(() => {
			expect(window.localStorage.getItem(profileScopedStorageKey('jobs', 'token-a', 'profile-1', 'statusFilter'))).toBe(JSON.stringify('failed'))
			expect(window.localStorage.getItem(profileScopedStorageKey('jobs', 'token-a', 'profile-1', 'searchFilter'))).toBe(JSON.stringify('invoice'))
		})
		expect(window.localStorage.getItem(legacyTokenProfileScopedStorageKey('jobs', 'token-a', 'profile-1', 'statusFilter'))).toBeNull()
		expect(window.localStorage.getItem(legacyTokenProfileScopedStorageKey('jobs', 'token-a', 'profile-1', 'searchFilter'))).toBeNull()
	})

	it('keeps filter state isolated per profile', async () => {
		const { result, rerender } = renderHook(
			({ apiToken, profileId }: { apiToken: string; profileId: string | null }) => useJobsFilters(apiToken, profileId),
			{ initialProps: { apiToken: 'token-a', profileId: 'profile-1' } },
		)

		act(() => {
			result.current.setStatusFilter('failed')
			result.current.setSearchFilter('alpha')
			result.current.setTypeFilter('transfer_sync_staging_to_s3')
			result.current.setErrorCodeFilter('SlowDown')
		})

		expect(result.current.statusFilter).toBe('failed')
		expect(result.current.searchFilter).toBe('alpha')

		rerender({ apiToken: 'token-a', profileId: 'profile-2' })

		expect(result.current.statusFilter).toBe('all')
		expect(result.current.searchFilter).toBe('')
		expect(result.current.typeFilter).toBe('')
		expect(result.current.errorCodeFilter).toBe('')

		act(() => {
			result.current.setStatusFilter('running')
			result.current.setSearchFilter('beta')
		})

		rerender({ apiToken: 'token-a', profileId: 'profile-1' })

		expect(result.current.statusFilter).toBe('failed')
		expect(result.current.searchFilter).toBe('alpha')
		expect(result.current.typeFilter).toBe('transfer_sync_staging_to_s3')
		expect(result.current.errorCodeFilter).toBe('SlowDown')
	})

	it('keeps filter state isolated per api token for the same profile', () => {
		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) => useJobsFilters(apiToken, 'profile-1'),
			{ initialProps: { apiToken: 'token-a' } },
		)

		act(() => {
			result.current.setStatusFilter('failed')
			result.current.setSearchFilter('alpha')
		})

		rerender({ apiToken: 'token-b' })

		expect(result.current.statusFilter).toBe('all')
		expect(result.current.searchFilter).toBe('')

		act(() => {
			result.current.setStatusFilter('running')
			result.current.setSearchFilter('beta')
		})

		rerender({ apiToken: 'token-a' })

		expect(result.current.statusFilter).toBe('failed')
		expect(result.current.searchFilter).toBe('alpha')
	})

	it('persists the virtual active status filter', () => {
		const { result } = renderHook(() => useJobsFilters('token-a', 'profile-1'))

		act(() => {
			result.current.setStatusFilter('active')
		})

		expect(result.current.statusFilter).toBe('active')
		expect(result.current.filtersDirty).toBe(true)
		expect(window.localStorage.getItem(profileScopedStorageKey('jobs', 'token-a', 'profile-1', 'statusFilter'))).toBe(JSON.stringify('active'))
	})
})
