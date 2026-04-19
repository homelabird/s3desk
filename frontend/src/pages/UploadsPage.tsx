import { UploadsPageRouteShell } from './uploads/UploadsPageRouteShell'
import { UploadsPageShell } from './uploads/UploadsPageShell'
import { useUploadsPageCompositionState } from './uploads/useUploadsPageCompositionState'

type Props = {
	apiToken: string
	profileId: string | null
}

export function UploadsPage(props: Props) {
	const composition = useUploadsPageCompositionState(props)

	return (
		<UploadsPageRouteShell apiToken={composition.route.apiToken} profileId={composition.route.profileId}>
			<UploadsPageShell presentation={composition.presentation} />
		</UploadsPageRouteShell>
	)
}
