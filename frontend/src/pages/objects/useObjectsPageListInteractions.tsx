import { useCallback, type MouseEvent as ReactMouseEvent } from 'react'

import { useObjectsActionCatalog } from './useObjectsActionCatalog'
import { useObjectsContextMenu } from './useObjectsContextMenu'
import { useObjectsRowRenderers } from './useObjectsRowRenderers'

type ActionCatalogArgs = Parameters<typeof useObjectsActionCatalog>[0]
type ContextMenuArgs = Parameters<typeof useObjectsContextMenu>[0]
type RowRenderersArgs = Parameters<typeof useObjectsRowRenderers>[0]

type UseObjectsPageListInteractionsArgs = {
	actionCatalog: ActionCatalogArgs
	contextMenu: Omit<
		ContextMenuArgs,
		'getObjectActions' | 'getPrefixActions' | 'selectionContextMenuActions' | 'globalActionMap' | 'selectionActionMap'
	>
	rowRenderers: Omit<
		RowRenderersArgs,
		| 'contextMenuState'
		| 'withContextMenuClassName'
		| 'getPrefixActions'
		| 'getObjectActions'
		| 'selectionContextMenuActions'
		| 'recordContextMenuPoint'
		| 'openPrefixContextMenu'
		| 'openObjectContextMenu'
		| 'closeContextMenu'
	>
}

export function useObjectsPageListInteractions({ actionCatalog, contextMenu, rowRenderers }: UseObjectsPageListInteractionsArgs) {
	const catalog = useObjectsActionCatalog(actionCatalog)

	const context = useObjectsContextMenu({
		...contextMenu,
		getObjectActions: catalog.getObjectActions,
		getPrefixActions: catalog.getPrefixActions,
		selectionContextMenuActions: catalog.selectionContextMenuActions,
		globalActionMap: catalog.globalActionMap,
		selectionActionMap: catalog.selectionActionMap,
	})

	const renderers = useObjectsRowRenderers({
		...rowRenderers,
		contextMenuState: context.contextMenuState,
		withContextMenuClassName: context.withContextMenuClassName,
		getPrefixActions: catalog.getPrefixActions,
		getObjectActions: catalog.getObjectActions,
		selectionContextMenuActions: catalog.selectionContextMenuActions,
		recordContextMenuPoint: context.recordContextMenuPoint,
		openPrefixContextMenu: context.openPrefixContextMenu,
		openObjectContextMenu: context.openObjectContextMenu,
		closeContextMenu: context.closeContextMenu,
	})
	const { openPrefixContextMenu, recordContextMenuPoint } = context

	const handleTreePrefixContextMenu = useCallback(
		(event: ReactMouseEvent, nodeKey: string) => {
			const point = recordContextMenuPoint(event)
			openPrefixContextMenu(nodeKey, 'context', point)
		},
		[openPrefixContextMenu, recordContextMenuPoint],
	)

	return {
		...catalog,
		...context,
		...renderers,
		handleTreePrefixContextMenu,
	}
}

export type ObjectsPageListInteractionsState = ReturnType<typeof useObjectsPageListInteractions>
