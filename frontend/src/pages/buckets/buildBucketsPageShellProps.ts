import type { BucketsPageRouteShellProps } from './bucketsPagePresentationTypes'
import type { BucketsPageState } from './useBucketsPageState'

type BucketsPageShellPropsArgs = {
	apiToken: string
	profileId: string | null
	state: BucketsPageState
}

export function buildBucketsPageShellProps({
	apiToken,
	profileId,
	state,
}: BucketsPageShellPropsArgs): BucketsPageRouteShellProps {
	return {
		apiToken,
		profileId,
		shell: state.shell,
	}
}
