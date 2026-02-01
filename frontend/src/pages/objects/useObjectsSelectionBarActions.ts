import { useMemo } from 'react'

import type { UIAction } from './objectsActions'

type UseObjectsSelectionBarActionsArgs = {
	selectionActionMap: Map<string, UIAction>
}

export function useObjectsSelectionBarActions({ selectionActionMap }: UseObjectsSelectionBarActionsArgs) {
	return useMemo(
		() => ({
			clearSelectionAction: selectionActionMap.get('clear_selection'),
			deleteSelectionAction: selectionActionMap.get('delete_selected'),
			downloadSelectionAction: selectionActionMap.get('download_selected'),
		}),
		[selectionActionMap],
	)
}
