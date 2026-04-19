import type { TransfersContextValue } from '../../components/Transfers'
import { useUploadsPageScopedStorageState } from './useUploadsPageScopedStorageState'
import { useUploadsPageSelectionActions } from './useUploadsPageSelectionActions'

type UseUploadsPageSelectionStateArgs = {
	transfers: TransfersContextValue
	isOffline: boolean
	apiToken: string
	profileId: string | null
	uploadsSupported: boolean
	uploadsUnsupportedReason: string | null | undefined
}

export function useUploadsPageSelectionState(props: UseUploadsPageSelectionStateArgs) {
	const scopedStorageState = useUploadsPageScopedStorageState({
		apiToken: props.apiToken,
		profileId: props.profileId,
	})

	const selectionActions = useUploadsPageSelectionActions({
		transfers: props.transfers,
		isOffline: props.isOffline,
		profileId: props.profileId,
		uploadsSupported: props.uploadsSupported,
		uploadsUnsupportedReason: props.uploadsUnsupportedReason,
		bucket: scopedStorageState.bucket,
		prefix: scopedStorageState.prefix,
		selectedFiles: scopedStorageState.selectedFiles,
		selectedFolderLabel: scopedStorageState.selectedFolderLabel,
		selectedDirectorySelectionMode: scopedStorageState.selectedDirectorySelectionMode,
		setSelectedFiles: scopedStorageState.setSelectedFiles,
		setSelectedFolderLabel: scopedStorageState.setSelectedFolderLabel,
		setSelectedDirectorySelectionMode: scopedStorageState.setSelectedDirectorySelectionMode,
		setUploadSourceOpen: scopedStorageState.setUploadSourceOpen,
		setUploadSourceBusy: scopedStorageState.setUploadSourceBusy,
	})

	return {
		bucket: scopedStorageState.bucket,
		setBucket: scopedStorageState.setBucket,
		prefix: scopedStorageState.prefix,
		setPrefix: scopedStorageState.setPrefix,
		selectedFiles: scopedStorageState.selectedFiles,
		uploadSourceOpen: scopedStorageState.uploadSourceOpen,
		setUploadSourceOpen: scopedStorageState.setUploadSourceOpen,
		uploadSourceBusy: scopedStorageState.uploadSourceBusy,
		...selectionActions,
	}
}

export type UploadsPageSelectionState = ReturnType<typeof useUploadsPageSelectionState>
