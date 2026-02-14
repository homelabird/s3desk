import { lazy } from 'react'

export const ObjectsCommandPaletteModal = lazy(async () => {
	const m = await import('./ObjectsCommandPaletteModal')
	return { default: m.ObjectsCommandPaletteModal }
})
export const ObjectsCopyMoveModal = lazy(async () => {
	const m = await import('./ObjectsCopyMoveModal')
	return { default: m.ObjectsCopyMoveModal }
})
export const ObjectsCopyPrefixModal = lazy(async () => {
	const m = await import('./ObjectsCopyPrefixModal')
	return { default: m.ObjectsCopyPrefixModal }
})
export const ObjectsDeletePrefixConfirmModal = lazy(async () => {
	const m = await import('./ObjectsDeletePrefixConfirmModal')
	return { default: m.ObjectsDeletePrefixConfirmModal }
})
export const ObjectsDownloadPrefixModal = lazy(async () => {
	const m = await import('./ObjectsDownloadPrefixModal')
	return { default: m.ObjectsDownloadPrefixModal }
})
export const ObjectsUploadFolderModal = lazy(async () => {
	const m = await import('./ObjectsUploadFolderModal')
	return { default: m.ObjectsUploadFolderModal }
})
export const ObjectsFiltersDrawer = lazy(async () => {
	const m = await import('./ObjectsFiltersDrawer')
	return { default: m.ObjectsFiltersDrawer }
})
export const ObjectsGlobalSearchDrawer = lazy(async () => {
	const m = await import('./ObjectsGlobalSearchDrawer')
	return { default: m.ObjectsGlobalSearchDrawer }
})
export const ObjectsGoToPathModal = lazy(async () => {
	const m = await import('./ObjectsGoToPathModal')
	return { default: m.ObjectsGoToPathModal }
})
export const ObjectsNewFolderModal = lazy(async () => {
	const m = await import('./ObjectsNewFolderModal')
	return { default: m.ObjectsNewFolderModal }
})
export const ObjectsPresignModal = lazy(async () => {
	const m = await import('./ObjectsPresignModal')
	return { default: m.ObjectsPresignModal }
})
export const ObjectsRenameModal = lazy(async () => {
	const m = await import('./ObjectsRenameModal')
	return { default: m.ObjectsRenameModal }
})
export const ObjectsToolbarSection = lazy(async () => {
	const m = await import('./ObjectsToolbarSection')
	return { default: m.ObjectsToolbarSection }
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
