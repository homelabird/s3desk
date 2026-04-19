import { SetupCallout } from '../../components/SetupCallout'
import { BucketsPageShell, type BucketsPageShellProps } from './BucketsPageShell'

export type BucketsPageRouteShellProps = {
	apiToken: string
	profileId: string | null
	shell: Omit<BucketsPageShellProps, 'apiToken' | 'profileId'>
}

export function BucketsPageRouteShell(props: BucketsPageRouteShellProps) {
	if (!props.profileId) {
		return (
			<SetupCallout
				apiToken={props.apiToken}
				profileId={props.profileId}
				message="Select a profile to view buckets"
			/>
		)
	}

	return <BucketsPageShell {...props.shell} apiToken={props.apiToken} profileId={props.profileId} />
}
