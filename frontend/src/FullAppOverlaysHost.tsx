import { Space, Spin, Typography } from 'antd'
import { Suspense, lazy } from 'react'

import type { APIClientShape } from './api/client'
import type { MetaResponse } from './api/types'
import { APP_SETTINGS_DRAWER_ID } from './appShellIds'
import { OverlaySheet } from './components/OverlaySheet'

const SettingsDrawer = lazy(async () => {
	const m = await import('./components/SettingsDrawer')
	return { default: m.SettingsDrawer }
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
	profileName: string | null
}

export type FullAppOverlaysHostProps = {
	settings: FullAppOverlaysHostSettings
}

function SettingsDrawerFallback(props: { onClose: () => void }) {
	return (
		<OverlaySheet
			open
			onClose={props.onClose}
			title="Settings"
			placement="right"
			width="min(100vw, 960px)"
			sheetId={APP_SETTINGS_DRAWER_ID}
		>
			<Space role="status" aria-live="polite" aria-label="Loading settings">
				<Spin size="small" />
				<Typography.Text type="secondary">Loading settings…</Typography.Text>
			</Space>
		</OverlaySheet>
	)
}

export function FullAppOverlaysHost({
	settings,
}: FullAppOverlaysHostProps) {
	return (
		<>
			{settings.open ? (
				<Suspense fallback={<SettingsDrawerFallback onClose={settings.close} />}>
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
						profileName={settings.profileName}
					/>
				</Suspense>
			) : null}
		</>
	)
}
