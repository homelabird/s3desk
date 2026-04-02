import { legacyProfileScopedStorageKey, profileScopedStorageKey } from '../../lib/profileScopedStorage'
import { useLocalStorageState } from '../../lib/useLocalStorageState'
import {
	OBJECTS_AUTO_INDEX_DEFAULT_ENABLED,
	OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS,
} from '../../lib/objectIndexing'
import {
	OBJECTS_COST_MODE_DEFAULT,
	OBJECTS_COST_MODE_STORAGE_KEY,
	type ObjectsCostMode,
} from '../../lib/objectsCostMode'
import { THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES } from '../../lib/thumbnailCache'

import type { ObjectSort, ObjectTypeFilter, ObjectsViewMode } from './objectsTypes'

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
	favoritesPaneExpanded: boolean
	setFavoritesPaneExpanded: (next: boolean) => void
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
	viewMode: ObjectsViewMode
	setViewMode: (next: ObjectsViewMode) => void
	showThumbnails: boolean
	thumbnailCacheSize: number
	objectsCostMode: ObjectsCostMode
	autoIndexEnabled: boolean
	autoIndexTtlHours: number
}

export function useObjectsFiltersState(apiToken: string, profileId: string | null = null): ObjectsFiltersState {
	const [typeFilter, setTypeFilter] = useLocalStorageState<ObjectTypeFilter>(
		profileScopedStorageKey('objects', apiToken, profileId, 'typeFilter'),
		'all',
		{ legacyLocalStorageKey: 'objectsTypeFilter', legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'typeFilter')] },
	)
	const [favoritesOnly, setFavoritesOnly] = useLocalStorageState<boolean>(
		profileScopedStorageKey('objects', apiToken, profileId, 'favoritesOnly'),
		false,
		{ legacyLocalStorageKey: 'objectsFavoritesOnly', legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'favoritesOnly')] },
	)
	const [favoritesFirst, setFavoritesFirst] = useLocalStorageState<boolean>(
		profileScopedStorageKey('objects', apiToken, profileId, 'favoritesFirst'),
		false,
		{ legacyLocalStorageKey: 'objectsFavoritesFirst', legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'favoritesFirst')] },
	)
	const [favoritesSearch, setFavoritesSearch] = useLocalStorageState<string>(
		profileScopedStorageKey('objects', apiToken, profileId, 'favoritesSearch'),
		'',
		{ legacyLocalStorageKey: 'objectsFavoritesSearch', legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'favoritesSearch')] },
	)
	const [favoritesOpenDetails, setFavoritesOpenDetails] = useLocalStorageState<boolean>(
		profileScopedStorageKey('objects', apiToken, profileId, 'favoritesOpenDetails'),
		false,
		{ legacyLocalStorageKey: 'objectsFavoritesOpenDetails', legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'favoritesOpenDetails')] },
	)
	const [favoritesPaneExpanded, setFavoritesPaneExpanded] = useLocalStorageState<boolean>(
		profileScopedStorageKey('objects', apiToken, profileId, 'favoritesPaneExpanded'),
		false,
		{ legacyLocalStorageKey: 'objectsFavoritesPaneExpanded', legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'favoritesPaneExpanded')] },
	)
	const [extFilter, setExtFilter] = useLocalStorageState<string>(
		profileScopedStorageKey('objects', apiToken, profileId, 'extFilter'),
		'',
		{ legacyLocalStorageKey: 'objectsExtFilter', legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'extFilter')] },
	)
	const [minSize, setMinSize] = useLocalStorageState<number | null>(
		profileScopedStorageKey('objects', apiToken, profileId, 'minSize'),
		null,
		{ legacyLocalStorageKey: 'objectsMinSize', legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'minSize')] },
	)
	const [maxSize, setMaxSize] = useLocalStorageState<number | null>(
		profileScopedStorageKey('objects', apiToken, profileId, 'maxSize'),
		null,
		{ legacyLocalStorageKey: 'objectsMaxSize', legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'maxSize')] },
	)
	const [minModifiedMs, setMinModifiedMs] = useLocalStorageState<number | null>(
		profileScopedStorageKey('objects', apiToken, profileId, 'minModifiedMs'),
		null,
		{ legacyLocalStorageKey: 'objectsMinModifiedMs', legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'minModifiedMs')] },
	)
	const [maxModifiedMs, setMaxModifiedMs] = useLocalStorageState<number | null>(
		profileScopedStorageKey('objects', apiToken, profileId, 'maxModifiedMs'),
		null,
		{ legacyLocalStorageKey: 'objectsMaxModifiedMs', legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'maxModifiedMs')] },
	)
	const [sort, setSort] = useLocalStorageState<ObjectSort>('objectsSort', 'name_asc')
	const [viewMode, setViewMode] = useLocalStorageState<ObjectsViewMode>('objectsViewMode', 'list')
	const [showThumbnails] = useLocalStorageState<boolean>('objectsShowThumbnails', true)
	const [thumbnailCacheSize] = useLocalStorageState<number>('objectsThumbnailCacheSize', THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES)
	const [objectsCostMode] = useLocalStorageState<ObjectsCostMode>(OBJECTS_COST_MODE_STORAGE_KEY, OBJECTS_COST_MODE_DEFAULT)
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
		favoritesPaneExpanded,
		setFavoritesPaneExpanded,
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
		viewMode,
		setViewMode,
		showThumbnails,
		thumbnailCacheSize,
		objectsCostMode,
		autoIndexEnabled,
		autoIndexTtlHours,
	}
}
