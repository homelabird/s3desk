import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useSessionStorageState } from '../useSessionStorageState'

describe('useSessionStorageState', () => {
	afterEach(() => {
		window.sessionStorage.clear()
		window.localStorage.clear()
	})

	it('falls back to the legacy localStorage key and migrates the value into sessionStorage', async () => {
		window.localStorage.setItem('legacy-api-token', JSON.stringify('legacy-token'))

		const { result } = renderHook(() =>
			useSessionStorageState('apiToken', '', {
				legacyLocalStorageKey: 'legacy-api-token',
			}),
		)

		expect(result.current[0]).toBe('legacy-token')

		await waitFor(() => {
			expect(window.sessionStorage.getItem('apiToken')).toBe(JSON.stringify('legacy-token'))
		})
		expect(window.localStorage.getItem('legacy-api-token')).toBeNull()
	})

	it('prefers sessionStorage over the legacy localStorage value and keeps updates in sessionStorage', async () => {
		window.sessionStorage.setItem('apiToken', JSON.stringify('session-token'))
		window.localStorage.setItem('legacy-api-token', JSON.stringify('legacy-token'))

		const { result } = renderHook(() =>
			useSessionStorageState('apiToken', '', {
				legacyLocalStorageKey: 'legacy-api-token',
			}),
		)

		expect(result.current[0]).toBe('session-token')

		act(() => {
			result.current[1]('next-token')
		})

		await waitFor(() => {
			expect(window.sessionStorage.getItem('apiToken')).toBe(JSON.stringify('next-token'))
		})
		expect(window.localStorage.getItem('legacy-api-token')).toBeNull()
	})

	it('sanitizes invalid values and reacts to same-tab custom session-storage events', async () => {
		window.sessionStorage.setItem('retryCount', JSON.stringify(-4))

		const { result } = renderHook(() =>
			useSessionStorageState('retryCount', 2, {
				sanitize: (value) => (value >= 0 ? value : 2),
			}),
		)

		expect(result.current[0]).toBe(2)

		act(() => {
			window.dispatchEvent(
				new CustomEvent('session-storage', {
					detail: { key: 'retryCount', value: JSON.stringify(6) },
				}),
			)
		})

		await waitFor(() => {
			expect(result.current[0]).toBe(6)
		})
	})
})
