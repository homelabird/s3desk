import { useCallback, useEffect, useMemo, type ReactNode } from 'react'

import { useLocalStorageState } from './lib/useLocalStorageState'
import { ThemeModeContext, type ThemeMode, type ThemeModeContextValue } from './themeModeContext'

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
