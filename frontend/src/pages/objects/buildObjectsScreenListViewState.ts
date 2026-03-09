import { normalizePrefix, parentPrefixFromKey } from './objectsListUtils'
import type { ObjectSort } from './objectsTypes'
import type { ObjectsScreenArgs } from './objectsScreenTypes'

type SortColumn = 'name' | 'size' | 'time'
type SortDirection = 'asc' | 'desc' | null

function getSortDirForColumn(sort: ObjectSort, col: SortColumn): SortDirection {
	if (col === 'name') {
		if (sort === 'name_asc') return 'asc'
		if (sort === 'name_desc') return 'desc'
		return null
	}
	if (col === 'size') {
		if (sort === 'size_asc') return 'asc'
		if (sort === 'size_desc') return 'desc'
		return null
	}
	if (sort === 'time_asc') return 'asc'
	if (sort === 'time_desc') return 'desc'
	return null
}

export function buildObjectsScreenListViewState(args: ObjectsScreenArgs) {
	const { props, data, actions } = args
	const {
		bucket,
		clearSearch,
		extFilter,
		favoritesFirst,
		favoritesOnly,
		isOffline,
		maxModifiedMs,
		maxSize,
		minModifiedMs,
		minSize,
		navigateToLocation,
		objectsQuery,
		prefix,
		search,
		searchDraft,
		sort,
		typeFilter,
	} = data

	const hasActiveFilters =
		typeFilter !== 'all' ||
		favoritesOnly ||
		!!extFilter.trim() ||
		minSize != null ||
		maxSize != null ||
		minModifiedMs != null ||
		maxModifiedMs != null
	const hasNonDefaultSort = sort !== 'name_asc' || favoritesFirst
	const hasActiveView = hasActiveFilters || hasNonDefaultSort

	const resetFilters = () => {
		data.setTypeFilter('all')
		data.setFavoritesOnly(false)
		data.setFavoritesFirst(false)
		data.setExtFilter('')
		data.setMinSize(null)
		data.setMaxSize(null)
		data.setMinModifiedMs(null)
		data.setMaxModifiedMs(null)
		data.setSort('name_asc')
	}

	const handleClearSearch = clearSearch
	const canClearSearch = !!search.trim() || !!searchDraft.trim()
	const listIsFetching = favoritesOnly ? data.favoritesQuery.isFetching : objectsQuery.isFetching
	const listIsFetchingNextPage = favoritesOnly ? false : objectsQuery.isFetchingNextPage
	const loadMoreDisabled = listIsFetching || listIsFetchingNextPage
	const canInteract = !!props.profileId && !!bucket && !isOffline

	const openGlobalSearchPrefix = (key: string) => {
		data.closeGlobalSearch()
		if (!bucket) return
		navigateToLocation(bucket, parentPrefixFromKey(key), { recordHistory: true })
	}

	const openGlobalSearchDetails = (key: string) => {
		data.closeGlobalSearch()
		actions.openDetailsForKey(key)
	}

	const sortDirForColumn = (col: SortColumn): SortDirection => getSortDirForColumn(sort, col)

	const toggleSortColumn = (col: SortColumn) => {
		if (col === 'name') {
			data.setSort(sort === 'name_asc' ? 'name_desc' : 'name_asc')
			return
		}
		if (col === 'size') {
			data.setSort(sort === 'size_asc' ? 'size_desc' : 'size_asc')
			return
		}
		data.setSort(sort === 'time_asc' ? 'time_desc' : 'time_asc')
	}

	return {
		canClearSearch,
		canInteract,
		handleClearSearch,
		hasActiveView,
		listIsFetching,
		listIsFetchingNextPage,
		loadMoreDisabled,
		openGlobalSearchDetails,
		openGlobalSearchPrefix,
		resetFilters,
		sortDirForColumn,
		toggleSortColumn,
		uploadDropLabel: bucket ? `s3://${bucket}/${normalizePrefix(prefix)}` : '-',
	}
}

export type ObjectsScreenListViewState = ReturnType<typeof buildObjectsScreenListViewState>
