import { ProfilesPageShell } from './profiles/ProfilesPageShell'
import { useProfilesPageCompositionState } from './profiles/useProfilesPageCompositionState'

type Props = {
	apiToken: string
	profileId: string | null
	setProfileId: (v: string | null) => void
}

export function ProfilesPage(props: Props) {
	const composition = useProfilesPageCompositionState({
		apiToken: props.apiToken,
		profileId: props.profileId,
		setProfileId: props.setProfileId,
	})
	return <ProfilesPageShell {...composition.shell} />
}
