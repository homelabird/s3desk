import type { ObjectsPageOverlaysProps } from './ObjectsPageOverlays'
import type { BuildObjectsPageOverlaysPropsArgs } from './buildObjectsPageOverlaysProps'

type SearchOverlayProps = Pick<
	ObjectsPageOverlaysProps,
	'filtersDrawerProps' | 'globalSearchDrawerProps'
>

export function buildObjectsSearchOverlayProps(args: BuildObjectsPageOverlaysPropsArgs): SearchOverlayProps {
	return {
		filtersDrawerProps: args.filtersDrawerOpen
			? {
				open: args.filtersDrawerOpen,
				onClose: () => args.setFiltersDrawerOpen(false),
				isAdvanced: args.isAdvanced,
				typeFilter: args.typeFilter,
				onTypeFilterChange: args.setTypeFilter,
				favoritesOnly: args.favoritesOnly,
				onFavoritesOnlyChange: args.setFavoritesOnly,
				favoritesFirst: args.favoritesFirst,
				onFavoritesFirstChange: args.setFavoritesFirst,
				extFilter: args.extFilter,
				extOptions: args.extOptions,
				onExtFilterChange: args.setExtFilter,
				minSizeBytes: args.minSize,
				maxSizeBytes: args.maxSize,
				onMinSizeBytesChange: args.setMinSize,
				onMaxSizeBytesChange: args.setMaxSize,
				modifiedAfterMs: args.minModifiedMs,
				modifiedBeforeMs: args.maxModifiedMs,
				onModifiedRangeChange: (startMs, endMs) => {
					args.setMinModifiedMs(startMs)
					args.setMaxModifiedMs(endMs)
				},
				sort: args.sort,
				onSortChange: args.setSort,
				onResetView: args.resetFilters,
				hasActiveView: args.hasActiveView,
			}
			: null,
		globalSearchDrawerProps: args.globalSearchOpen
			? {
				scopeKey: `${args.apiToken || '__no_server__'}:${args.profileId?.trim() || '__no_profile__'}:${args.bucket || '__no_bucket__'}`,
				open: args.globalSearchOpen,
				onClose: args.closeGlobalSearch,
				hasProfile: !!args.profileId,
				hasBucket: !!args.bucket,
				bucket: args.bucket,
				currentPrefix: args.prefix,
				isMd: args.isMd,
				queryDraft: args.globalSearchDraft,
				onQueryDraftChange: args.setGlobalSearchDraft,
				prefixFilter: args.globalSearchPrefix,
				onPrefixFilterChange: args.setGlobalSearchPrefix,
				limit: args.globalSearchLimitClamped,
				onLimitChange: args.setGlobalSearchLimit,
				extFilter: args.globalSearchExt,
				onExtFilterChange: args.setGlobalSearchExt,
				minSizeBytes: args.globalSearchMinSize,
				maxSizeBytes: args.globalSearchMaxSize,
				onMinSizeBytesChange: args.setGlobalSearchMinSize,
				onMaxSizeBytesChange: args.setGlobalSearchMaxSize,
				modifiedAfterMs: args.globalSearchMinModifiedMs,
				modifiedBeforeMs: args.globalSearchMaxModifiedMs,
				onModifiedRangeChange: (startMs, endMs) => {
					args.setGlobalSearchMinModifiedMs(startMs)
					args.setGlobalSearchMaxModifiedMs(endMs)
				},
				onReset: args.resetGlobalSearch,
				onRefresh: () => args.indexedSearchQuery.refetch(),
				isRefreshing: args.indexedSearchQuery.isFetching,
				isError: args.indexedSearchQuery.isError,
				isNotIndexed: args.indexedSearchNotIndexed,
				errorMessage: args.indexedSearchErrorMessage,
				onCreateIndexJob: () =>
					args.indexObjectsJobMutation.mutate({ prefix: args.indexPrefix, fullReindex: args.indexFullReindex }),
				isCreatingIndexJob: args.indexObjectsJobMutation.isPending,
				indexPrefix: args.indexPrefix,
				onIndexPrefixChange: args.setIndexPrefix,
				indexFullReindex: args.indexFullReindex,
				onIndexFullReindexChange: args.setIndexFullReindex,
				searchQueryText: args.globalSearchQueryText,
				isFetching: args.indexedSearchQuery.isFetching,
				hasNextPage: args.indexedSearchQuery.hasNextPage,
				isFetchingNextPage: args.indexedSearchQuery.isFetchingNextPage,
				items: args.indexedSearchItems,
				onLoadMore: () => args.indexedSearchQuery.fetchNextPage(),
				onUseCurrentPrefix: () => args.setIndexPrefix(args.prefix),
				onOpenPrefixForKey: args.openGlobalSearchPrefix,
				onCopyKey: args.onCopy,
				onDownloadKey: args.onDownload,
				onOpenDetails: args.openGlobalSearchDetails,
			}
			: null,
	}
}
