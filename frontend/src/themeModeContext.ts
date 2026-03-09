import { createContext } from 'react'

export type ThemeMode = 'light' | 'dark'

export type ThemeModeContextValue = {
	mode: ThemeMode
	setMode: (next: ThemeMode) => void
	toggleMode: () => void
}

export const ThemeModeContext = createContext<ThemeModeContextValue | null>(null)
