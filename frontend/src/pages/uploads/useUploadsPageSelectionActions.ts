import { message } from 'antd'
import { useMemo } from 'react'

import type { TransfersContextValue } from '../../components/Transfers'
import { promptForFiles, promptForFolderFiles } from '../../components/transfers/transfersUploadUtils'
import { getDirectorySelectionSupport } from '../../lib/deviceFs'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { inferUploadSelectionKind } from '../../lib/uploadSelection'

type UseUploadsPageSelectionActionsArgs = {
	transfers: TransfersContextValue
	isOffline: boolean
	profileId: string | null
	uploadsSupported: boolean
	uploadsUnsupportedReason: string | null | undefined
	bucket: string
	prefix: string
	selectedFiles: File[]
	selectedFolderLabel: string
	selectedDirectorySelectionMode: 'picker' | 'input' | undefined
	setSelectedFiles: (files: File[]) => void
	setSelectedFolderLabel: (label: string) => void
	setSelectedDirectorySelectionMode: (mode: 'picker' | 'input' | undefined) => void
	setUploadSourceOpen: (open: boolean) => void
	setUploadSourceBusy: (busy: boolean) => void
}

export function useUploadsPageSelectionActions(props: UseUploadsPageSelectionActionsArgs) {
	const selectedFileCount = props.selectedFiles.length
	const selectionKind = inferUploadSelectionKind(props.selectedFiles)
	const folderSelectionSupport = getDirectorySelectionSupport()
	const queueDisabledReason = useMemo(() => {
		if (props.isOffline) return 'Offline: uploads are disabled.'
		if (!props.uploadsSupported) return props.uploadsUnsupportedReason ?? 'Uploads are not supported by this provider.'
		if (!props.bucket) return 'Select a bucket first.'
		if (selectedFileCount === 0) return 'Add files or a folder first.'
		return null
	}, [props.bucket, props.isOffline, props.uploadsSupported, props.uploadsUnsupportedReason, selectedFileCount])

	const canQueueUpload = !props.isOffline && props.uploadsSupported && !!props.bucket && props.selectedFiles.length > 0
	const normalizedPrefix = props.prefix.trim().replace(/^\/+/, '')
	const destinationLabel = props.bucket ? `s3://${props.bucket}${normalizedPrefix ? `/${normalizedPrefix}` : '/'}` : 'No bucket selected'

	const clearSelection = () => {
		props.setSelectedFiles([])
		props.setSelectedFolderLabel('')
		props.setSelectedDirectorySelectionMode(undefined)
	}

	const queueUpload = () => {
		if (props.isOffline) {
			message.warning('Offline: uploads are disabled.')
			return
		}
		if (!props.uploadsSupported) {
			message.warning(props.uploadsUnsupportedReason ?? 'Uploads are not supported by this provider.')
			return
		}
		if (!props.bucket) {
			message.info('Select a bucket first')
			return
		}
		if (props.selectedFiles.length === 0) {
			message.info('Add files or a folder first')
			return
		}
		props.transfers.queueUploadFiles({
			profileId: props.profileId!,
			bucket: props.bucket,
			prefix: props.prefix,
			files: props.selectedFiles,
			label: props.selectedFolderLabel || undefined,
			directorySelectionMode: props.selectedDirectorySelectionMode,
		})
		clearSelection()
	}

	const openUploadPicker = () => {
		if (props.isOffline) {
			message.warning('Offline: uploads are disabled.')
			return
		}
		if (!props.uploadsSupported) {
			message.warning(props.uploadsUnsupportedReason ?? 'Uploads are not supported by this provider.')
			return
		}
		props.setUploadSourceOpen(true)
	}

	const chooseUploadFiles = async () => {
		props.setUploadSourceBusy(true)
		try {
			props.setUploadSourceOpen(false)
			const files = await promptForFiles({ multiple: true, directory: false })
			if (!files || files.length === 0) return
			props.setSelectedFiles(files)
			props.setSelectedFolderLabel('')
			props.setSelectedDirectorySelectionMode(undefined)
		} catch (err) {
			message.error(formatErr(err))
		} finally {
			props.setUploadSourceBusy(false)
		}
	}

	const chooseUploadFolder = async () => {
		props.setUploadSourceBusy(true)
		try {
			props.setUploadSourceOpen(false)
			const result = await promptForFolderFiles()
			if (!result || result.files.length === 0) return
			props.setSelectedFiles(result.files)
			props.setSelectedFolderLabel(result.label ?? '')
			props.setSelectedDirectorySelectionMode(result.mode)
		} catch (err) {
			message.error(formatErr(err))
		} finally {
			props.setUploadSourceBusy(false)
		}
	}

	return {
		selectedFileCount,
		selectionKind,
		folderSelectionSupport,
		queueDisabledReason,
		canQueueUpload,
		destinationLabel,
		clearSelection,
		queueUpload,
		openUploadPicker,
		chooseUploadFiles,
		chooseUploadFolder,
	}
}

export type UploadsPageSelectionActions = ReturnType<typeof useUploadsPageSelectionActions>
