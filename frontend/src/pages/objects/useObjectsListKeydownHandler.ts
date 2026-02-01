import { useCallback } from 'react'
import { message } from 'antd'

import { useObjectsListKeydown } from './useObjectsListKeydown'

type UseObjectsListKeydownHandlerArgs = {
	selectedCount: number
	singleSelectedKey: string | null
	lastSelectedObjectKey: string | null
	orderedVisibleObjectKeys: string[]
	visibleObjectKeys: string[]
	rowIndexByObjectKey: Map<string, number>
	canGoUp: boolean
	clearSelection: () => void
	openRenameObject: (key: string) => void
	openNewFolder: () => void
	copySelectionToClipboard: (mode: 'copy' | 'move') => void
	pasteClipboardObjects: () => void
	openDetailsForKey: (key: string) => void
	onUp: () => void
	confirmDeleteSelected: () => void
	setSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>
	setLastSelectedObjectKey: React.Dispatch<React.SetStateAction<string | null>>
	selectRange: (startKey: string, endKey: string) => void
	selectAllLoaded: () => void
	scrollToIndex: (index: number) => void
	warnRenameNoSelection?: () => void
}

export function useObjectsListKeydownHandler({
	selectedCount,
	singleSelectedKey,
	lastSelectedObjectKey,
	orderedVisibleObjectKeys,
	visibleObjectKeys,
	rowIndexByObjectKey,
	canGoUp,
	clearSelection,
	openRenameObject,
	openNewFolder,
	copySelectionToClipboard,
	pasteClipboardObjects,
	openDetailsForKey,
	onUp,
	confirmDeleteSelected,
	setSelectedKeys,
	setLastSelectedObjectKey,
	selectRange,
	selectAllLoaded,
	scrollToIndex,
	warnRenameNoSelection,
}: UseObjectsListKeydownHandlerArgs) {
	const handleSelectKeys = useCallback(
		(keys: string[]) => {
			setSelectedKeys(new Set(keys))
		},
		[setSelectedKeys],
	)
	const handleWarnRenameNoSelection = useCallback(() => {
		if (warnRenameNoSelection) {
			warnRenameNoSelection()
			return
		}
		message.info('Select a single object to rename')
	}, [warnRenameNoSelection])

	return useObjectsListKeydown({
		selectedCount,
		singleSelectedKey,
		lastSelectedObjectKey,
		orderedVisibleObjectKeys,
		visibleObjectKeys,
		rowIndexByObjectKey,
		canGoUp,
		onClearSelection: clearSelection,
		onOpenRename: openRenameObject,
		onNewFolder: openNewFolder,
		onCopySelection: copySelectionToClipboard,
		onPasteSelection: pasteClipboardObjects,
		onOpenDetails: openDetailsForKey,
		onGoUp: onUp,
		onDeleteSelected: confirmDeleteSelected,
		onSelectKeys: handleSelectKeys,
		onSetLastSelected: setLastSelectedObjectKey,
		onSelectRange: selectRange,
		onScrollToIndex: scrollToIndex,
		onSelectAllLoaded: selectAllLoaded,
		onWarnRenameNoSelection: handleWarnRenameNoSelection,
	})
}
