import { describe, expect, it } from 'vitest'

import { isEditingKeyboardTarget, shouldIgnoreGlobalKeyboardShortcut } from '../keyboardShortcuts'

describe('keyboardShortcuts', () => {
	it('treats editable targets as global-shortcut exclusions', () => {
		const input = document.createElement('input')
		const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })
		Object.defineProperty(event, 'target', { value: input })

		expect(isEditingKeyboardTarget(input)).toBe(true)
		expect(shouldIgnoreGlobalKeyboardShortcut(event)).toBe(true)
	})

	it('allows global shortcuts from non-editable targets', () => {
		const button = document.createElement('button')
		const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })
		Object.defineProperty(event, 'target', { value: button })

		expect(isEditingKeyboardTarget(button)).toBe(false)
		expect(shouldIgnoreGlobalKeyboardShortcut(event)).toBe(false)
	})
})
