import { lazy } from 'react'

// Keep overlay and preview chunks out of the initial route until their UI opens.
export const ObjectsPageHeader = lazy(async () => {
	const m = await import('./ObjectsPageHeader')
	return { default: m.ObjectsPageHeader }
})
export const ObjectsTreeSection = lazy(async () => {
	const m = await import('./ObjectsTreeSection')
	return { default: m.ObjectsTreeSection }
})
export const ObjectsListControls = lazy(async () => {
	const m = await import('./ObjectsListControls')
	return { default: m.ObjectsListControls }
})
export const ObjectsListContent = lazy(async () => {
	const m = await import('./ObjectsListContent')
	return { default: m.ObjectsListContent }
})
export const ObjectsDetailsPanelSection = lazy(async () => {
	const m = await import('./ObjectsDetailsPanelSection')
	return { default: m.ObjectsDetailsPanelSection }
})
export const ObjectsContextMenuPortal = lazy(async () => {
	const m = await import('./ObjectsContextMenuPortal')
	return { default: m.ObjectsContextMenuPortal }
})
export const ObjectsImageViewerModal = lazy(async () => {
	const m = await import('./ObjectsImageViewerModal')
	return { default: m.ObjectsImageViewerModal }
})
export const ObjectsListHeader = lazy(async () => {
	const m = await import('./ObjectsListHeader')
	return { default: m.ObjectsListHeader }
})
export const ObjectsPageOverlays = lazy(async () => {
	const m = await import('./ObjectsPageOverlays')
	return { default: m.ObjectsPageOverlays }
})
