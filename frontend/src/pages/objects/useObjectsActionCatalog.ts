import { useMemo } from 'react'

import type { UIAction, UIActionOrDivider } from './objectsActions'
import { commandItemsFromActions, filterActionItems, filterActions, trimActionDividers } from './objectsActions'
import type { ClipboardObjects } from './objectsActionCatalog'
import { buildObjectsActionCatalog } from './objectsActionCatalog'
import { normalizePrefix } from './objectsListUtils'
import type { CommandItem } from './objectsActions'

type UseObjectsActionCatalogArgs = {
	isAdvanced: boolean
	isOffline: boolean
	profileId: string | null
	bucket: string
	prefix: string
	selectedCount: number
	clipboardObjects: ClipboardObjects | null
	singleSelectedKey: string | null
	singleSelectedItemSize?: number
	canGoBack: boolean
	canGoForward: boolean
	canGoUp: boolean
	detailsVisible: boolean
	activeTabId: string | null
	tabsCount: number
	onGoBack: () => void
	onGoForward: () => void
	onGoUp: () => void
	onDownload: (key: string) => void
	onDownloadToDevice: (key: string) => void
	onPresign: (key: string) => void
	onCopy: (value: string) => void
	onOpenDetailsForKey: (key: string) => void
	onOpenRenameObject: (key: string) => void
	onOpenCopyMove: (mode: 'copy' | 'move', key: string) => void
	onConfirmDeleteObjects: (keys: string[]) => void
	onOpenPrefix: (prefix: string) => void
	onOpenRenamePrefix: (prefix: string) => void
	onConfirmDeletePrefixAsJob: (dryRun: boolean, prefixOverride?: string) => void
	onOpenCopyPrefix: (mode: 'copy' | 'move', prefix: string) => void
	onOpenDownloadPrefix: (prefix: string) => void
	onZipPrefix: (prefix: string) => void
	onDownloadSelected: () => void
	onCopySelectionToClipboard: (mode: 'copy' | 'move') => void
	onPasteClipboardObjects: () => void
	onClearSelection: () => void
	onConfirmDeleteSelected: () => void
	onToggleDetails: () => void
	onOpenTreeDrawer: () => void
	onRefresh: () => void
	onOpenPathModal: () => void
	onOpenUploadFiles: () => void
	onOpenUploadFolder: () => void
	onOpenNewFolder: () => void
	onOpenCommandPalette: () => void
	onOpenTransfers: () => void
	onAddTab: () => void
	onCloseTab: (tabId: string) => void
	onOpenGlobalSearch: () => void
	onToggleUiMode: () => void
}

export function useObjectsActionCatalog({
	isAdvanced,
	isOffline,
	profileId,
	bucket,
	prefix,
	selectedCount,
	clipboardObjects,
	singleSelectedKey,
	singleSelectedItemSize,
	canGoBack,
	canGoForward,
	canGoUp,
	detailsVisible,
	activeTabId,
	tabsCount,
	onGoBack,
	onGoForward,
	onGoUp,
	onDownload,
	onDownloadToDevice,
	onPresign,
	onCopy,
	onOpenDetailsForKey,
	onOpenRenameObject,
	onOpenCopyMove,
	onConfirmDeleteObjects,
	onOpenPrefix,
	onOpenRenamePrefix,
	onConfirmDeletePrefixAsJob,
	onOpenCopyPrefix,
	onOpenDownloadPrefix,
	onZipPrefix,
	onDownloadSelected,
	onCopySelectionToClipboard,
	onPasteClipboardObjects,
	onClearSelection,
	onConfirmDeleteSelected,
	onToggleDetails,
	onOpenTreeDrawer,
	onRefresh,
	onOpenPathModal,
	onOpenUploadFiles,
	onOpenUploadFolder,
	onOpenNewFolder,
	onOpenCommandPalette,
	onOpenTransfers,
	onAddTab,
	onCloseTab,
	onOpenGlobalSearch,
	onToggleUiMode,
}: UseObjectsActionCatalogArgs) {
	const commandPrefix = normalizePrefix(prefix)
	const { getObjectActions, getPrefixActions, selectionActionsAll, globalActionsAll } = buildObjectsActionCatalog({
		isAdvanced,
		isOffline,
		profileId,
		bucket,
		prefix,
		selectedCount,
		clipboardObjects,
		canGoBack,
		canGoForward,
		canGoUp,
		detailsVisible,
		activeTabId: activeTabId ?? '',
		tabsCount,
		onGoBack,
		onGoForward,
		onGoUp,
		onDownload,
		onDownloadToDevice,
		onPresign,
		onCopy,
		onOpenDetailsForKey,
		onOpenRenameObject,
		onOpenCopyMove,
		onConfirmDeleteObjects,
		onOpenPrefix,
		onOpenRenamePrefix,
		onConfirmDeletePrefixAsJob,
		onOpenCopyPrefix,
		onOpenDownloadPrefix,
		onZipPrefix,
		onDownloadSelected,
		onCopySelectionToClipboard,
		onPasteClipboardObjects,
		onClearSelection,
		onConfirmDeleteSelected,
		onToggleDetails,
		onOpenTreeDrawer,
		onRefresh,
		onOpenPathModal,
		onOpenUploadFiles,
		onOpenUploadFolder,
		onOpenNewFolder,
		onOpenCommandPalette,
		onOpenTransfers,
		onAddTab,
		onCloseTab,
		onOpenGlobalSearch,
		onToggleUiMode,
	})

	const currentPrefixActionsAll: UIActionOrDivider[] = commandPrefix ? getPrefixActions(commandPrefix) : []
	const currentPrefixActions = filterActionItems(currentPrefixActionsAll, isAdvanced)
	const currentPrefixActionMap = useMemo(() => {
		const map = new Map<string, UIAction>()
		for (const item of currentPrefixActionsAll) {
			if ('type' in item) continue
			map.set(item.id, item)
		}
		return map
	}, [currentPrefixActionsAll])

	const selectionActions = filterActions(selectionActionsAll, isAdvanced)
	const selectionActionMap = useMemo(() => new Map(selectionActions.map((action) => [action.id, action])), [selectionActions])
	const selectionContextMenuActions = useMemo(
		() =>
			trimActionDividers(
				[
					selectionActionMap.get('download_selected'),
					{ type: 'divider' as const },
					selectionActionMap.get('copy_selected_keys'),
					selectionActionMap.get('cut_selected_keys'),
					selectionActionMap.get('paste_keys'),
					{ type: 'divider' as const },
					selectionActionMap.get('clear_selection'),
					{ type: 'divider' as const },
					selectionActionMap.get('delete_selected'),
				].filter(Boolean) as UIActionOrDivider[],
				),
		[selectionActionMap],
	)
	const selectionMenuActions = useMemo(
		() =>
			trimActionDividers(
				[
					selectionActionMap.get('copy_selected_keys'),
					selectionActionMap.get('cut_selected_keys'),
					selectionActionMap.get('paste_keys'),
				].filter(Boolean) as UIActionOrDivider[],
				),
		[selectionActionMap],
	)

	const globalActions = filterActions(globalActionsAll, isAdvanced)
	const globalActionMap = useMemo(() => new Map(globalActionsAll.map((action) => [action.id, action])), [globalActionsAll])

	const commandItems = useMemo(() => {
		const selectedObjectCommandItems: CommandItem[] = singleSelectedKey
			? commandItemsFromActions(
					filterActionItems(getObjectActions(singleSelectedKey, singleSelectedItemSize), isAdvanced),
					'obj_',
				)
			: []
		const currentFolderCommandItems: CommandItem[] = []
		if (commandPrefix) {
			currentFolderCommandItems.push(...commandItemsFromActions(currentPrefixActions, 'prefix_').filter((c) => c.id !== 'prefix_open'))
		}
		return [
			...commandItemsFromActions(globalActions, 'global_'),
			...commandItemsFromActions(selectionActions, 'selection_'),
			...selectedObjectCommandItems,
			...currentFolderCommandItems,
		]
	}, [
		commandPrefix,
		currentPrefixActions,
		getObjectActions,
		globalActions,
		isAdvanced,
		selectionActions,
		singleSelectedItemSize,
		singleSelectedKey,
	])

	return {
		getObjectActions,
		getPrefixActions,
		currentPrefixActions,
		currentPrefixActionMap,
		selectionActions,
		selectionActionMap,
		selectionContextMenuActions,
		selectionMenuActions,
		globalActions,
		globalActionMap,
		commandItems,
	}
}
