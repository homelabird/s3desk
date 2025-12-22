import { useCallback } from 'react'

type UseObjectsListKeydownArgs = {
	selectedCount: number
	singleSelectedKey: string | null
	lastSelectedObjectKey: string | null
	orderedVisibleObjectKeys: string[]
	visibleObjectKeys: string[]
	rowIndexByObjectKey: Map<string, number>
	canGoUp: boolean
	onClearSelection: () => void
	onOpenRename: (key: string) => void
	onNewFolder: () => void
	onCopySelection: (mode: 'copy' | 'move') => void
	onPasteSelection: () => void
	onOpenDetails: (key: string) => void
	onGoUp: () => void
	onDeleteSelected: () => void
	onSelectKeys: (keys: string[]) => void
	onSetLastSelected: (key: string | null) => void
	onSelectRange: (startKey: string, endKey: string) => void
	onScrollToIndex: (index: number) => void
	onSelectAllLoaded: () => void
	onWarnRenameNoSelection: () => void
}

export function useObjectsListKeydown(args: UseObjectsListKeydownArgs) {
	return useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			if (e.key === 'Escape') {
				if (args.selectedCount > 0) {
					e.preventDefault()
					args.onClearSelection()
				}
				return
			}
			if (e.key === 'F2') {
				e.preventDefault()
				if (args.singleSelectedKey) {
					args.onOpenRename(args.singleSelectedKey)
					return
				}
				args.onWarnRenameNoSelection()
				return
			}
			if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
				e.preventDefault()
				args.onNewFolder()
				return
			}
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
				e.preventDefault()
				args.onCopySelection('copy')
				return
			}
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
				e.preventDefault()
				args.onCopySelection('move')
				return
			}
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
				e.preventDefault()
				args.onPasteSelection()
				return
			}
			if (e.key === 'Enter') {
				if (args.singleSelectedKey) {
					e.preventDefault()
					args.onOpenDetails(args.singleSelectedKey)
				}
				return
			}
			if (e.key === 'Backspace') {
				if (args.canGoUp) {
					e.preventDefault()
					args.onGoUp()
				}
				return
			}
			if (e.key === 'Delete') {
				if (args.selectedCount > 0) {
					e.preventDefault()
					args.onDeleteSelected()
				}
				return
			}
			if (
				e.key === 'ArrowDown' ||
				e.key === 'ArrowUp' ||
				e.key === 'Home' ||
				e.key === 'End' ||
				e.key === 'PageDown' ||
				e.key === 'PageUp'
			) {
				if (args.orderedVisibleObjectKeys.length === 0) return
				e.preventDefault()

				const currentKey = args.singleSelectedKey
				const currentIndex = currentKey ? args.orderedVisibleObjectKeys.indexOf(currentKey) : -1
				let nextIndex = currentIndex

				const pageStep = 20
				if (e.key === 'Home') nextIndex = 0
				else if (e.key === 'End') nextIndex = args.orderedVisibleObjectKeys.length - 1
				else if (e.key === 'ArrowDown') nextIndex = Math.min(args.orderedVisibleObjectKeys.length - 1, currentIndex < 0 ? 0 : currentIndex + 1)
				else if (e.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex < 0 ? args.orderedVisibleObjectKeys.length - 1 : currentIndex - 1)
				else if (e.key === 'PageDown') nextIndex = Math.min(args.orderedVisibleObjectKeys.length - 1, currentIndex < 0 ? 0 : currentIndex + pageStep)
				else if (e.key === 'PageUp') nextIndex = Math.max(0, currentIndex < 0 ? args.orderedVisibleObjectKeys.length - 1 : currentIndex - pageStep)

				const nextKey = args.orderedVisibleObjectKeys[nextIndex]
				if (!nextKey) return

				if (e.shiftKey && args.lastSelectedObjectKey) {
					args.onSelectRange(args.lastSelectedObjectKey, nextKey)
				} else {
					args.onSelectKeys([nextKey])
					args.onSetLastSelected(nextKey)
				}

				const rowIndex = args.rowIndexByObjectKey.get(nextKey)
				if (typeof rowIndex === 'number') {
					args.onScrollToIndex(rowIndex)
				}
				return
			}
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
				e.preventDefault()
				if (args.visibleObjectKeys.length === 0) return
				args.onSelectAllLoaded()
			}
		},
		[
			args,
		],
	)
}
