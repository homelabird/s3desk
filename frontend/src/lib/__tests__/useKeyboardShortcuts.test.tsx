import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useKeyboardShortcuts } from '../useKeyboardShortcuts'

describe('useKeyboardShortcuts', () => {
	it('hides the shortcut guide when the scope changes and reopens against the visible state', () => {
		const navigate = vi.fn()
		const { result, rerender } = renderHook(
			({ scopeKey }: { scopeKey: string }) => useKeyboardShortcuts(navigate, scopeKey),
			{ initialProps: { scopeKey: 'token-a:profile-1' } },
		)

		act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
		})

		expect(result.current.guideOpen).toBe(true)

		rerender({ scopeKey: 'token-b:profile-1' })

		expect(result.current.guideOpen).toBe(false)

		act(() => {
			result.current.setGuideOpen((prev) => !prev)
		})

		expect(result.current.guideOpen).toBe(true)
	})
})
