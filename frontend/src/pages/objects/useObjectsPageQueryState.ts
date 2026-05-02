import type { useObjectsLocationState } from './useObjectsLocationState'
import type { useObjectsPageEnvironment } from './useObjectsPageEnvironment'
import { useObjectsPageLocationSync } from './useObjectsPageLocationSync'
import { useObjectsPageQueries } from './useObjectsPageQueries'
import type { useObjectsPageViewState } from './useObjectsPageViewState'

type UseObjectsPageQueryStateArgs = {
	apiToken: string
	profileId: string | null
	environment: Pick<
		ReturnType<typeof useObjectsPageEnvironment>,
		'api' | 'debugObjectsList'
	>
	location: Pick<
		ReturnType<typeof useObjectsLocationState>,
		'bucket' | 'prefix' | 'clearInvalidLocation' | 'navigateToLocation'
	>
	view: Pick<
		ReturnType<typeof useObjectsPageViewState>,
		'favoritesPaneExpanded' | 'favoritesOnly'
	>
}

export function useObjectsPageQueryState(args: UseObjectsPageQueryStateArgs) {
	const queriesState = useObjectsPageQueries({
		api: args.environment.api,
		apiToken: args.apiToken,
		profileId: args.profileId,
		bucket: args.location.bucket,
		prefix: args.location.prefix,
		debugObjectsList: args.environment.debugObjectsList,
		favoritesPaneExpanded: args.view.favoritesPaneExpanded,
		favoritesOnly: args.view.favoritesOnly,
	})

	useObjectsPageLocationSync({
		profileId: args.profileId,
		location: args.location,
		queries: queriesState,
	})

	return queriesState
}
