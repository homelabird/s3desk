import { ProfilesPageShell } from './profiles/ProfilesPageShell'
import { useProfilesPageState } from './profiles/useProfilesPageState'

type Props = {
	apiToken: string
	profileId: string | null
	setProfileId: (v: string | null) => void
}

export function ProfilesPage(props: Props) {
	const shell = useProfilesPageState({
		apiToken: props.apiToken,
		profileId: props.profileId,
		setProfileId: props.setProfileId,
	})
	return <ProfilesPageShell {...shell} />
}
