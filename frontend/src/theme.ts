import { theme as antdTheme, type ThemeConfig } from 'antd'

import type { ThemeMode } from './themeMode'

export function getAppTheme(mode: ThemeMode): ThemeConfig {
	const isDark = mode === 'dark'

	return {
		algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
		token: {
			colorPrimary: isDark ? '#6ba8ff' : '#1a73e8',
			colorInfo: isDark ? '#6ba8ff' : '#1a73e8',
			colorLink: isDark ? '#8abaff' : '#1a73e8',
			colorSuccess: isDark ? '#7adf8d' : '#2f9e44',
			colorWarning: isDark ? '#f7c55a' : '#f59f00',
			colorError: isDark ? '#ff8a80' : '#d93025',
			colorText: isDark ? '#e5eef9' : '#202124',
			colorTextSecondary: isDark ? '#9db0c5' : '#5f6368',
			colorBorder: isDark ? 'rgba(148, 163, 184, 0.2)' : '#d9dee7',
			colorBorderSecondary: isDark ? 'rgba(148, 163, 184, 0.14)' : '#e7ebf2',
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
