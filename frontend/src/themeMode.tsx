import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'

import { useLocalStorageState } from './lib/useLocalStorageState'

export type ThemeMode = 'light' | 'dark'

type ThemeModeContextValue = {
	mode: ThemeMode
	setMode: (next: ThemeMode) => void
	toggleMode: () => void
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null)

function getInitialThemeMode(): ThemeMode {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

type ThemeModeProviderProps = {
	children: ReactNode
}

export function ThemeModeProvider(props: ThemeModeProviderProps) {
	const [mode, setMode] = useLocalStorageState<ThemeMode>('themeMode', getInitialThemeMode())

	useEffect(() => {
		document.documentElement.dataset.theme = mode
		document.documentElement.style.colorScheme = mode
		document.body.dataset.theme = mode
	}, [mode])

	const toggleMode = useCallback(() => {
		setMode((prev) => (prev === 'dark' ? 'light' : 'dark'))
	}, [setMode])

	const value = useMemo<ThemeModeContextValue>(
		() => ({
			mode,
			setMode,
			toggleMode,
		}),
		[mode, setMode, toggleMode],
	)

	return <ThemeModeContext.Provider value={value}>{props.children}</ThemeModeContext.Provider>
}

export function useThemeMode(): ThemeModeContextValue {
	const ctx = useContext(ThemeModeContext)
	if (!ctx) {
		throw new Error('useThemeMode must be used within ThemeModeProvider')
	}
	return ctx
}
