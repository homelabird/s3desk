import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { legacyTokenProfileScopedStorageKey, profileScopedStorageKey } from '../../../lib/profileScopedStorage'
import { useObjectsLocationPersistence } from '../useObjectsLocationPersistence'

describe('useObjectsLocationPersistence', () => {
	afterEach(() => {
		window.localStorage.clear()
	})

	it('migrates legacy raw-token profile-scoped location state into origin-scoped keys', async () => {
		window.localStorage.setItem(
			legacyTokenProfileScopedStorageKey('objects', 'token-a', 'profile-1', 'bucket'),
			JSON.stringify('legacy-bucket'),
		)
		window.localStorage.setItem(
			legacyTokenProfileScopedStorageKey('objects', 'token-a', 'profile-1', 'prefix'),
			JSON.stringify('legacy/prefix/'),
		)

		const { result } = renderHook(() =>
			useObjectsLocationPersistence({
				apiToken: 'token-a',
				profileId: 'profile-1',
			}),
		)

		expect(result.current.bucket).toBe('legacy-bucket')
		expect(result.current.prefix).toBe('legacy/prefix/')

		await waitFor(() => {
			expect(window.localStorage.getItem(profileScopedStorageKey('objects', 'token-a', 'profile-1', 'bucket'))).toBe(JSON.stringify('legacy-bucket'))
			expect(window.localStorage.getItem(profileScopedStorageKey('objects', 'token-a', 'profile-1', 'prefix'))).toBe(JSON.stringify('legacy/prefix/'))
		})
		expect(window.localStorage.getItem(legacyTokenProfileScopedStorageKey('objects', 'token-a', 'profile-1', 'bucket'))).toBeNull()
		expect(window.localStorage.getItem(legacyTokenProfileScopedStorageKey('objects', 'token-a', 'profile-1', 'prefix'))).toBeNull()
	})
})
