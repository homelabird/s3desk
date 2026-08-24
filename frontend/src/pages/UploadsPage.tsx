import { ProfileRequiredCallout } from '../components/ProfileRequiredCallout'
import { UploadsPageExperience } from './uploads/UploadsPageExperience'

type Props = {
	apiToken: string
	profileId: string | null
}

export function UploadsPage(props: Props) {
	if (!props.profileId) {
		return <ProfileRequiredCallout apiToken={props.apiToken} profileId={props.profileId} message="Select a profile to upload files" />
	}

	return <UploadsPageExperience apiToken={props.apiToken} profileId={props.profileId} />
}
