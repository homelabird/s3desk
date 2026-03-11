import { theme as antdTheme, type ThemeConfig } from 'antd'

import type { ThemeMode } from './themeModeContext'

export function getAppTheme(mode: ThemeMode): ThemeConfig {
	const isDark = mode === 'dark'

	return {
		algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
		token: {
			colorPrimary: isDark ? '#7cb8ff' : '#1a73e8',
			colorInfo: isDark ? '#7cb8ff' : '#1a73e8',
			colorLink: isDark ? '#9ac9ff' : '#1a73e8',
			colorSuccess: isDark ? '#79d6a2' : '#2f9e44',
			colorWarning: isDark ? '#e7be67' : '#f59f00',
			colorError: isDark ? '#ef8c86' : '#d93025',
			colorText: isDark ? '#e7edf5' : '#202124',
			colorTextSecondary: isDark ? '#9aa7b5' : '#5f6368',
			colorBorder: isDark ? 'rgba(148, 163, 184, 0.16)' : '#d9dee7',
			colorBorderSecondary: isDark ? 'rgba(148, 163, 184, 0.1)' : '#e7ebf2',
			borderRadius: 12,
			borderRadiusLG: 20,
			controlHeight: 40,
			controlHeightSM: 32,
			controlHeightLG: 46,
			fontSize: 14,
			fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
		},
	}
}
