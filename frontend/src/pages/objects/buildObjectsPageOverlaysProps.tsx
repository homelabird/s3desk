import type { ObjectItem } from '../../api/types'
import type { ObjectSort, ObjectTypeFilter } from './objectsTypes'
import type { ObjectsPageActionsState } from './useObjectsPageActions'
import type { ObjectsPageOverlaysProps } from './ObjectsPageOverlays'
import { buildObjectsDialogsProps } from './buildObjectsDialogsProps'
import { buildObjectsSearchOverlayProps } from './buildObjectsSearchOverlayProps'

type FiltersDrawerProps = NonNullable<ObjectsPageOverlaysProps['filtersDrawerProps']>
type GoToPathModalProps = NonNullable<ObjectsPageOverlaysProps['goToPathModalProps']>
type CommandPaletteModalProps = NonNullable<ObjectsPageOverlaysProps['commandPaletteModalProps']>
type CopyMoveModalProps = NonNullable<ObjectsPageOverlaysProps['copyMoveModalProps']>

type IndexObjectsMutationLike = {
	isPending: boolean
	mutate: (args: { prefix: string; fullReindex: boolean }) => void
}

type IndexedSearchQueryLike = {
	refetch: () => unknown
	isFetching: boolean
	isError: boolean
	hasNextPage: boolean
	isFetchingNextPage: boolean
	fetchNextPage: () => unknown
}

export type BuildObjectsPageOverlaysPropsArgs = {
	actions: ObjectsPageActionsState
	profileId: string | null
	bucket: string
	prefix: string
	isMd: boolean
	bucketOptions: CopyMoveModalProps['bucketOptions']
	bucketsLoading: boolean
	selectedCount: number
	filtersDrawerOpen: boolean
	setFiltersDrawerOpen: (open: boolean) => void
	isAdvanced: boolean
	typeFilter: ObjectTypeFilter
	setTypeFilter: FiltersDrawerProps['onTypeFilterChange']
	favoritesOnly: boolean
	setFavoritesOnly: FiltersDrawerProps['onFavoritesOnlyChange']
	favoritesFirst: boolean
	setFavoritesFirst: FiltersDrawerProps['onFavoritesFirstChange']
	extFilter: string
	extOptions: FiltersDrawerProps['extOptions']
	setExtFilter: FiltersDrawerProps['onExtFilterChange']
	minSize: number | null
	maxSize: number | null
	setMinSize: FiltersDrawerProps['onMinSizeBytesChange']
	setMaxSize: FiltersDrawerProps['onMaxSizeBytesChange']
	minModifiedMs: number | null
	maxModifiedMs: number | null
	setMinModifiedMs: (value: number | null) => void
	setMaxModifiedMs: (value: number | null) => void
	sort: ObjectSort
	setSort: FiltersDrawerProps['onSortChange']
	resetFilters: () => void
	hasActiveView: boolean
	pathModalOpen: boolean
	pathDraft: GoToPathModalProps['pathDraft']
	pathOptions: GoToPathModalProps['options']
	pathInputRef: GoToPathModalProps['inputRef']
	setPathDraft: GoToPathModalProps['onChangeDraft']
	commitPathDraft: GoToPathModalProps['onCommit']
	setPathModalOpen: (open: boolean) => void
	commandPaletteOpen: CommandPaletteModalProps['open']
	commandPaletteQuery: CommandPaletteModalProps['query']
	commandPaletteItems: CommandPaletteModalProps['commands']
	commandPaletteActiveIndex: CommandPaletteModalProps['activeIndex']
	onCommandPaletteQueryChange: CommandPaletteModalProps['onQueryChange']
	setCommandPaletteActiveIndex: CommandPaletteModalProps['onActiveIndexChange']
	runCommandPaletteItem: CommandPaletteModalProps['onRunCommand']
	closeCommandPalette: CommandPaletteModalProps['onCancel']
	onCommandPaletteKeyDown: CommandPaletteModalProps['onKeyDown']
	globalSearchOpen: boolean
	closeGlobalSearch: () => void
	globalSearchDraft: string
	setGlobalSearchDraft: (value: string) => void
	globalSearchPrefix: string
	setGlobalSearchPrefix: (value: string) => void
	globalSearchLimitClamped: number
	setGlobalSearchLimit: (value: number) => void
	globalSearchExt: string
	setGlobalSearchExt: (value: string) => void
	globalSearchMinSize: number | null
	setGlobalSearchMinSize: (value: number | null) => void
	globalSearchMaxSize: number | null
	setGlobalSearchMaxSize: (value: number | null) => void
	globalSearchMinModifiedMs: number | null
	setGlobalSearchMinModifiedMs: (value: number | null) => void
	globalSearchMaxModifiedMs: number | null
	setGlobalSearchMaxModifiedMs: (value: number | null) => void
	resetGlobalSearch: () => void
	indexedSearchQuery: IndexedSearchQueryLike
	indexedSearchNotIndexed: boolean
	indexedSearchErrorMessage: string
	indexedSearchItems: ObjectItem[]
	indexObjectsJobMutation: IndexObjectsMutationLike
	indexPrefix: string
	setIndexPrefix: (value: string) => void
	indexFullReindex: boolean
	setIndexFullReindex: (value: boolean) => void
	globalSearchQueryText: string
	onOpenPrefix: (prefix: string) => void
	onCopy: (key: string) => void
	onDownload: (key: string, size?: number) => void
	openGlobalSearchPrefix: (key: string) => void
	openGlobalSearchDetails: (key: string) => void
}

export function buildObjectsPageOverlaysProps(args: BuildObjectsPageOverlaysPropsArgs): ObjectsPageOverlaysProps {
	return {
		...buildObjectsSearchOverlayProps(args),
		...buildObjectsDialogsProps(args),
	}
}
