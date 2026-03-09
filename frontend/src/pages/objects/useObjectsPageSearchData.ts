import { useObjectsIndexedSearchQuery } from './useObjectsIndexedSearchQuery'
import { useObjectsListDerivedState } from './useObjectsListDerivedState'

type UseObjectsPageSearchDataArgs = {
	api: Parameters<typeof useObjectsIndexedSearchQuery>[0]['api']
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
	globalSearchOpen: boolean
	deferredGlobalSearch: string
	globalSearchPrefix: string
	globalSearchLimit: number
	globalSearchExt: string
	globalSearchMinSize: number | null
	globalSearchMaxSize: number | null
	globalSearchMinModifiedMs: number | null
	globalSearchMaxModifiedMs: number | null
	deferredSearch: string
	objectsPages: Parameters<typeof useObjectsListDerivedState>[0]['objectsPages']
	favoriteItems: Parameters<typeof useObjectsListDerivedState>[0]['favoriteItems']
	favoritesOnly: boolean
	favoriteKeys: Set<string>
	extFilter: string
	minSize: number | null
	maxSize: number | null
	minModifiedMs: number | null
	maxModifiedMs: number | null
	typeFilter: Parameters<typeof useObjectsListDerivedState>[0]['typeFilter']
	sort: Parameters<typeof useObjectsListDerivedState>[0]['sort']
	favoritesFirst: boolean
	selectedKeys: Set<string>
}

export function useObjectsPageSearchData(args: UseObjectsPageSearchDataArgs) {
	const indexedSearch = useObjectsIndexedSearchQuery({
		api: args.api,
		apiToken: args.apiToken,
		profileId: args.profileId,
		bucket: args.bucket,
		globalSearchOpen: args.globalSearchOpen,
		deferredGlobalSearch: args.deferredGlobalSearch,
		globalSearchPrefix: args.globalSearchPrefix,
		globalSearchLimit: args.globalSearchLimit,
		globalSearchExt: args.globalSearchExt,
		globalSearchMinSize: args.globalSearchMinSize,
		globalSearchMaxSize: args.globalSearchMaxSize,
		globalSearchMinModifiedMs: args.globalSearchMinModifiedMs,
		globalSearchMaxModifiedMs: args.globalSearchMaxModifiedMs,
	})

	const listState = useObjectsListDerivedState({
		deferredSearch: args.deferredSearch,
		objectsPages: args.objectsPages,
		favoriteItems: args.favoriteItems,
		favoritesOnly: args.favoritesOnly,
		favoriteKeys: args.favoriteKeys,
		prefix: args.prefix,
		extFilter: args.extFilter,
		minSize: args.minSize,
		maxSize: args.maxSize,
		minModifiedMs: args.minModifiedMs,
		maxModifiedMs: args.maxModifiedMs,
		typeFilter: args.typeFilter,
		sort: args.sort,
		favoritesFirst: args.favoritesFirst,
		selectedKeys: args.selectedKeys,
	})

	return {
		...indexedSearch,
		...listState,
	}
}
