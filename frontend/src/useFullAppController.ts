import type { Dispatch, ReactNode, SetStateAction } from 'react'

import type { APIClient } from './api/client'
import type { FullAppOverlaysHostProps } from './FullAppOverlaysHost'
import type {
	FullAppShellChromeProps,
	FullAppShellChromeTheme,
} from './FullAppShellChrome'
import { useFullAppProfileState } from './useFullAppProfileState'
import { useFullAppShellState } from './useFullAppShellState'
import { useFullAppShellViewModel } from './useFullAppShellViewModel'
import type { FullAppViewportState } from './useFullAppViewportState'

export type FullAppBootstrapState = {
	metaPending: boolean
	metaError: unknown
	onRetry: () => void
	apiToken: string
	setApiToken: Dispatch<SetStateAction<string>>
	profileGate: ReactNode
	profilesPending: boolean
}

export type FullAppTransfersState = {
	providerKey: string
	apiToken: string
	uploadDirectStream: boolean
	uploadCapabilityByProfileId: Record<
		string,
		{ presignedUpload: boolean; directUpload: boolean }
	>
}

export type FullAppRoutesState = {
	apiToken: string
	profileId: string | null
	setProfileId: (profileId: string | null) => void
	shellScopeKey: string
	routeLocationKey: string
}

type UseFullAppControllerArgs = {
	api: APIClient
	apiToken: string
	setApiToken: Dispatch<SetStateAction<string>>
	pathname: string
	routeLocationKey: string
	theme: FullAppShellChromeTheme
	viewport: FullAppViewportState
}

export function useFullAppController({
	api,
	apiToken,
	setApiToken,
	pathname,
	routeLocationKey,
	theme,
	viewport,
}: UseFullAppControllerArgs) {
	const {
		metaQuery,
		profilesQuery,
		safeProfileId,
		setProfileId,
		profileGate,
		uploadCapabilityByProfileId,
		uploadDirectStream,
		shellScopeKey,
	} = useFullAppProfileState({
		api,
		apiToken,
		pathname,
	})

	const {
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
	} = useFullAppShellState({
		apiToken,
		pathname,
		shellScopeKey,
		clearProfileSelection: () => setProfileId(null),
		setApiToken,
	})

	const shellViewModel = useFullAppShellViewModel({
		api,
		meta: metaQuery.data,
		apiToken,
		profileId: safeProfileId,
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
	})

	const bootstrap: FullAppBootstrapState = {
		metaPending: metaQuery.isPending,
		metaError: metaQuery.isError ? metaQuery.error : null,
		onRetry: () => void metaQuery.refetch(),
		apiToken,
		setApiToken,
		profileGate,
		profilesPending: profilesQuery.isPending,
	}

	const transfers: FullAppTransfersState = {
		providerKey: `transfers:${apiToken || 'none'}`,
		apiToken,
		uploadDirectStream,
		uploadCapabilityByProfileId,
	}

	const routes: FullAppRoutesState = {
		apiToken,
		profileId: safeProfileId,
		setProfileId,
		shellScopeKey,
		routeLocationKey,
	}

	return {
		bootstrap,
		transfers,
		chrome: shellViewModel.chrome satisfies Pick<
			FullAppShellChromeProps,
			'session' | 'theme' | 'viewport'
		>,
		overlays: shellViewModel.overlays satisfies FullAppOverlaysHostProps,
		routes,
	}
}
