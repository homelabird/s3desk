import { afterEach, describe, expect, it } from 'vitest'

import {
	buildDialogPreferenceKey,
	clearDismissedDialogs,
	countDismissedDialogs,
	isDialogDismissed,
	setDialogDismissed,
} from '../dialogPreferences'

describe('dialogPreferences', () => {
	afterEach(() => {
		window.localStorage.clear()
		window.sessionStorage.clear()
	})

	it('keeps dismissed dialog preferences isolated per api token scope', () => {
		const key = buildDialogPreferenceKey('confirm', 'delete_bucket|DELETE')

		setDialogDismissed(key, true, 'token-a')

		expect(isDialogDismissed(key, 'token-a')).toBe(true)
		expect(isDialogDismissed(key, 'token-b')).toBe(false)
		expect(countDismissedDialogs('token-a')).toBe(1)
		expect(countDismissedDialogs('token-b')).toBe(0)

		setDialogDismissed(key, true, 'token-b')
		clearDismissedDialogs('token-a')

		expect(isDialogDismissed(key, 'token-a')).toBe(false)
		expect(isDialogDismissed(key, 'token-b')).toBe(true)
		expect(countDismissedDialogs('token-a')).toBe(0)
		expect(countDismissedDialogs('token-b')).toBe(1)
	})

	it('treats legacy global dialog preferences as dismissed and migrates them into the current api token scope', () => {
		const key = buildDialogPreferenceKey('warning', 'bucket_not_empty')
		window.localStorage.setItem(
			'dismissedDialogPreferences',
			JSON.stringify({
				[key]: { dismissedAt: '2026-03-29T00:00:00.000Z' },
			}),
		)

		expect(isDialogDismissed(key, 'token-a')).toBe(true)
		expect(countDismissedDialogs('token-a')).toBe(1)

		setDialogDismissed(key, true, 'token-a')

		const stored = JSON.parse(window.localStorage.getItem('dismissedDialogPreferences') ?? '{}') as Record<string, unknown>
		expect(stored[key]).toBeUndefined()
		expect(stored['dialogPreference:token-a:warning:bucket_not_empty']).toBeTruthy()

		clearDismissedDialogs('token-a')
		expect(window.localStorage.getItem('dismissedDialogPreferences')).toBeNull()
	})
})
