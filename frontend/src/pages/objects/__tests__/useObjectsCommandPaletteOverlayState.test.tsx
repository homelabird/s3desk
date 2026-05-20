import { act, render, renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useOverlayLayer } from '../../../components/useOverlayLayer'
import { useObjectsCommandPaletteOverlayState } from '../useObjectsCommandPaletteOverlayState'

const items = [
	{
		id: 'rename',
		label: 'Rename object',
		run: vi.fn(),
		enabled: true,
	},
]

function RegisteredOverlay() {
	const ref = useRef<HTMLDivElement>(null)
	useOverlayLayer({
		open: true,
		onEscape: vi.fn(),
		containerRef: ref,
	})
	return <div ref={ref} />
}

describe('useObjectsCommandPaletteOverlayState', () => {
	it('hides the command palette when the api token changes and reopens with a fresh query', () => {
		const { result, rerender } = renderHook(
			({ scopeKey }: { scopeKey: string }) => useObjectsCommandPaletteOverlayState({ scopeKey, items }),
			{ initialProps: { scopeKey: 'token-a:profile-1:bucket-a:docs/' } },
		)

		act(() => {
			result.current.openCommandPalette()
		})
		act(() => {
			result.current.onCommandPaletteQueryChange('rename')
		})

		expect(result.current.commandPaletteOpen).toBe(true)
		expect(result.current.commandPaletteQuery).toBe('rename')

		rerender({ scopeKey: 'token-b:profile-1:bucket-a:docs/' })

		expect(result.current.commandPaletteOpen).toBe(false)

		act(() => {
			result.current.openCommandPalette()
		})

		expect(result.current.commandPaletteOpen).toBe(true)
		expect(result.current.commandPaletteQuery).toBe('')
	})

	it('toggles against the current visible state after the scope changes', () => {
		const { result, rerender } = renderHook(
			({ scopeKey }: { scopeKey: string }) => useObjectsCommandPaletteOverlayState({ scopeKey, items }),
			{ initialProps: { scopeKey: 'token-a:profile-1:bucket-a:docs/' } },
		)

		act(() => {
			result.current.openCommandPalette()
		})

		rerender({ scopeKey: 'token-b:profile-1:bucket-a:docs/' })

		expect(result.current.commandPaletteOpen).toBe(false)

		act(() => {
			result.current.setCommandPaletteOpen((prev) => !prev)
		})

		expect(result.current.commandPaletteOpen).toBe(true)
	})

	it('does not open the command palette over an existing overlay layer', () => {
		const overlay = render(<RegisteredOverlay />)
		const { result } = renderHook(() =>
			useObjectsCommandPaletteOverlayState({ scopeKey: 'token-a:profile-1:bucket-a:docs/', items }),
		)

		act(() => {
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
		})

		expect(result.current.commandPaletteOpen).toBe(false)

		overlay.unmount()

		act(() => {
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
		})

		expect(result.current.commandPaletteOpen).toBe(true)
	})
})
