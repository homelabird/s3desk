import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { AuthProvider } from '../AuthProvider'
import { useAuth } from '../useAuth'
import { legacyTokenProfileScopedStorageKey, serverScopedStorageKey } from '../../lib/profileScopedStorage'

function wrapper(props: { children: ReactNode }) {
	return <AuthProvider>{props.children}</AuthProvider>
}

describe('AuthProvider', () => {
	afterEach(() => {
		window.sessionStorage.clear()
		window.localStorage.clear()
	})

	it('clears persisted account state when the session token changes', async () => {
		window.sessionStorage.setItem('apiToken', JSON.stringify('token-a'))
		const scopedKey = serverScopedStorageKey('app', 'token-a', 'profileId')
		const legacyScopedKey = legacyTokenProfileScopedStorageKey('objects', 'token-a', 'profile-1', 'bucket')
		window.localStorage.setItem(scopedKey, JSON.stringify('profile-1'))
		window.localStorage.setItem(legacyScopedKey, JSON.stringify('bucket-a'))
		window.localStorage.setItem('dismissedDialogPreferences', JSON.stringify({ secret: true }))

		const { result } = renderHook(() => useAuth(), { wrapper })

		act(() => {
			result.current.setApiToken('token-b')
		})

		await waitFor(() => expect(result.current.apiToken).toBe('token-b'))
		expect(window.localStorage.getItem(scopedKey)).toBeNull()
		expect(window.localStorage.getItem(legacyScopedKey)).toBeNull()
		expect(window.localStorage.getItem('dismissedDialogPreferences')).toBeNull()
		expect(Object.keys(window.localStorage).some((key) => key.includes('token-a'))).toBe(false)
	})
})
