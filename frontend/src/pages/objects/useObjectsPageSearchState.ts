import type { APIClientShape } from '../../api/client'
import type { useObjectsLocationState } from './useObjectsLocationState'
import type { useObjectsPageQueries } from './useObjectsPageQueries'
import { useObjectsPageSearchData } from './useObjectsPageSearchData'
import type { useObjectsPageViewState } from './useObjectsPageViewState'
import type { useObjectsSelection } from './useObjectsSelection'

type UseObjectsPageSearchStateArgs = {
	api: APIClientShape
	apiToken: string
	profileId: string | null
	location: Pick<ReturnType<typeof useObjectsLocationState>, 'bucket' | 'prefix'>
	view: Pick<
		ReturnType<typeof useObjectsPageViewState>,
		| 'deferredGlobalSearch'
		| 'deferredSearch'
		| 'extFilter'
		| 'favoritesFirst'
		| 'favoritesOnly'
		| 'globalSearchExt'
		| 'globalSearchLimit'
		| 'globalSearchMaxModifiedMs'
		| 'globalSearchMaxSize'
		| 'globalSearchMinModifiedMs'
		| 'globalSearchMinSize'
		| 'globalSearchOpen'
		| 'globalSearchPrefix'
		| 'maxModifiedMs'
		| 'maxSize'
		| 'minModifiedMs'
		| 'minSize'
		| 'sort'
		| 'typeFilter'
	>
	queries: Pick<
		ReturnType<typeof useObjectsPageQueries>,
		'favoriteItems' | 'favoriteKeys' | 'objectsQuery'
	>
	selection: Pick<ReturnType<typeof useObjectsSelection>, 'selectedKeys'>
}

export function useObjectsPageSearchState(args: UseObjectsPageSearchStateArgs) {
	return useObjectsPageSearchData({
		api: args.api,
		apiToken: args.apiToken,
		profileId: args.profileId,
		bucket: args.location.bucket,
		prefix: args.location.prefix,
		globalSearchOpen: args.view.globalSearchOpen,
		deferredGlobalSearch: args.view.deferredGlobalSearch,
		globalSearchPrefix: args.view.globalSearchPrefix,
		globalSearchLimit: args.view.globalSearchLimit,
		globalSearchExt: args.view.globalSearchExt,
		globalSearchMinSize: args.view.globalSearchMinSize,
		globalSearchMaxSize: args.view.globalSearchMaxSize,
		globalSearchMinModifiedMs: args.view.globalSearchMinModifiedMs,
		globalSearchMaxModifiedMs: args.view.globalSearchMaxModifiedMs,
		deferredSearch: args.view.deferredSearch,
		objectsPages: args.queries.objectsQuery.data?.pages ?? [],
		favoriteItems: args.queries.favoriteItems,
		favoritesOnly: args.view.favoritesOnly,
		favoriteKeys: args.queries.favoriteKeys,
		extFilter: args.view.extFilter,
		minSize: args.view.minSize,
		maxSize: args.view.maxSize,
		minModifiedMs: args.view.minModifiedMs,
		maxModifiedMs: args.view.maxModifiedMs,
		typeFilter: args.view.typeFilter,
		sort: args.view.sort,
		favoritesFirst: args.view.favoritesFirst,
		selectedKeys: args.selection.selectedKeys,
	})
}
