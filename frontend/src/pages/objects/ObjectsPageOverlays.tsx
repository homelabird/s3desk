import { Suspense } from 'react'

import {
	ObjectsCommandPaletteModal,
	ObjectsCopyMoveModal,
	ObjectsCopyPrefixModal,
	ObjectsDeletePrefixConfirmModal,
	ObjectsDownloadPrefixModal,
	ObjectsFiltersDrawer,
	ObjectsGlobalSearchDrawer,
	ObjectsGoToPathModal,
	ObjectsNewFolderModal,
	ObjectsPresignModal,
	ObjectsRenameModal,
	ObjectsUploadFolderModal,
} from './objectsPageLazy'

type ObjectsFiltersDrawerProps = Parameters<typeof import('./ObjectsFiltersDrawer').ObjectsFiltersDrawer>[0]
type ObjectsPresignModalProps = Parameters<typeof import('./ObjectsPresignModal').ObjectsPresignModal>[0]
type ObjectsGoToPathModalProps = Parameters<typeof import('./ObjectsGoToPathModal').ObjectsGoToPathModal>[0]
type ObjectsCommandPaletteModalProps = Parameters<typeof import('./ObjectsCommandPaletteModal').ObjectsCommandPaletteModal>[0]
type ObjectsDeletePrefixConfirmModalProps = Parameters<
	typeof import('./ObjectsDeletePrefixConfirmModal').ObjectsDeletePrefixConfirmModal
>[0]
type ObjectsDownloadPrefixModalProps = Parameters<typeof import('./ObjectsDownloadPrefixModal').ObjectsDownloadPrefixModal>[0]
type ObjectsUploadFolderModalProps = Parameters<typeof import('./ObjectsUploadFolderModal').ObjectsUploadFolderModal>[0]
type ObjectsCopyPrefixModalProps = Parameters<typeof import('./ObjectsCopyPrefixModal').ObjectsCopyPrefixModal>[0]
type ObjectsCopyMoveModalProps = Parameters<typeof import('./ObjectsCopyMoveModal').ObjectsCopyMoveModal>[0]
type ObjectsNewFolderModalProps = Parameters<typeof import('./ObjectsNewFolderModal').ObjectsNewFolderModal>[0]
type ObjectsRenameModalProps = Parameters<typeof import('./ObjectsRenameModal').ObjectsRenameModal>[0]
type ObjectsGlobalSearchDrawerProps = Parameters<typeof import('./ObjectsGlobalSearchDrawer').ObjectsGlobalSearchDrawer>[0]

export type ObjectsPageOverlaysProps = {
	filtersDrawerProps: ObjectsFiltersDrawerProps | null
	presignModalProps: ObjectsPresignModalProps | null
	goToPathModalProps: ObjectsGoToPathModalProps | null
	commandPaletteModalProps: ObjectsCommandPaletteModalProps | null
	deletePrefixConfirmModalProps: ObjectsDeletePrefixConfirmModalProps | null
	downloadPrefixModalProps: ObjectsDownloadPrefixModalProps | null
	uploadFolderModalProps: ObjectsUploadFolderModalProps | null
	copyPrefixModalProps: ObjectsCopyPrefixModalProps | null
	copyMoveModalProps: ObjectsCopyMoveModalProps | null
	newFolderModalProps: ObjectsNewFolderModalProps | null
	renameModalProps: ObjectsRenameModalProps | null
	globalSearchDrawerProps: ObjectsGlobalSearchDrawerProps | null
}

export function ObjectsPageOverlays({
	filtersDrawerProps,
	presignModalProps,
	goToPathModalProps,
	commandPaletteModalProps,
	deletePrefixConfirmModalProps,
	downloadPrefixModalProps,
	uploadFolderModalProps,
	copyPrefixModalProps,
	copyMoveModalProps,
	newFolderModalProps,
	renameModalProps,
	globalSearchDrawerProps,
}: ObjectsPageOverlaysProps) {
	return (
		<Suspense fallback={null}>
			{filtersDrawerProps ? <ObjectsFiltersDrawer {...filtersDrawerProps} /> : null}

			{presignModalProps ? <ObjectsPresignModal {...presignModalProps} /> : null}

			{goToPathModalProps ? <ObjectsGoToPathModal {...goToPathModalProps} /> : null}

			{commandPaletteModalProps ? <ObjectsCommandPaletteModal {...commandPaletteModalProps} /> : null}

			{deletePrefixConfirmModalProps ? (
				<ObjectsDeletePrefixConfirmModal {...deletePrefixConfirmModalProps} />
			) : null}

			{downloadPrefixModalProps ? <ObjectsDownloadPrefixModal {...downloadPrefixModalProps} /> : null}

			{uploadFolderModalProps ? <ObjectsUploadFolderModal {...uploadFolderModalProps} /> : null}

			{copyPrefixModalProps ? <ObjectsCopyPrefixModal {...copyPrefixModalProps} /> : null}

			{copyMoveModalProps ? <ObjectsCopyMoveModal {...copyMoveModalProps} /> : null}

			{newFolderModalProps ? <ObjectsNewFolderModal {...newFolderModalProps} /> : null}

			{renameModalProps ? <ObjectsRenameModal {...renameModalProps} /> : null}

			{globalSearchDrawerProps ? <ObjectsGlobalSearchDrawer {...globalSearchDrawerProps} /> : null}
		</Suspense>
	)
}
