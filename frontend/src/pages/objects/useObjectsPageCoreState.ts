import { useObjectsLocationState } from './useObjectsLocationState'
import { useObjectsPageEnvironment } from './useObjectsPageEnvironment'
import { useObjectsPageQueryState } from './useObjectsPageQueryState'
import { useObjectsPageTreeState } from './useObjectsPageTreeState'
import { useObjectsPageViewControls } from './useObjectsPageViewControls'

type UseObjectsPageCoreStateArgs = {
	apiToken: string
	profileId: string | null
}

export function useObjectsPageCoreState(args: UseObjectsPageCoreStateArgs) {
	const environment = useObjectsPageEnvironment(args)
	const locationState = useObjectsLocationState({
		apiToken: args.apiToken,
		profileId: args.profileId,
	})

	const treeState = useObjectsPageTreeState({
		apiToken: args.apiToken,
		profileId: args.profileId,
		environment,
		location: locationState,
	})

	const viewState = useObjectsPageViewControls({
		apiToken: args.apiToken,
		profileId: args.profileId,
		environment,
		location: locationState,
		tree: treeState,
	})

	const queriesState = useObjectsPageQueryState({
		apiToken: args.apiToken,
		profileId: args.profileId,
		environment,
		location: locationState,
		view: viewState,
	})

	return {
		environment,
		location: locationState,
		tree: treeState,
		view: viewState,
		queries: queriesState,
	}
}
