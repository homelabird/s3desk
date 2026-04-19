import { BucketsPageRouteShell } from './buckets/BucketsPageRouteShell'
import { useBucketsPageCompositionState } from './buckets/useBucketsPageCompositionState'

type Props = {
	apiToken: string
	profileId: string | null
}

export function BucketsPage(props: Props) {
	const composition = useBucketsPageCompositionState(props)

	return <BucketsPageRouteShell {...composition} />
}
