import { Drawer } from 'antd'

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
		<Drawer
			open={props.open}
			onClose={props.onClose}
			title="Settings"
			placement="right"
			styles={{ wrapper: { width: 'min(90vw, 960px)' } }}
			destroyOnHidden
		>
			<SettingsPage
				apiToken={props.apiToken}
				setApiToken={props.setApiToken}
				profileId={props.profileId}
				setProfileId={props.setProfileId}
			/>
		</Drawer>
	)
}
