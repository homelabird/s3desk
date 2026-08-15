import { BucketsPageRouteShell } from './buckets/BucketsPageRouteShell'
import { useBucketsPageState } from './buckets/useBucketsPageState'

type Props = {
	apiToken: string
	profileId: string | null
}

export function BucketsPage(props: Props) {
	const state = useBucketsPageState(props)

	return <BucketsPageRouteShell apiToken={props.apiToken} profileId={props.profileId} shell={state.shell} />
}
