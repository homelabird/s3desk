import { useLocalStorageState } from '../../lib/useLocalStorageState'
import {
	OBJECTS_AUTO_INDEX_DEFAULT_ENABLED,
	OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS,
} from '../../lib/objectIndexing'
import { THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES } from '../../lib/thumbnailCache'

import type { ObjectSort, ObjectTypeFilter } from './objectsTypes'

export type ObjectsFiltersState = {
	typeFilter: ObjectTypeFilter
	setTypeFilter: (next: ObjectTypeFilter) => void
	favoritesOnly: boolean
	setFavoritesOnly: (next: boolean) => void
	favoritesFirst: boolean
	setFavoritesFirst: (next: boolean) => void
	favoritesSearch: string
	setFavoritesSearch: (next: string) => void
	favoritesOpenDetails: boolean
	setFavoritesOpenDetails: (next: boolean) => void
	extFilter: string
	setExtFilter: (next: string) => void
	minSize: number | null
	setMinSize: (next: number | null) => void
	maxSize: number | null
	setMaxSize: (next: number | null) => void
	minModifiedMs: number | null
	setMinModifiedMs: (next: number | null) => void
	maxModifiedMs: number | null
	setMaxModifiedMs: (next: number | null) => void
	sort: ObjectSort
	setSort: (next: ObjectSort) => void
	showThumbnails: boolean
	thumbnailCacheSize: number
	autoIndexEnabled: boolean
	autoIndexTtlHours: number
}

export function useObjectsFiltersState(): ObjectsFiltersState {
	const [typeFilter, setTypeFilter] = useLocalStorageState<ObjectTypeFilter>('objectsTypeFilter', 'all')
	const [favoritesOnly, setFavoritesOnly] = useLocalStorageState<boolean>('objectsFavoritesOnly', false)
	const [favoritesFirst, setFavoritesFirst] = useLocalStorageState<boolean>('objectsFavoritesFirst', false)
	const [favoritesSearch, setFavoritesSearch] = useLocalStorageState<string>('objectsFavoritesSearch', '')
	const [favoritesOpenDetails, setFavoritesOpenDetails] = useLocalStorageState<boolean>('objectsFavoritesOpenDetails', false)
	const [extFilter, setExtFilter] = useLocalStorageState<string>('objectsExtFilter', '')
	const [minSize, setMinSize] = useLocalStorageState<number | null>('objectsMinSize', null)
	const [maxSize, setMaxSize] = useLocalStorageState<number | null>('objectsMaxSize', null)
	const [minModifiedMs, setMinModifiedMs] = useLocalStorageState<number | null>('objectsMinModifiedMs', null)
	const [maxModifiedMs, setMaxModifiedMs] = useLocalStorageState<number | null>('objectsMaxModifiedMs', null)
	const [sort, setSort] = useLocalStorageState<ObjectSort>('objectsSort', 'name_asc')
	const [showThumbnails] = useLocalStorageState<boolean>('objectsShowThumbnails', true)
	const [thumbnailCacheSize] = useLocalStorageState<number>('objectsThumbnailCacheSize', THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES)
	const [autoIndexEnabled] = useLocalStorageState<boolean>('objectsAutoIndexEnabled', OBJECTS_AUTO_INDEX_DEFAULT_ENABLED)
	const [autoIndexTtlHours] = useLocalStorageState<number>('objectsAutoIndexTtlHours', OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS)

	return {
		typeFilter,
		setTypeFilter,
		favoritesOnly,
		setFavoritesOnly,
		favoritesFirst,
		setFavoritesFirst,
		favoritesSearch,
		setFavoritesSearch,
		favoritesOpenDetails,
		setFavoritesOpenDetails,
		extFilter,
		setExtFilter,
		minSize,
		setMinSize,
		maxSize,
		setMaxSize,
		minModifiedMs,
		setMinModifiedMs,
		maxModifiedMs,
		setMaxModifiedMs,
		sort,
		setSort,
		showThumbnails,
		thumbnailCacheSize,
		autoIndexEnabled,
		autoIndexTtlHours,
	}
}

