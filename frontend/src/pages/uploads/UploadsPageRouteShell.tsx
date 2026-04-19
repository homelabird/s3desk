import type { ReactNode } from 'react'

import { SetupCallout } from '../../components/SetupCallout'

type Props = {
	apiToken: string
	profileId: string | null
	children: ReactNode
}

export function UploadsPageRouteShell(props: Props) {
	if (!props.profileId) {
		return <SetupCallout apiToken={props.apiToken} profileId={props.profileId} message="Select a profile to upload files" />
	}

	return <>{props.children}</>
}
