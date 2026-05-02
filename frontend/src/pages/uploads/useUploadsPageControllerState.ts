import type { APIClientShape } from '../../api/client'
import type { TransfersContextValue } from '../../components/transfersTypes'
import { useUploadsPageQueriesState } from './useUploadsPageQueriesState'
import { useUploadsPageSelectionState } from './useUploadsPageSelectionState'

type UseUploadsPageControllerStateArgs = {
	api: APIClientShape
	transfers: TransfersContextValue
	isOffline: boolean
	apiToken: string
	profileId: string | null
}

export function useUploadsPageControllerState(props: UseUploadsPageControllerStateArgs) {
	const {
		selectedProfile,
		uploadsSupported,
		uploadsUnsupportedReason,
		bucketsQuery,
		bucketOptions,
		showBucketsEmpty,
	} = useUploadsPageQueriesState({
		api: props.api,
		apiToken: props.apiToken,
		profileId: props.profileId,
	})

	const selectionState = useUploadsPageSelectionState({
		transfers: props.transfers,
		isOffline: props.isOffline,
		apiToken: props.apiToken,
		profileId: props.profileId,
		uploadsSupported,
		uploadsUnsupportedReason,
	})

	return {
		transfers: props.transfers,
		isOffline: props.isOffline,
		selectedProfile,
		uploadsSupported,
		uploadsUnsupportedReason,
		bucketsQuery,
		bucketOptions,
		showBucketsEmpty,
		...selectionState,
	}
}

export type UploadsPageControllerState = ReturnType<typeof useUploadsPageControllerState>
