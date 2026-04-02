import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useObjectsCommandPaletteOverlayState } from '../useObjectsCommandPaletteOverlayState'

const items = [
	{
		id: 'rename',
		label: 'Rename object',
		run: vi.fn(),
		enabled: true,
	},
]

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
})
