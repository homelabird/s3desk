import { useCallback, useMemo } from 'react'

import type {
	FullAppOverlaysHostGuide,
	FullAppOverlaysHostSettings,
} from './FullAppOverlaysHost'
import type {
	FullAppShellChromeSession,
	FullAppShellChromeTheme,
} from './FullAppShellChrome'
import type { MetaResponse } from './api/types'
import type { APIClient } from './api/client'
import type { FullAppViewportState } from './useFullAppViewportState'
import type { MenuProps } from 'antd'

type UseFullAppShellViewModelArgs = {
	api: APIClient
	meta?: MetaResponse
	apiToken: string
	profileId: string | null
	setProfileId: (profileId: string | null) => void
	shellScopeKey: string
	selectedKey: string
	navOpen: boolean
	openNav: () => void
	closeNav: () => void
	openSettings: () => void
	logout: () => void
	compactHeaderMenu: MenuProps
	settingsOpen: boolean
	closeSettings: () => void
	setApiToken: (token: string) => void
	guideOpen: boolean
	setGuideOpen: (open: boolean) => void
	theme: FullAppShellChromeTheme
	viewport: FullAppViewportState
}

export function useFullAppShellViewModel({
	api,
	meta,
	apiToken,
	profileId,
	setProfileId,
	shellScopeKey,
	selectedKey,
	navOpen,
	openNav,
	closeNav,
	openSettings,
	logout,
	compactHeaderMenu,
	settingsOpen,
	closeSettings,
	setApiToken,
	guideOpen,
	setGuideOpen,
	theme,
	viewport,
}: UseFullAppShellViewModelArgs) {
	const closeGuide = useCallback(() => {
		setGuideOpen(false)
	}, [setGuideOpen])

	const session = useMemo<FullAppShellChromeSession>(
		() => ({
			api,
			meta,
			apiToken,
			profileId,
			setProfileId,
			shellScopeKey,
			selectedKey,
			navOpen,
			openNav,
			closeNav,
			openSettings,
			logout,
			compactHeaderMenu,
		}),
		[
			api,
			meta,
			apiToken,
			profileId,
			setProfileId,
			shellScopeKey,
			selectedKey,
			navOpen,
			openNav,
			closeNav,
			openSettings,
			logout,
			compactHeaderMenu,
		],
	)

	const settings = useMemo<FullAppOverlaysHostSettings>(
		() => ({
			open: settingsOpen,
			shellScopeKey,
			close: closeSettings,
			apiToken,
			setApiToken,
			profileId,
			setProfileId,
		}),
		[
			settingsOpen,
			shellScopeKey,
			closeSettings,
			apiToken,
			setApiToken,
			profileId,
			setProfileId,
		],
	)

	const guide = useMemo<FullAppOverlaysHostGuide>(
		() => ({
			open: guideOpen,
			close: closeGuide,
		}),
		[guideOpen, closeGuide],
	)

	return {
		chrome: {
			session,
			theme,
			viewport,
		},
		overlays: {
			settings,
			guide,
		},
	}
}
