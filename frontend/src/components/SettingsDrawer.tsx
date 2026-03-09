import { OverlaySheet } from './OverlaySheet'
import { SettingsPage } from '../pages/SettingsPage'

type Props = {
	open: boolean
	onClose: () => void
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
			width="min(90vw, 960px)"
		>
			<SettingsPage
				apiToken={props.apiToken}
				setApiToken={props.setApiToken}
				profileId={props.profileId}
				setProfileId={props.setProfileId}
			/>
		</OverlaySheet>
	)
}
