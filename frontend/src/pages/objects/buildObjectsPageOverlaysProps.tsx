import type { ObjectItem } from '../../api/types'
import { normalizePrefix } from './objectsListUtils'
import type { ObjectSort, ObjectTypeFilter } from './objectsTypes'
import type { ObjectsPageActionsState } from './useObjectsPageActions'
import type { ObjectsPageOverlaysProps } from './ObjectsPageOverlays'

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

type BuildObjectsPageOverlaysPropsArgs = {
	actions: ObjectsPageActionsState
	profileId: string | null
	bucket: string
	prefix: string
	isMd: boolean
	bucketOptions: CopyMoveModalProps['bucketOptions']
	bucketsLoading: boolean
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
	setMoveAfterUploadDefault: (value: boolean) => void
	setCleanupEmptyDirsDefault: (value: boolean) => void
	onOpenPrefix: (prefix: string) => void
	onCopy: (key: string) => void
	onDownload: (key: string, size?: number) => void
	openGlobalSearchPrefix: (key: string) => void
	openGlobalSearchDetails: (key: string) => void
}

export function buildObjectsPageOverlaysProps({
	actions,
	profileId,
	bucket,
	prefix,
	isMd,
	bucketOptions,
	bucketsLoading,
	filtersDrawerOpen,
	setFiltersDrawerOpen,
	isAdvanced,
	typeFilter,
	setTypeFilter,
	favoritesOnly,
	setFavoritesOnly,
	favoritesFirst,
	setFavoritesFirst,
	extFilter,
	extOptions,
	setExtFilter,
	minSize,
	maxSize,
	setMinSize,
	setMaxSize,
	minModifiedMs,
	maxModifiedMs,
	setMinModifiedMs,
	setMaxModifiedMs,
	sort,
	setSort,
	resetFilters,
	hasActiveView,
	pathModalOpen,
	pathDraft,
	pathOptions,
	pathInputRef,
	setPathDraft,
	commitPathDraft,
	setPathModalOpen,
	commandPaletteOpen,
	commandPaletteQuery,
	commandPaletteItems,
	commandPaletteActiveIndex,
	onCommandPaletteQueryChange,
	setCommandPaletteActiveIndex,
	runCommandPaletteItem,
	closeCommandPalette,
	onCommandPaletteKeyDown,
	globalSearchOpen,
	closeGlobalSearch,
	globalSearchDraft,
	setGlobalSearchDraft,
	globalSearchPrefix,
	setGlobalSearchPrefix,
	globalSearchLimitClamped,
	setGlobalSearchLimit,
	globalSearchExt,
	setGlobalSearchExt,
	globalSearchMinSize,
	setGlobalSearchMinSize,
	globalSearchMaxSize,
	setGlobalSearchMaxSize,
	globalSearchMinModifiedMs,
	setGlobalSearchMinModifiedMs,
	globalSearchMaxModifiedMs,
	setGlobalSearchMaxModifiedMs,
	resetGlobalSearch,
	indexedSearchQuery,
	indexedSearchNotIndexed,
	indexedSearchErrorMessage,
	indexedSearchItems,
	indexObjectsJobMutation,
	indexPrefix,
	setIndexPrefix,
	indexFullReindex,
	setIndexFullReindex,
	globalSearchQueryText,
	setMoveAfterUploadDefault,
	setCleanupEmptyDirsDefault,
	onOpenPrefix,
	onCopy,
	onDownload,
	openGlobalSearchPrefix,
	openGlobalSearchDetails,
}: BuildObjectsPageOverlaysPropsArgs): ObjectsPageOverlaysProps {
	return {
		filtersDrawerProps: filtersDrawerOpen
			? {
				open: filtersDrawerOpen,
				onClose: () => setFiltersDrawerOpen(false),
				isAdvanced,
				typeFilter,
				onTypeFilterChange: setTypeFilter,
				favoritesOnly,
				onFavoritesOnlyChange: setFavoritesOnly,
				favoritesFirst,
				onFavoritesFirstChange: setFavoritesFirst,
				extFilter,
				extOptions,
				onExtFilterChange: setExtFilter,
				minSizeBytes: minSize,
				maxSizeBytes: maxSize,
				onMinSizeBytesChange: setMinSize,
				onMaxSizeBytesChange: setMaxSize,
				modifiedAfterMs: minModifiedMs,
				modifiedBeforeMs: maxModifiedMs,
				onModifiedRangeChange: (startMs, endMs) => {
					setMinModifiedMs(startMs)
					setMaxModifiedMs(endMs)
				},
				sort,
				onSortChange: setSort,
				onResetView: resetFilters,
				hasActiveView,
			}
			: null,
		presignModalProps: actions.presignOpen
			? { open: actions.presignOpen, presign: actions.presign, onClose: actions.closePresign }
			: null,
		goToPathModalProps: pathModalOpen
			? {
				open: pathModalOpen,
				bucket,
				hasProfile: !!profileId,
				pathDraft,
				options: pathOptions,
				inputRef: pathInputRef,
				onChangeDraft: setPathDraft,
				onCommit: commitPathDraft,
				onClose: () => setPathModalOpen(false),
			}
			: null,
		commandPaletteModalProps: commandPaletteOpen
			? {
				open: commandPaletteOpen,
				query: commandPaletteQuery,
				commands: commandPaletteItems,
				activeIndex: commandPaletteActiveIndex,
				onQueryChange: onCommandPaletteQueryChange,
				onActiveIndexChange: setCommandPaletteActiveIndex,
				onRunCommand: runCommandPaletteItem,
				onCancel: closeCommandPalette,
				onKeyDown: onCommandPaletteKeyDown,
			}
			: null,
		deletePrefixConfirmModalProps: actions.deletePrefixConfirmOpen
			? {
				open: actions.deletePrefixConfirmOpen,
				dryRun: actions.deletePrefixConfirmDryRun,
				bucket,
				prefix: actions.deletePrefixConfirmPrefix,
				confirmText: actions.deletePrefixConfirmText,
				onConfirmTextChange: actions.setDeletePrefixConfirmText,
				hasProfile: !!profileId,
				hasBucket: !!bucket,
				isConfirming: actions.deletePrefixJobMutation.isPending,
				onConfirm: actions.handleDeletePrefixConfirm,
				onCancel: actions.handleDeletePrefixCancel,
				isSummaryFetching: actions.deletePrefixSummaryQuery.isFetching,
				summary: actions.deletePrefixSummary,
				summaryNotIndexed: actions.deletePrefixSummaryNotIndexed,
				isSummaryError: actions.deletePrefixSummaryQuery.isError,
				summaryErrorMessage: actions.deletePrefixSummaryError,
				onIndexPrefix: () => {
					if (!actions.deletePrefixConfirmPrefix) return
					indexObjectsJobMutation.mutate({ prefix: actions.deletePrefixConfirmPrefix, fullReindex: false })
				},
			}
			: null,
		downloadPrefixModalProps: actions.downloadPrefixOpen
			? {
				open: actions.downloadPrefixOpen,
				sourceLabel: bucket ? `s3://${bucket}/${normalizePrefix(prefix)}*` : '-',
				values: actions.downloadPrefixValues,
				onValuesChange: actions.setDownloadPrefixValues,
				isSubmitting: actions.downloadPrefixSubmitting,
				onCancel: actions.handleDownloadPrefixCancel,
				onFinish: actions.handleDownloadPrefixSubmit,
				onPickFolder: actions.handleDownloadPrefixPick,
				canSubmit: actions.downloadPrefixCanSubmit,
			}
			: null,
		uploadFolderModalProps: actions.uploadFolderOpen
			? {
				open: actions.uploadFolderOpen,
				destinationLabel: bucket ? `s3://${bucket}/${normalizePrefix(prefix)}` : '-',
				values: actions.uploadFolderValues,
				onValuesChange: actions.setUploadFolderValues,
				isSubmitting: actions.uploadFolderSubmitting,
				onCancel: actions.handleUploadFolderCancel,
				onDefaultsChange: (values) => {
					setMoveAfterUploadDefault(values.moveAfterUpload)
					setCleanupEmptyDirsDefault(values.cleanupEmptyDirs)
				},
				onFinish: actions.handleUploadFolderSubmit,
				onPickFolder: actions.handleUploadFolderPick,
				canSubmit: actions.uploadFolderCanSubmit,
			}
			: null,
		copyPrefixModalProps: actions.copyPrefixOpen
			? {
				open: actions.copyPrefixOpen,
				mode: actions.copyPrefixMode,
				bucket,
				srcPrefix: actions.copyPrefixSrcPrefix,
				sourceLabel: actions.copyPrefixSrcPrefix ? `s3://${bucket}/${actions.copyPrefixSrcPrefix}*` : '-',
				values: actions.copyPrefixValues,
				onValuesChange: actions.setCopyPrefixValues,
				bucketOptions,
				isBucketsLoading: bucketsLoading,
				isSubmitting: actions.copyPrefixSubmitting,
				onCancel: actions.handleCopyPrefixCancel,
				onFinish: actions.handleCopyPrefixSubmit,
				isSummaryFetching: actions.copyPrefixSummaryQuery.isFetching,
				summary: actions.copyPrefixSummary,
				summaryNotIndexed: actions.copyPrefixSummaryNotIndexed,
				isSummaryError: actions.copyPrefixSummaryQuery.isError,
				summaryErrorMessage: actions.copyPrefixSummaryError,
				onIndexPrefix: () => {
					if (!actions.copyPrefixSrcPrefix) return
					indexObjectsJobMutation.mutate({ prefix: actions.copyPrefixSrcPrefix, fullReindex: false })
				},
				normalizePrefix,
			}
			: null,
		copyMoveModalProps: actions.copyMoveOpen
			? {
				open: actions.copyMoveOpen,
				mode: actions.copyMoveMode,
				bucket,
				srcKey: actions.copyMoveSrcKey,
				values: actions.copyMoveValues,
				onValuesChange: actions.setCopyMoveValues,
				bucketOptions,
				isBucketsLoading: bucketsLoading,
				isSubmitting: actions.copyMoveSubmitting,
				onCancel: actions.handleCopyMoveCancel,
				onFinish: actions.handleCopyMoveSubmit,
			}
			: null,
		newFolderModalProps: actions.newFolderOpen
			? {
				open: actions.newFolderOpen,
				parentLabel: bucket ? `s3://${bucket}/${normalizePrefix(actions.newFolderParentPrefix)}` : '-',
				parentPrefix: actions.newFolderParentPrefix,
				errorMessage: actions.newFolderError,
				partialKey: actions.newFolderPartialKey,
				onOpenPrefix,
				values: actions.newFolderValues,
				onValuesChange: actions.setNewFolderValues,
				isSubmitting: actions.newFolderSubmitting,
				onCancel: actions.handleNewFolderCancel,
				onFinish: actions.handleNewFolderSubmit,
			}
			: null,
		renameModalProps: actions.renameOpen
			? {
				open: actions.renameOpen,
				kind: actions.renameKind,
				source: actions.renameSource,
				bucket,
				values: actions.renameValues,
				onValuesChange: actions.setRenameValues,
				isSubmitting: actions.renameSubmitting,
				onCancel: actions.handleRenameCancel,
				onFinish: actions.handleRenameSubmit,
			}
			: null,
		globalSearchDrawerProps: globalSearchOpen
			? {
				open: globalSearchOpen,
				onClose: closeGlobalSearch,
				hasProfile: !!profileId,
				hasBucket: !!bucket,
				bucket,
				currentPrefix: prefix,
				isMd,
				queryDraft: globalSearchDraft,
				onQueryDraftChange: setGlobalSearchDraft,
				prefixFilter: globalSearchPrefix,
				onPrefixFilterChange: setGlobalSearchPrefix,
				limit: globalSearchLimitClamped,
				onLimitChange: setGlobalSearchLimit,
				extFilter: globalSearchExt,
				onExtFilterChange: setGlobalSearchExt,
				minSizeBytes: globalSearchMinSize,
				maxSizeBytes: globalSearchMaxSize,
				onMinSizeBytesChange: setGlobalSearchMinSize,
				onMaxSizeBytesChange: setGlobalSearchMaxSize,
				modifiedAfterMs: globalSearchMinModifiedMs,
				modifiedBeforeMs: globalSearchMaxModifiedMs,
				onModifiedRangeChange: (startMs, endMs) => {
					setGlobalSearchMinModifiedMs(startMs)
					setGlobalSearchMaxModifiedMs(endMs)
				},
				onReset: resetGlobalSearch,
				onRefresh: () => indexedSearchQuery.refetch(),
				isRefreshing: indexedSearchQuery.isFetching,
				isError: indexedSearchQuery.isError,
				isNotIndexed: indexedSearchNotIndexed,
				errorMessage: indexedSearchErrorMessage,
				onCreateIndexJob: () => indexObjectsJobMutation.mutate({ prefix: indexPrefix, fullReindex: indexFullReindex }),
				isCreatingIndexJob: indexObjectsJobMutation.isPending,
				indexPrefix,
				onIndexPrefixChange: setIndexPrefix,
				indexFullReindex,
				onIndexFullReindexChange: setIndexFullReindex,
				searchQueryText: globalSearchQueryText,
				isFetching: indexedSearchQuery.isFetching,
				hasNextPage: indexedSearchQuery.hasNextPage,
				isFetchingNextPage: indexedSearchQuery.isFetchingNextPage,
				items: indexedSearchItems,
				onLoadMore: () => indexedSearchQuery.fetchNextPage(),
				onUseCurrentPrefix: () => setIndexPrefix(prefix),
				onOpenPrefixForKey: openGlobalSearchPrefix,
				onCopyKey: onCopy,
				onDownloadKey: onDownload,
				onOpenDetails: openGlobalSearchDetails,
			}
			: null,
	}
}
