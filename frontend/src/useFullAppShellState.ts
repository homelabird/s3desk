import { LogoutOutlined, MoonOutlined, SettingOutlined, SunOutlined } from '@ant-design/icons'
import { useQueryClient } from '@tanstack/react-query'
import type { MenuProps } from 'antd'
import { createElement, useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import { confirmDangerAction } from './lib/confirmDangerAction'
import type { ThemeMode } from './themeModeContext'

type ScopedOverlayState = {
	open: boolean
	scopeKey: string | null
}

type UseFullAppShellStateArgs = {
	apiToken: string
	pathname: string
	shellScopeKey: string
	clearProfileSelection: () => void
	setApiToken: (token: string) => void
	themeMode: ThemeMode
	toggleThemeMode: () => void
}

function getSelectedNavKey(pathname: string): string {
	if (pathname.startsWith('/profiles')) return '/profiles'
	if (pathname.startsWith('/buckets')) return '/buckets'
	if (pathname.startsWith('/objects')) return '/objects'
	if (pathname.startsWith('/uploads')) return '/uploads'
	if (pathname.startsWith('/jobs')) return '/jobs'
	return '/profiles'
}

export function useFullAppShellState({
	apiToken,
	pathname,
	shellScopeKey,
	clearProfileSelection,
	setApiToken,
	themeMode,
	toggleThemeMode,
}: UseFullAppShellStateArgs) {
	const queryClient = useQueryClient()
	const [searchParams, setSearchParams] = useSearchParams()
	const [navState, setNavState] = useState<ScopedOverlayState>({
		open: false,
		scopeKey: null,
	})
	const [settingsState, setSettingsState] = useState<ScopedOverlayState>({
		open: false,
		scopeKey: null,
	})

	const selectedKey = useMemo(() => getSelectedNavKey(pathname), [pathname])
	const navOpen = navState.open && navState.scopeKey === shellScopeKey
	const settingsOpen =
		searchParams.has('settings') &&
		(settingsState.scopeKey === null ||
			(settingsState.open && settingsState.scopeKey === shellScopeKey))

	const openNav = useCallback(() => {
		setNavState({ open: true, scopeKey: shellScopeKey })
	}, [shellScopeKey])

	const closeNav = useCallback(() => {
		setNavState({ open: false, scopeKey: null })
	}, [])

	const openSettings = useCallback(() => {
		setSettingsState({ open: true, scopeKey: shellScopeKey })
		const next = new URLSearchParams(searchParams)
		next.set('settings', '1')
		setSearchParams(next, { replace: false })
	}, [searchParams, setSearchParams, shellScopeKey])

	const closeSettings = useCallback(() => {
		setSettingsState({ open: false, scopeKey: null })
		if (!searchParams.has('settings')) return
		const next = new URLSearchParams(searchParams)
		next.delete('settings')
		setSearchParams(next, { replace: true })
	}, [searchParams, setSearchParams])

	const performLogout = useCallback(() => {
		queryClient.clear()
		setApiToken('')
		clearProfileSelection()
	}, [clearProfileSelection, queryClient, setApiToken])

	const logout = useCallback(() => {
		confirmDangerAction({
			title: 'Log out of this session?',
			description: 'This clears the API token and active profile from this browser session. Saved profiles and objects are not deleted.',
			confirmText: 'LOGOUT',
			confirmHint: 'Type "LOGOUT" to confirm',
			okText: 'Logout',
			preferenceKey: 'confirm:session-logout',
			scopeApiToken: apiToken,
			onConfirm: performLogout,
		})
	}, [apiToken, performLogout])

	const compactHeaderMenu: MenuProps = useMemo(
		() => ({
			items: [
				{ key: 'settings', icon: createElement(SettingOutlined), label: 'Settings' },
				{
					key: 'theme',
					icon: createElement(themeMode === 'dark' ? SunOutlined : MoonOutlined),
					label: themeMode === 'dark' ? 'Light mode' : 'Dark mode',
				},
				...(apiToken
					? [
							{ type: 'divider' as const },
							{
								key: 'logout',
								icon: createElement(LogoutOutlined),
								label: 'Logout',
								danger: true,
							},
						]
					: []),
			],
			onClick: ({ key }) => {
				if (key === 'settings') {
					openSettings()
					return
				}
				if (key === 'theme') {
					toggleThemeMode()
					return
				}
				if (key === 'logout') logout()
			},
		}),
		[apiToken, logout, openSettings, themeMode, toggleThemeMode],
	)

	return {
		selectedKey,
		navOpen,
		settingsOpen,
		openNav,
		closeNav,
		openSettings,
		closeSettings,
		logout,
		compactHeaderMenu,
	}
}
