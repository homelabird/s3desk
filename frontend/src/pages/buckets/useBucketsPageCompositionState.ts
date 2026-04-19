import { buildBucketsPageShellProps } from './buildBucketsPageShellProps'
import { useBucketsPageState } from './useBucketsPageState'

type UseBucketsPageCompositionStateArgs = {
	apiToken: string
	profileId: string | null
}

export function useBucketsPageCompositionState(props: UseBucketsPageCompositionStateArgs) {
	const state = useBucketsPageState(props)

	return buildBucketsPageShellProps({
		apiToken: props.apiToken,
		profileId: props.profileId,
		state,
	})
}
