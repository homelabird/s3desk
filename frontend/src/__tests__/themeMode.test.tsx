import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useThemeMode } from '../useThemeMode'
import { ThemeModeProvider } from '../themeMode'

const originalMatchMedia = window.matchMedia

function ThemeProbe() {
	const { mode, toggleMode } = useThemeMode()
	return (
		<button type="button" onClick={toggleMode}>
			{mode}
		</button>
	)
}

describe('ThemeModeProvider', () => {
	afterEach(() => {
		window.matchMedia = originalMatchMedia
		window.localStorage.clear()
		document.documentElement.dataset.theme = ''
		document.documentElement.style.colorScheme = ''
		document.body.dataset.theme = ''
		vi.restoreAllMocks()
	})

	it('uses the preferred color scheme initially and updates document theme state when toggled', () => {
		window.matchMedia = vi.fn().mockImplementation((query: string): MediaQueryList => ({
			matches: query === '(prefers-color-scheme: dark)',
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}))

		render(
			<ThemeModeProvider>
				<ThemeProbe />
			</ThemeModeProvider>,
		)

		expect(screen.getByRole('button', { name: 'dark' })).toBeInTheDocument()
		expect(document.documentElement.dataset.theme).toBe('dark')
		expect(document.documentElement.style.colorScheme).toBe('dark')
		expect(document.body.dataset.theme).toBe('dark')

		fireEvent.click(screen.getByRole('button', { name: 'dark' }))

		expect(screen.getByRole('button', { name: 'light' })).toBeInTheDocument()
		expect(window.localStorage.getItem('themeMode')).toBe(JSON.stringify('light'))
		expect(document.documentElement.dataset.theme).toBe('light')
		expect(document.documentElement.style.colorScheme).toBe('light')
		expect(document.body.dataset.theme).toBe('light')
	})
})
