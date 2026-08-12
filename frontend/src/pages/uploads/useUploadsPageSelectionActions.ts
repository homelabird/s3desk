import { useMemo } from 'react'

import type { TransfersRuntimeApi } from '../../components/transfersTypes'
import { promptForFiles, promptForFolderFiles } from '../../components/transfers/transfersUploadUtils'
import {
	addFilesOrFolderFirstSentenceHint,
	noBucketSelectedLabel,
	offlineUploadsDisabledHint,
	selectBucketFirstSentenceHint,
	uploadsUnsupportedHint,
} from '../../lib/actionHints'
import { getDirectorySelectionSupport } from '../../lib/deviceFs'
import { inferUploadSelectionKind } from '../../lib/uploadSelection'
import { uploadsFeedback } from './uploadsFeedback'

type UseUploadsPageSelectionActionsArgs = {
	transfers: TransfersRuntimeApi
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
	const selectionKind = useMemo(() => inferUploadSelectionKind(props.selectedFiles), [props.selectedFiles])
	const folderSelectionSupport = getDirectorySelectionSupport()
	const queueDisabledReason = useMemo(() => {
		if (props.isOffline) return offlineUploadsDisabledHint()
		if (!props.uploadsSupported) return props.uploadsUnsupportedReason ?? uploadsUnsupportedHint()
		if (!props.bucket) return selectBucketFirstSentenceHint()
		if (selectedFileCount === 0) return addFilesOrFolderFirstSentenceHint()
		return null
	}, [props.bucket, props.isOffline, props.uploadsSupported, props.uploadsUnsupportedReason, selectedFileCount])

	const canQueueUpload = !props.isOffline && props.uploadsSupported && !!props.bucket && props.selectedFiles.length > 0
	const canOpenPicker = !props.isOffline && props.uploadsSupported && !!props.bucket
	const normalizedPrefix = props.prefix.trim().replace(/^\/+/, '')
	const destinationLabel = props.bucket ? `s3://${props.bucket}${normalizedPrefix ? `/${normalizedPrefix}` : '/'}` : noBucketSelectedLabel()

	const clearSelection = () => {
		props.setSelectedFiles([])
		props.setSelectedFolderLabel('')
		props.setSelectedDirectorySelectionMode(undefined)
	}

	const queueUpload = () => {
		if (props.isOffline) {
			uploadsFeedback.offlineUploadsDisabled()
			return
		}
		if (!props.uploadsSupported) {
			uploadsFeedback.uploadsUnsupported(props.uploadsUnsupportedReason)
			return
		}
		if (!props.bucket) {
			uploadsFeedback.selectBucketFirst()
			return
		}
		if (props.selectedFiles.length === 0) {
			uploadsFeedback.addFilesOrFolderFirst()
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
			uploadsFeedback.offlineUploadsDisabled()
			return
		}
		if (!props.uploadsSupported) {
			uploadsFeedback.uploadsUnsupported(props.uploadsUnsupportedReason)
			return
		}
		if (!props.bucket) {
			uploadsFeedback.selectBucketFirst()
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
			uploadsFeedback.error(err)
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
			uploadsFeedback.error(err)
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
		canOpenPicker,
		destinationLabel,
		clearSelection,
		queueUpload,
		openUploadPicker,
		chooseUploadFiles,
		chooseUploadFolder,
	}
}

export type UploadsPageSelectionActions = ReturnType<typeof useUploadsPageSelectionActions>
