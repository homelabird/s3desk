import { useContext } from 'react'

import { ThemeModeContext, type ThemeModeContextValue } from './themeModeContext'

export function useThemeMode(): ThemeModeContextValue {
	const ctx = useContext(ThemeModeContext)
	if (!ctx) {
		throw new Error('useThemeMode must be used within ThemeModeProvider')
	}
	return ctx
}
