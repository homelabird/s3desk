import { normalizePrefix, parentPrefixFromKey } from './objectsListUtils'
import type { ObjectSort } from './objectsTypes'
import type {
	ObjectsListVm,
	ObjectsLocationVm,
	ObjectsOperationVm,
	ObjectsPaneVm,
	ObjectsScreenArgs,
} from './objectsScreenTypes'

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

type BuildObjectsScreenListViewStateArgs = Pick<ObjectsScreenArgs, 'props' | 'actions'> & {
	locationVm: ObjectsLocationVm
	listVm: ObjectsListVm
	operationVm: ObjectsOperationVm
	paneVm: ObjectsPaneVm
}

export function buildObjectsScreenListViewState(args: BuildObjectsScreenListViewStateArgs) {
	const { props, locationVm, listVm, operationVm, paneVm, actions } = args
	const {
		bucket,
		navigateToLocation,
		prefix,
	} = locationVm
	const {
		clearSearch,
		extFilter,
		favoritesFirst,
		favoritesOnly,
		maxModifiedMs,
		maxSize,
		minModifiedMs,
		minSize,
		objectsQuery,
		search,
		searchDraft,
		sort,
		typeFilter,
	} = listVm

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
		listVm.setTypeFilter('all')
		listVm.setFavoritesOnly(false)
		listVm.setFavoritesFirst(false)
		listVm.setExtFilter('')
		listVm.setMinSize(null)
		listVm.setMaxSize(null)
		listVm.setMinModifiedMs(null)
		listVm.setMaxModifiedMs(null)
		listVm.setSort('name_asc')
	}

	const handleClearSearch = clearSearch
	const canClearSearch = !!search.trim() || !!searchDraft.trim()
	const listIsFetching = favoritesOnly ? listVm.favoritesQuery.isFetching : objectsQuery.isFetching
	const listIsFetchingNextPage = favoritesOnly ? false : objectsQuery.isFetchingNextPage
	const loadMoreDisabled = listIsFetching || listIsFetchingNextPage
	const canInteract = !!props.profileId && !!bucket && !operationVm.isOffline

	const openGlobalSearchPrefix = (key: string) => {
		paneVm.closeGlobalSearch()
		if (!bucket) return
		navigateToLocation(bucket, parentPrefixFromKey(key), { recordHistory: true })
	}

	const openGlobalSearchDetails = (key: string) => {
		paneVm.closeGlobalSearch()
		actions.openDetailsForKey(key)
	}

	const sortDirForColumn = (col: SortColumn): SortDirection => getSortDirForColumn(sort, col)

	const toggleSortColumn = (col: SortColumn) => {
		if (col === 'name') {
			listVm.setSort(sort === 'name_asc' ? 'name_desc' : 'name_asc')
			return
		}
		if (col === 'size') {
			listVm.setSort(sort === 'size_asc' ? 'size_desc' : 'size_asc')
			return
		}
		listVm.setSort(sort === 'time_asc' ? 'time_desc' : 'time_asc')
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
