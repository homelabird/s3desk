import type { TransfersContextValue } from '../../components/Transfers'
import { useObjectsUploadDrop } from './useObjectsUploadDrop'
import { useObjectsUploadPickers } from './useObjectsUploadPickers'

type Args = {
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
	isOffline: boolean
	uploadSupported: boolean
	uploadDisabledReason?: string | null
	transfers: TransfersContextValue
}

export function useObjectsPageUploadActions({
	apiToken,
	profileId,
	bucket,
	prefix,
	isOffline,
	uploadSupported,
	uploadDisabledReason,
	transfers,
}: Args) {
	const uploadDropActions = useObjectsUploadDrop({
		apiToken,
		profileId,
		bucket,
		prefix,
		isOffline,
		uploadsEnabled: uploadSupported,
		uploadsDisabledReason: uploadDisabledReason,
		transfers,
	})

	const uploadPickerActions = useObjectsUploadPickers({
		apiToken,
		profileId,
		bucket,
		prefix,
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
