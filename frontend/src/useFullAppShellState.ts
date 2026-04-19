import { LogoutOutlined, SettingOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { createElement, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useKeyboardShortcuts } from './lib/useKeyboardShortcuts'

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
}: UseFullAppShellStateArgs) {
	const navigate = useNavigate()
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
	const { guideOpen, setGuideOpen } = useKeyboardShortcuts(
		(path) => navigate(path),
		shellScopeKey,
	)

	const openNav = () => {
		setNavState({ open: true, scopeKey: shellScopeKey })
	}

	const closeNav = () => {
		setNavState({ open: false, scopeKey: null })
	}

	const openSettings = () => {
		setSettingsState({ open: true, scopeKey: shellScopeKey })
		const next = new URLSearchParams(searchParams)
		next.set('settings', '1')
		setSearchParams(next, { replace: false })
	}

	const closeSettings = () => {
		setSettingsState({ open: false, scopeKey: null })
		if (!searchParams.has('settings')) return
		const next = new URLSearchParams(searchParams)
		next.delete('settings')
		setSearchParams(next, { replace: true })
	}

	const logout = () => {
		setApiToken('')
		clearProfileSelection()
	}

	const compactHeaderMenu: MenuProps = {
		items: [
			{ key: 'settings', icon: createElement(SettingOutlined), label: 'Settings' },
			...(apiToken
				? [
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
			if (key === 'logout') logout()
		},
	}

	return {
		selectedKey,
		navOpen,
		settingsOpen,
		guideOpen,
		setGuideOpen,
		openNav,
		closeNav,
		openSettings,
		closeSettings,
		logout,
		compactHeaderMenu,
	}
}
