import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { profileScopedStorageKey } from '../../../lib/profileScopedStorage'
import { useUploadsPageScopedStorageState } from '../useUploadsPageScopedStorageState'

afterEach(() => {
	window.localStorage.clear()
})

describe('useUploadsPageScopedStorageState', () => {
	it('reads bucket and prefix from the active profile scope and switches on profile change', () => {
		window.localStorage.setItem(
			profileScopedStorageKey('uploads', 'token-a', 'profile-1', 'bucket'),
			JSON.stringify('alpha-bucket'),
		)
		window.localStorage.setItem(
			profileScopedStorageKey('uploads', 'token-a', 'profile-1', 'prefix'),
			JSON.stringify('alpha/'),
		)
		window.localStorage.setItem(
			profileScopedStorageKey('uploads', 'token-a', 'profile-2', 'bucket'),
			JSON.stringify('beta-bucket'),
		)
		window.localStorage.setItem(
			profileScopedStorageKey('uploads', 'token-a', 'profile-2', 'prefix'),
			JSON.stringify('beta/'),
		)

		const { result, rerender } = renderHook(
			(props: { apiToken: string; profileId: string | null }) =>
				useUploadsPageScopedStorageState({
					apiToken: props.apiToken,
					profileId: props.profileId,
				}),
			{
				initialProps: { apiToken: 'token-a', profileId: 'profile-1' },
			},
		)

		expect(result.current.bucket).toBe('alpha-bucket')
		expect(result.current.prefix).toBe('alpha/')

		rerender({ apiToken: 'token-a', profileId: 'profile-2' })

		expect(result.current.bucket).toBe('beta-bucket')
		expect(result.current.prefix).toBe('beta/')
	})
})
