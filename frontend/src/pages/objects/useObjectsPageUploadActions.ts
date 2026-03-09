import type { TransfersContextValue } from '../../components/Transfers'
import { useObjectsUploadDrop } from './useObjectsUploadDrop'
import { useObjectsUploadPickers } from './useObjectsUploadPickers'

type Args = {
	profileId: string | null
	bucket: string
	prefix: string
	isOffline: boolean
	uploadSupported: boolean
	uploadDisabledReason?: string | null
	transfers: TransfersContextValue
}

export function useObjectsPageUploadActions({
	profileId,
	bucket,
	prefix,
	isOffline,
	uploadSupported,
	uploadDisabledReason,
	transfers,
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

	const uploadPickerActions = useObjectsUploadPickers({
		isOffline,
		uploadsEnabled: uploadSupported,
		uploadsDisabledReason: uploadDisabledReason,
		startUploadFromFiles: uploadDropActions.startUploadFromFiles,
	})

	return {
		...uploadDropActions,
		...uploadPickerActions,
	}
}
