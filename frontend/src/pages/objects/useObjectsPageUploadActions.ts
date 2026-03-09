import type { TransfersContextValue } from '../../components/Transfers'
import { useObjectsUploadDrop } from './useObjectsUploadDrop'
import { useObjectsUploadFolder } from './useObjectsUploadFolder'
import { useObjectsUploadPickers } from './useObjectsUploadPickers'

type Args = {
	profileId: string | null
	bucket: string
	prefix: string
	isOffline: boolean
	uploadSupported: boolean
	uploadDisabledReason?: string | null
	transfers: TransfersContextValue
	moveAfterUploadDefault: boolean
	cleanupEmptyDirsDefault: boolean
}

export function useObjectsPageUploadActions({
	profileId,
	bucket,
	prefix,
	isOffline,
	uploadSupported,
	uploadDisabledReason,
	transfers,
	moveAfterUploadDefault,
	cleanupEmptyDirsDefault,
}: Args) {
	const uploadDropActions = useObjectsUploadDrop({
		profileId,
		bucket,
		prefix,
		isOffline,
		uploadsEnabled: uploadSupported,
		uploadsDisabledReason: uploadDisabledReason,
		transfers,
	})

	const uploadFolderActions = useObjectsUploadFolder({
		profileId,
		bucket,
		prefix,
		uploadsEnabled: uploadSupported,
		uploadsDisabledReason: uploadDisabledReason,
		transfers,
		defaultMoveAfterUpload: moveAfterUploadDefault,
		defaultCleanupEmptyDirs: cleanupEmptyDirsDefault,
	})

	const uploadPickerActions = useObjectsUploadPickers({
		isOffline,
		uploadsEnabled: uploadSupported,
		uploadsDisabledReason: uploadDisabledReason,
		startUploadFromFiles: uploadDropActions.startUploadFromFiles,
		openUploadFolderModal: uploadFolderActions.openUploadFolderModal,
	})

	return {
		...uploadDropActions,
		...uploadFolderActions,
		...uploadPickerActions,
	}
}
