import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useFullAppShellState } from '../useFullAppShellState'

const args = {
	apiToken: 'test-token',
	pathname: '/objects',
	shellScopeKey: 'test-token:profile-a',
	clearProfileSelection: vi.fn(),
	setApiToken: vi.fn(),
	themeMode: 'light' as const,
	toggleThemeMode: vi.fn(),
}

function wrapper({ children }: { children: ReactNode }) {
	return <QueryClientProvider client={new QueryClient()}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>
}

beforeEach(() => window.localStorage.clear())
afterEach(() => { cleanup(); window.localStorage.clear() })

describe('sidebar preferences and mobile navigation', () => {
	it('defaults to expanded, toggles in both directions, and persists on remount', () => {
		const { result, unmount } = renderHook(() => useFullAppShellState(args), { wrapper })
		expect(result.current.sidebarCollapsed).toBe(false)
		act(() => result.current.toggleSidebar())
		expect(result.current.sidebarCollapsed).toBe(true)
		expect(window.localStorage.getItem('appSidebarCollapsed')).toBe('true')
		unmount()
		const remount = renderHook(() => useFullAppShellState(args), { wrapper })
		expect(remount.result.current.sidebarCollapsed).toBe(true)
		act(() => remount.result.current.toggleSidebar())
		expect(remount.result.current.sidebarCollapsed).toBe(false)
	})

	it.each(['"true"', '1', 'null', '{}', 'invalid-json'])('ignores an invalid saved preference %s', (raw) => {
		window.localStorage.setItem('appSidebarCollapsed', raw)
		const { result } = renderHook(() => useFullAppShellState(args), { wrapper })
		expect(result.current.sidebarCollapsed).toBe(false)
	})

	it('keeps mobile drawer state independent of the desktop preference', () => {
		const { result } = renderHook(() => useFullAppShellState(args), { wrapper })
		act(() => result.current.toggleSidebar())
		act(() => result.current.openNav())
		expect(result.current.sidebarCollapsed).toBe(true)
		expect(result.current.navOpen).toBe(true)
		act(() => result.current.closeNav())
		expect(result.current.navOpen).toBe(false)
		expect(result.current.sidebarCollapsed).toBe(true)
	})

	it('does not carry a mobile overlay into another profile scope', () => {
		const { result, rerender } = renderHook(({ scope }) => useFullAppShellState({ ...args, shellScopeKey: scope }), {
			wrapper, initialProps: { scope: args.shellScopeKey },
		})
		act(() => { result.current.toggleSidebar(); result.current.openNav() })
		rerender({ scope: 'test-token:profile-b' })
		expect(result.current.navOpen).toBe(false)
		expect(result.current.sidebarCollapsed).toBe(true)
	})
})
