import type {
	ObjectsListVm,
	ObjectsLocationVm,
	ObjectsOperationVm,
	ObjectsPaneVm,
	ObjectsSelectionVm,
} from './buildObjectsPageDataState'
import type { ObjectsListViewportState } from './useObjectsListViewport'
import type { ObjectsPageActionsState } from './useObjectsPageActions'
import type { ObjectsScreenPreviewState } from './useObjectsScreenPreviewState'

export type {
	ObjectsListVm,
	ObjectsLocationVm,
	ObjectsOperationVm,
	ObjectsPageDataState,
	ObjectsPaneVm,
	ObjectsSelectionVm,
} from './buildObjectsPageDataState'

export type ObjectsPageScreenProps = {
	apiToken: string
	profileId: string | null
}

export type ObjectsViewportState = ObjectsListViewportState

export type ObjectsScreenViewModels = {
	locationVm: ObjectsLocationVm
	listVm: ObjectsListVm
	selectionVm: ObjectsSelectionVm
	operationVm: ObjectsOperationVm
	paneVm: ObjectsPaneVm
}

export type ObjectsScreenArgs = ObjectsScreenViewModels & {
	props: ObjectsPageScreenProps
	actions: ObjectsPageActionsState
	previewState: ObjectsScreenPreviewState
	viewportState: ObjectsViewportState
	refresh: () => Promise<void>
}
