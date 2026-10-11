import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { useSessionStorageState } from '../useSessionStorageState'

describe('useSessionStorageState', () => {
	afterEach(() => {
		window.sessionStorage.clear()
		window.localStorage.clear()
	})

	it('reads the current persisted value when returning to a previously selected key', () => {
		window.sessionStorage.setItem('scope-a', JSON.stringify('original'))
		window.sessionStorage.setItem('scope-b', JSON.stringify('other'))
		const { result, rerender } = renderHook(({ storageKey }) => useSessionStorageState(storageKey, ''), {
			initialProps: { storageKey: 'scope-a' },
			wrapper: StrictMode,
		})

		rerender({ storageKey: 'scope-b' })
		window.sessionStorage.setItem('scope-a', JSON.stringify('updated elsewhere'))
		rerender({ storageKey: 'scope-a' })

		expect(result.current[0]).toBe('updated elsewhere')
		expect(window.sessionStorage.getItem('scope-a')).toBe(JSON.stringify('updated elsewhere'))
		act(() => result.current[1]((previous) => `${previous}!`))
		expect(result.current[0]).toBe('updated elsewhere!')
	})

	it('resets state when another same-tab document clears sessionStorage', () => {
		window.sessionStorage.setItem('shared-key', JSON.stringify('saved'))
		const { result } = renderHook(() => useSessionStorageState('shared-key', 'default'))
		act(() => {
			window.sessionStorage.clear()
			window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: window.sessionStorage }))
		})
		expect(result.current[0]).toBe('default')
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
