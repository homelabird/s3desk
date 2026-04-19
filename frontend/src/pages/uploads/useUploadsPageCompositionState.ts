import { buildUploadsPagePresentationProps, type UploadsPagePresentationProps } from './buildUploadsPagePresentationProps'
import { useUploadsPageState } from './useUploadsPageState'

type UseUploadsPageCompositionStateArgs = {
	apiToken: string
	profileId: string | null
}

export type UploadsPageCompositionState = {
	route: UseUploadsPageCompositionStateArgs
	presentation: UploadsPagePresentationProps
}

export function useUploadsPageCompositionState(
	props: UseUploadsPageCompositionStateArgs,
): UploadsPageCompositionState {
	const state = useUploadsPageState(props)

	return {
		route: {
			apiToken: props.apiToken,
			profileId: props.profileId,
		},
		presentation: buildUploadsPagePresentationProps(state),
	}
}
