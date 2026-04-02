import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useLocalStorageState } from '../useLocalStorageState'

describe('useLocalStorageState', () => {
	afterEach(() => {
		window.localStorage.clear()
	})

	it('falls back to the legacy localStorage key and migrates the value into the scoped key', async () => {
		window.localStorage.setItem('legacy-bucket', JSON.stringify('legacy-value'))

		const { result } = renderHook(() =>
			useLocalStorageState('uploads:profile-1:bucket', '', {
				legacyLocalStorageKey: 'legacy-bucket',
			}),
		)

		expect(result.current[0]).toBe('legacy-value')

		await waitFor(() => {
			expect(window.localStorage.getItem('uploads:profile-1:bucket')).toBe(JSON.stringify('legacy-value'))
		})
		expect(window.localStorage.getItem('legacy-bucket')).toBeNull()
	})

	it('falls back through multiple legacy localStorage keys and removes each legacy entry after migration', async () => {
		window.localStorage.setItem('legacy-bucket-2', JSON.stringify('second-legacy-value'))

		const { result } = renderHook(() =>
			useLocalStorageState('uploads:token-a:profile-1:bucket', '', {
				legacyLocalStorageKeys: ['legacy-bucket-1', 'legacy-bucket-2'],
			}),
		)

		expect(result.current[0]).toBe('second-legacy-value')

		await waitFor(() => {
			expect(window.localStorage.getItem('uploads:token-a:profile-1:bucket')).toBe(JSON.stringify('second-legacy-value'))
		})
		expect(window.localStorage.getItem('legacy-bucket-1')).toBeNull()
		expect(window.localStorage.getItem('legacy-bucket-2')).toBeNull()
	})

	it('sanitizes invalid values and reacts to same-tab custom local-storage events', async () => {
		window.localStorage.setItem('jobs:token-a:profile-1:bucket', JSON.stringify(''))

		const { result } = renderHook(() =>
			useLocalStorageState('jobs:token-a:profile-1:bucket', 'fallback-bucket', {
				sanitize: (value) => (value.trim() ? value : 'fallback-bucket'),
			}),
		)

		expect(result.current[0]).toBe('fallback-bucket')

		act(() => {
			window.dispatchEvent(
				new CustomEvent('local-storage', {
					detail: { key: 'jobs:token-a:profile-1:bucket', value: JSON.stringify('archive-bucket') },
				}),
			)
		})

		await waitFor(() => {
			expect(result.current[0]).toBe('archive-bucket')
		})
	})
})
