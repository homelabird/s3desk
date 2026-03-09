import type { ObjectsPageActionsState } from './useObjectsPageActions'
import type { ObjectsScreenPreviewState } from './useObjectsScreenPreviewState'

export type ObjectsPageScreenProps = {
	apiToken: string
	profileId: string | null
}

export type ObjectsPageDataState = ReturnType<typeof import('./useObjectsPageData').useObjectsPageData>
export type ObjectsViewportState = ReturnType<typeof import('./useObjectsListViewport').useObjectsListViewport>

export type ObjectsScreenArgs = {
	props: ObjectsPageScreenProps
	data: ObjectsPageDataState
	actions: ObjectsPageActionsState
	previewState: ObjectsScreenPreviewState
	viewportState: ObjectsViewportState
	refresh: () => Promise<void>
}
