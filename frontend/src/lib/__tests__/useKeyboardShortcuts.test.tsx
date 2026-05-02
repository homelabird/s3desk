import { act, render, renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useOverlayLayer } from '../../components/useOverlayLayer'
import { useKeyboardShortcuts } from '../useKeyboardShortcuts'

function RegisteredOverlay() {
	const ref = useRef<HTMLDivElement>(null)
	useOverlayLayer({
		open: true,
		onEscape: vi.fn(),
		containerRef: ref,
	})
	return <div ref={ref} />
}

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

	it('does not open the shortcut guide over an existing overlay layer', () => {
		const overlay = render(<RegisteredOverlay />)
		const navigate = vi.fn()
		const { result } = renderHook(() => useKeyboardShortcuts(navigate, 'token-a:profile-1'))

		act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
		})

		expect(result.current.guideOpen).toBe(false)

		overlay.unmount()

		act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
		})

		expect(result.current.guideOpen).toBe(true)
	})
})
