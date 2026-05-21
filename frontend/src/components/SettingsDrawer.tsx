import { OverlaySheet } from './OverlaySheet'
import { SettingsPage } from '../pages/SettingsPage'
import { APP_SETTINGS_DRAWER_ID } from '../appShellIds'
import type { APIClientShape } from '../api/client'
import type { MetaResponse } from '../api/types'

type Props = {
	open: boolean
	onClose: () => void
	api: APIClientShape
	meta?: MetaResponse
	shellScopeKey: string
	apiToken: string
	setApiToken: (v: string) => void
	profileId: string | null
	setProfileId: (v: string | null) => void
}

export function SettingsDrawer(props: Props) {
	return (
		<OverlaySheet
			open={props.open}
			onClose={props.onClose}
			title="Settings"
			placement="right"
			width="min(100vw, 960px)"
			sheetId={APP_SETTINGS_DRAWER_ID}
		>
			<SettingsPage
				api={props.api}
				meta={props.meta}
				shellScopeKey={props.shellScopeKey}
				apiToken={props.apiToken}
				setApiToken={props.setApiToken}
				profileId={props.profileId}
				setProfileId={props.setProfileId}
			/>
		</OverlaySheet>
	)
}
