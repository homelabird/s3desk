import type { ObjectsScreenArgs } from './objectsScreenTypes'
import { useObjectsScreenList } from './useObjectsScreenList'
import { useObjectsScreenOverlays } from './useObjectsScreenOverlays'
import { useObjectsScreenPanes } from './useObjectsScreenPanes'
import { useObjectsScreenToolbar } from './useObjectsScreenToolbar'

export function useObjectsScreenComposition({
	props,
	locationVm,
	listVm,
	selectionVm,
	operationVm,
	paneVm,
	actions,
	previewState,
	viewportState,
	refresh,
}: ObjectsScreenArgs) {
	const listState = useObjectsScreenList({
		props,
		locationVm,
		listVm,
		selectionVm,
		operationVm,
		paneVm,
		actions,
		previewState,
		viewportState,
		refresh,
	})
	const { toolbarSectionProps, canCreateFolder, createFolderTooltipText } = useObjectsScreenToolbar({
		props,
		locationVm,
		listVm,
		selectionVm,
		operationVm,
		paneVm,
		actions,
		refresh,
		listState,
	})
	const overlaysProps = useObjectsScreenOverlays({
		props,
		locationVm,
		listVm,
		selectionVm,
		operationVm,
		paneVm,
		actions,
		listState,
	})
	const panesProps = useObjectsScreenPanes({
		props,
		locationVm,
		listVm,
		selectionVm,
		operationVm,
		paneVm,
		actions,
		previewState,
		viewportState,
		listState,
		canCreateFolder,
		createFolderTooltipText,
	})

	return {
		toolbarSectionProps,
		onDownload: listState.onDownload,
		onPresign: listState.onPresign,
		overlaysProps,
		panesProps,
	}
}
