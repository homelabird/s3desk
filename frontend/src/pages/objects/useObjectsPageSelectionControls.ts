import type { Dispatch, SetStateAction } from 'react'

import { useObjectsSelection } from './useObjectsSelection'
import { useObjectsSelectionBulk } from './useObjectsSelectionBulk'
import { useObjectsSelectionHandlers } from './useObjectsSelectionHandlers'
import type { useObjectsPageSearchData } from './useObjectsPageSearchData'

type ObjectsSelectionBaseState = ReturnType<typeof useObjectsSelection>
type ObjectsPageSearchSelectionData = Pick<
	ReturnType<typeof useObjectsPageSearchData>,
	'orderedVisibleObjectKeys' | 'visibleObjectKeys'
>

export type ObjectsPageSelectionState = {
	clearSelection: () => void
	ensureObjectSelectedForContextMenu: (key: string) => void
	handleToggleSelectAll: (checked: boolean) => void
	lastSelectedObjectKey: string | null
	selectAllLoaded: () => void
	selectObjectFromCheckboxEvent: ReturnType<typeof useObjectsSelectionHandlers>['selectObjectFromCheckboxEvent']
	selectObjectFromPointerEvent: ReturnType<typeof useObjectsSelectionHandlers>['selectObjectFromPointerEvent']
	selectRange: (startKey: string, endKey: string) => void
	selectedCount: number
	selectedKeys: Set<string>
	setLastSelectedObjectKey: Dispatch<SetStateAction<string | null>>
	setSelectedKeys: Dispatch<SetStateAction<Set<string>>>
}

export function useObjectsPageSelectionControls(args: {
	selectionState: ObjectsSelectionBaseState
	searchState: ObjectsPageSearchSelectionData
}): ObjectsPageSelectionState {
	const selectionHandlers = useObjectsSelectionHandlers({
		orderedVisibleObjectKeys: args.searchState.orderedVisibleObjectKeys,
		lastSelectedObjectKey: args.selectionState.lastSelectedObjectKey,
		setSelectedKeys: args.selectionState.setSelectedKeys,
		setLastSelectedObjectKey: args.selectionState.setLastSelectedObjectKey,
	})

	const selectionBulk = useObjectsSelectionBulk({
		visibleObjectKeys: args.searchState.visibleObjectKeys,
		orderedVisibleObjectKeys: args.searchState.orderedVisibleObjectKeys,
		setSelectedKeys: args.selectionState.setSelectedKeys,
		setLastSelectedObjectKey: args.selectionState.setLastSelectedObjectKey,
	})

	return {
		clearSelection: args.selectionState.clearSelection,
		ensureObjectSelectedForContextMenu: selectionHandlers.ensureObjectSelectedForContextMenu,
		handleToggleSelectAll: selectionBulk.handleToggleSelectAll,
		lastSelectedObjectKey: args.selectionState.lastSelectedObjectKey,
		selectAllLoaded: selectionBulk.selectAllLoaded,
		selectObjectFromCheckboxEvent: selectionHandlers.selectObjectFromCheckboxEvent,
		selectObjectFromPointerEvent: selectionHandlers.selectObjectFromPointerEvent,
		selectRange: selectionBulk.selectRange,
		selectedCount: args.selectionState.selectedCount,
		selectedKeys: args.selectionState.selectedKeys,
		setLastSelectedObjectKey: args.selectionState.setLastSelectedObjectKey,
		setSelectedKeys: args.selectionState.setSelectedKeys,
	}
}
