import { Suspense, lazy } from 'react'

import type { APIClientShape } from './api/client'
import type { MetaResponse } from './api/types'

const SettingsDrawer = lazy(async () => {
	const m = await import('./components/SettingsDrawer')
	return { default: m.SettingsDrawer }
})

const KeyboardShortcutGuide = lazy(async () => {
	const m = await import('./components/KeyboardShortcutGuide')
	return { default: m.KeyboardShortcutGuide }
})

export type FullAppOverlaysHostSettings = {
	open: boolean
	shellScopeKey: string
	api: APIClientShape
	meta?: MetaResponse
	close: () => void
	apiToken: string
	setApiToken: (token: string) => void
	profileId: string | null
	setProfileId: (profileId: string | null) => void
}

export type FullAppOverlaysHostGuide = {
	open: boolean
	close: () => void
}

export type FullAppOverlaysHostProps = {
	settings: FullAppOverlaysHostSettings
	guide: FullAppOverlaysHostGuide
}

export function FullAppOverlaysHost({
	settings,
	guide,
}: FullAppOverlaysHostProps) {
	return (
		<>
			{settings.open ? (
				<Suspense fallback={null}>
					<SettingsDrawer
						key={`settings:${settings.shellScopeKey}`}
						open={true}
						onClose={settings.close}
						api={settings.api}
						meta={settings.meta}
						shellScopeKey={settings.shellScopeKey}
						apiToken={settings.apiToken}
						setApiToken={settings.setApiToken}
						profileId={settings.profileId}
						setProfileId={settings.setProfileId}
					/>
				</Suspense>
			) : null}
			{guide.open ? (
				<Suspense fallback={null}>
					<KeyboardShortcutGuide open={true} onClose={guide.close} />
				</Suspense>
			) : null}
		</>
	)
}
