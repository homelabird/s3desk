import { theme as antdTheme, type ThemeConfig } from 'antd'

import type { ThemeMode } from './themeModeContext'

export function getAppTheme(mode: ThemeMode): ThemeConfig {
	const isDark = mode === 'dark'
	const primary = isDark ? '#1765cc' : '#0b57d0'

	return {
		algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
		token: {
			colorPrimary: primary,
			colorInfo: isDark ? '#7cb8ff' : '#0b57d0',
			colorLink: isDark ? '#9ac9ff' : '#0b57d0',
			colorSuccess: isDark ? '#79d6a2' : '#2f9e44',
			colorWarning: isDark ? '#e7be67' : '#f59f00',
			colorError: isDark ? '#ef8c86' : '#d93025',
			colorText: isDark ? '#e7edf5' : '#111827',
			colorTextSecondary: isDark ? '#b6c3d1' : '#475569',
			colorTextTertiary: isDark ? 'rgba(231, 237, 245, 0.74)' : 'rgba(15, 23, 42, 0.68)',
			colorTextQuaternary: isDark ? 'rgba(231, 237, 245, 0.64)' : 'rgba(15, 23, 42, 0.58)',
			colorBgLayout: isDark ? '#080d14' : '#eef3f8',
			colorBgContainer: isDark ? '#101923' : '#ffffff',
			colorBgElevated: isDark ? '#111827' : '#ffffff',
			colorFillSecondary: isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(15, 23, 42, 0.06)',
			colorFillTertiary: isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(15, 23, 42, 0.04)',
			colorFillQuaternary: isDark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(15, 23, 42, 0.03)',
			colorPrimaryBg: isDark ? 'rgba(124, 184, 255, 0.16)' : '#dbeafe',
			colorPrimaryBgHover: isDark ? 'rgba(124, 184, 255, 0.22)' : '#c7ddff',
			colorPrimaryBorder: isDark ? 'rgba(124, 184, 255, 0.36)' : '#93b4e8',
			colorBorder: isDark ? 'rgba(148, 163, 184, 0.28)' : '#cbd5e1',
			colorBorderSecondary: isDark ? 'rgba(148, 163, 184, 0.18)' : '#d8e0ea',
			colorSplit: isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.14)',
			controlItemBgHover: isDark ? 'rgba(124, 184, 255, 0.1)' : 'rgba(11, 87, 208, 0.08)',
			controlItemBgActive: isDark ? 'rgba(124, 184, 255, 0.18)' : 'rgba(11, 87, 208, 0.12)',
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
