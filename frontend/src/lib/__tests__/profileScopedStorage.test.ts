import { describe, expect, it, beforeEach } from 'vitest'

import {
	legacyServerScopedStorageKey,
	legacyProfileScopedStorageKeys,
	legacyTokenProfileScopedStorageKey,
	profileScopedStorageKey,
	profileScopedStorageKeyForOrigin,
	readLegacyActiveProfileIdForMigration,
	serverScopedStorageKey,
	serverScopedStorageKeyForOrigin,
} from '../profileScopedStorage'

describe('profile scoped storage keys', () => {
	beforeEach(() => {
		window.localStorage.clear()
		window.sessionStorage.clear()
	})

	it('does not include the raw API token in server or profile scoped keys', () => {
		const token = 'super-secret-api-token'

		const serverKey = serverScopedStorageKey('app', token, 'profileId')
		const profileKey = profileScopedStorageKey('jobs', token, 'profile-1', 'statusFilter')

		expect(serverKey).not.toContain(token)
		expect(profileKey).not.toContain(token)
		expect(serverKey).toContain('token_')
		expect(profileKey).toContain('token_')
	})

	it('keeps scopes stable per token while separating different tokens', () => {
		expect(serverScopedStorageKey('app', 'token-a', 'profileId')).toBe(
			serverScopedStorageKey('app', 'token-a', 'profileId'),
		)
		expect(serverScopedStorageKey('app', 'token-a', 'profileId')).not.toBe(
			serverScopedStorageKey('app', 'token-b', 'profileId'),
		)
	})

	it('builds explicit-origin keys for browser automation helpers', () => {
		const origin = 'http://127.0.0.1:18080'
		const serverKey = serverScopedStorageKeyForOrigin('app', origin, 'token-a', 'profileId')
		const profileKey = profileScopedStorageKeyForOrigin('jobs', origin, 'token-a', 'profile-1', 'statusFilter')

		expect(serverKey).toContain(`${origin}:token_`)
		expect(profileKey).toContain(`${origin}:token_`)
		expect(serverKey).not.toContain('token-a')
		expect(profileKey).not.toContain('token-a')
		expect(profileKey).toContain(':profile-1:statusFilter')
	})

	it('lists raw-token and profile-only legacy keys for profile-scoped migration', () => {
		expect(legacyTokenProfileScopedStorageKey('jobs', 'token-a', 'profile-1', 'statusFilter')).toBe(
			'jobs:token-a:profile-1:statusFilter',
		)
		expect(legacyProfileScopedStorageKeys('jobs', 'token-a', 'profile-1', 'statusFilter')).toEqual([
			'jobs:token-a:profile-1:statusFilter',
			'jobs:profile-1:statusFilter',
		])
	})

	it('can migrate active profile ids from legacy raw-token scoped keys', () => {
		window.localStorage.setItem(
			legacyServerScopedStorageKey('app', 'token-a', 'profileId'),
			JSON.stringify('profile-1'),
		)

		expect(readLegacyActiveProfileIdForMigration('token-a')).toBe('profile-1')
	})
})
