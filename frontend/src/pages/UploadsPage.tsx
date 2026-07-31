import { lazy, Suspense } from 'react'

import { ProfileRequiredCallout } from '../components/ProfileRequiredCallout'

const UploadsPageExperience = lazy(() =>
	import('./uploads/UploadsPageExperience').then((module) => ({
		default: module.UploadsPageExperience,
	})),
)

type Props = {
	apiToken: string
	profileId: string | null
}

export function UploadsPage(props: Props) {
	if (!props.profileId) {
		return <ProfileRequiredCallout apiToken={props.apiToken} profileId={props.profileId} message="Select a profile to upload files" />
	}

	return (
		<Suspense fallback={<UploadsPageLoadingFallback />}>
			<UploadsPageExperience apiToken={props.apiToken} profileId={props.profileId} />
		</Suspense>
	)
}

export function UploadsPageLoadingFallback() {
	return (
		<div role="status" aria-live="polite">
			Loading uploads...
		</div>
	)
}
