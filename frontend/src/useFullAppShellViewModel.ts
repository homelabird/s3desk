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
import type { APIClientShape } from './api/client'
import type { FullAppViewportState } from './useFullAppViewportState'
import type { MenuProps } from 'antd'

type UseFullAppShellViewModelArgs = {
	api: APIClientShape
	meta?: MetaResponse
	apiToken: string
	profileId: string | null
	profileName: string | null
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
	profileName,
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
			apiToken,
			profileId,
			setProfileId,
			shellScopeKey,
			selectedKey,
			navOpen,
			settingsOpen,
			openNav,
			closeNav,
			openSettings,
			logout,
			compactHeaderMenu,
		}),
		[
			apiToken,
			profileId,
			setProfileId,
			shellScopeKey,
			selectedKey,
			navOpen,
			settingsOpen,
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
			api,
			meta,
			close: closeSettings,
			apiToken,
			setApiToken,
			profileId,
			profileName,
		}),
		[
			settingsOpen,
			shellScopeKey,
			api,
			meta,
			closeSettings,
			apiToken,
			setApiToken,
			profileId,
			profileName,
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
