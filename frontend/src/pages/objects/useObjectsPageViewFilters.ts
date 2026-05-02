import { useObjectsFiltersState } from './useObjectsFiltersState'
import { useObjectsGlobalSearchOverlayState } from './useObjectsGlobalSearchOverlayState'
import { useObjectsGlobalSearchState } from './useObjectsGlobalSearchState'
import { useObjectsSearchState } from './useObjectsSearchState'

type UseObjectsPageViewFiltersArgs = {
	apiToken: string
	profileId: string | null
	bucket: string
}

export function useObjectsPageViewFilters({
	apiToken,
	profileId,
	bucket,
}: UseObjectsPageViewFiltersArgs) {
	const searchState = useObjectsSearchState({ apiToken, profileId })
	const globalSearchState = useObjectsGlobalSearchState({ apiToken, profileId, bucket })
	const globalSearchOverlay = useObjectsGlobalSearchOverlayState({
		scopeKey: `${apiToken || '__no_server__'}:${profileId?.trim() || '__no_profile__'}:${bucket || '__no_bucket__'}`,
		globalSearch: globalSearchState.globalSearch,
		setGlobalSearch: globalSearchState.setGlobalSearch,
		globalSearchDraft: globalSearchState.globalSearchDraft,
		setGlobalSearchDraft: globalSearchState.setGlobalSearchDraft,
	})
	const filtersState = useObjectsFiltersState(apiToken, profileId)

	return {
		...searchState,
		...globalSearchState,
		...globalSearchOverlay,
		...filtersState,
	}
}
