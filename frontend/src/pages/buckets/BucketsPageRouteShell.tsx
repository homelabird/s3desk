import { ProfileRequiredCallout } from '../../components/ProfileRequiredCallout'
import { BucketsPageShell } from './BucketsPageShell'
import type { BucketsPageRouteShellProps } from './bucketsPagePresentationTypes'

export function BucketsPageRouteShell(props: BucketsPageRouteShellProps) {
	if (!props.profileId) {
		return (
			<ProfileRequiredCallout
				apiToken={props.apiToken}
				profileId={props.profileId}
				message="Select a profile to view buckets"
			/>
		)
	}

	return <BucketsPageShell {...props.shell} apiToken={props.apiToken} profileId={props.profileId} />
}
