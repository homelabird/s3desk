import { theme as antdTheme, type ThemeConfig } from 'antd'

import type { ThemeMode } from './themeModeContext'

export function getAppTheme(mode: ThemeMode): ThemeConfig {
	const isDark = mode === 'dark'
	const primary = isDark ? '#376f9f' : '#2f6fae'

	return {
		algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
		token: {
			colorPrimary: primary,
			colorInfo: isDark ? '#84add2' : '#285f96',
			colorInfoText: isDark ? '#84add2' : '#285f96',
			colorInfoBg: isDark ? 'rgba(132, 173, 210, 0.15)' : '#e8f0f6',
			colorInfoBorder: isDark ? 'rgba(132, 173, 210, 0.34)' : '#91afca',
			colorLink: isDark ? '#84add2' : '#2f6fae',
			colorSuccess: isDark ? '#7fbd9b' : '#287a4b',
			colorWarning: isDark ? '#d0ad69' : '#a66a18',
			colorError: isDark ? '#dc918d' : '#b94a43',
			colorText: isDark ? '#d7dce1' : '#20252b',
			colorTextSecondary: isDark ? '#aeb7c0' : '#505b66',
			colorTextTertiary: isDark ? 'rgba(215, 220, 225, 0.72)' : 'rgba(32, 37, 43, 0.7)',
			colorTextQuaternary: isDark ? 'rgba(215, 220, 225, 0.62)' : 'rgba(32, 37, 43, 0.6)',
			colorBgLayout: isDark ? '#15191e' : '#f1f3f4',
			colorBgContainer: isDark ? '#1c2228' : '#fbfcfc',
			colorBgElevated: isDark ? '#252c33' : '#fdfefe',
			colorFillSecondary: isDark ? 'rgba(170, 182, 194, 0.13)' : 'rgba(32, 37, 43, 0.06)',
			colorFillTertiary: isDark ? 'rgba(170, 182, 194, 0.09)' : 'rgba(32, 37, 43, 0.04)',
			colorFillQuaternary: isDark ? 'rgba(170, 182, 194, 0.07)' : 'rgba(32, 37, 43, 0.03)',
			colorPrimaryBg: isDark ? 'rgba(132, 173, 210, 0.15)' : '#e3edf6',
			colorPrimaryBgHover: isDark ? 'rgba(132, 173, 210, 0.21)' : '#d5e4f1',
			colorPrimaryBorder: isDark ? 'rgba(132, 173, 210, 0.38)' : '#91afca',
			colorBorder: isDark ? 'rgba(183, 194, 204, 0.28)' : '#c8ced3',
			colorBorderSecondary: isDark ? 'rgba(183, 194, 204, 0.2)' : '#d8dcdf',
			colorSplit: isDark ? 'rgba(183, 194, 204, 0.2)' : 'rgba(32, 37, 43, 0.13)',
			controlItemBgHover: isDark ? 'rgba(132, 173, 210, 0.11)' : 'rgba(47, 111, 174, 0.08)',
			controlItemBgActive: isDark ? 'rgba(132, 173, 210, 0.18)' : 'rgba(47, 111, 174, 0.12)',
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
