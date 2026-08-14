import { act, fireEvent, render, screen } from '@testing-library/react'
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
		delete document.documentElement.dataset.themeChanging
		document.documentElement.style.colorScheme = ''
		document.body.dataset.theme = ''
		vi.restoreAllMocks()
	})

	it('uses the preferred color scheme initially and updates document theme state when toggled', () => {
		const animationFrames: FrameRequestCallback[] = []
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			animationFrames.push(callback)
			return animationFrames.length
		})
		vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
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
		expect(document.documentElement.dataset.themeChanging).toBe('true')

		act(() => animationFrames.shift()?.(0))
		expect(document.documentElement.dataset.themeChanging).toBe('true')
		act(() => animationFrames.shift()?.(16))
		expect(document.documentElement.dataset.themeChanging).toBeUndefined()

		fireEvent.click(screen.getByRole('button', { name: 'dark' }))

		expect(screen.getByRole('button', { name: 'light' })).toBeInTheDocument()
		expect(window.localStorage.getItem('themeMode')).toBe(JSON.stringify('light'))
		expect(document.documentElement.dataset.theme).toBe('light')
		expect(document.documentElement.style.colorScheme).toBe('light')
		expect(document.body.dataset.theme).toBe('light')
		expect(document.documentElement.dataset.themeChanging).toBe('true')
	})
})
