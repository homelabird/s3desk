import { useLayoutEffect, useMemo, useRef } from 'react'

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
	const { setUploadSourceBusy, setUploadSourceOpen } = props
	const currentScopeKey = `${props.profileId ?? ''}:${props.bucket}:${props.prefix}:${props.isOffline}:${props.uploadsSupported}`
	const currentScopeKeyRef = useRef(currentScopeKey)
	const selectionVersionRef = useRef(0)
	const folderAbortControllerRef = useRef<AbortController | null>(null)
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

	useLayoutEffect(() => {
		const scopeChanged = currentScopeKeyRef.current !== currentScopeKey
		currentScopeKeyRef.current = currentScopeKey
		selectionVersionRef.current += 1
		folderAbortControllerRef.current?.abort()
		folderAbortControllerRef.current = null
		if (scopeChanged) {
			setUploadSourceOpen(false)
			setUploadSourceBusy(false)
		}
		return () => {
			selectionVersionRef.current += 1
			folderAbortControllerRef.current?.abort()
			folderAbortControllerRef.current = null
		}
	}, [currentScopeKey, setUploadSourceBusy, setUploadSourceOpen])

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
		selectionVersionRef.current += 1
		folderAbortControllerRef.current?.abort()
		folderAbortControllerRef.current = null
		props.setUploadSourceBusy(false)
		props.setUploadSourceOpen(true)
	}

	const closeUploadSource = () => {
		selectionVersionRef.current += 1
		folderAbortControllerRef.current?.abort()
		folderAbortControllerRef.current = null
		props.setUploadSourceBusy(false)
		props.setUploadSourceOpen(false)
	}

	const chooseUploadFiles = async () => {
		const selectionVersion = selectionVersionRef.current + 1
		selectionVersionRef.current = selectionVersion
		const scopeKey = currentScopeKey
		folderAbortControllerRef.current?.abort()
		folderAbortControllerRef.current = null
		props.setUploadSourceBusy(true)
		try {
			props.setUploadSourceOpen(false)
			const files = await promptForFiles({ multiple: true, directory: false })
			if (selectionVersionRef.current !== selectionVersion || currentScopeKeyRef.current !== scopeKey) return
			if (!files || files.length === 0) return
			props.setSelectedFiles(files)
			props.setSelectedFolderLabel('')
			props.setSelectedDirectorySelectionMode(undefined)
		} catch (err) {
			if (selectionVersionRef.current !== selectionVersion || currentScopeKeyRef.current !== scopeKey) return
			uploadsFeedback.error(err)
		} finally {
			if (selectionVersionRef.current === selectionVersion && currentScopeKeyRef.current === scopeKey) {
				props.setUploadSourceBusy(false)
			}
		}
	}

	const chooseUploadFolder = async () => {
		const selectionVersion = selectionVersionRef.current + 1
		selectionVersionRef.current = selectionVersion
		const scopeKey = currentScopeKey
		folderAbortControllerRef.current?.abort()
		const controller = new AbortController()
		folderAbortControllerRef.current = controller
		props.setUploadSourceBusy(true)
		props.setUploadSourceOpen(true)
		try {
			const result = await promptForFolderFiles({ signal: controller.signal })
			if (controller.signal.aborted) return
			if (selectionVersionRef.current !== selectionVersion || currentScopeKeyRef.current !== scopeKey) return
			if (!result || result.files.length === 0) return
			props.setSelectedFiles(result.files)
			props.setSelectedFolderLabel(result.label ?? '')
			props.setSelectedDirectorySelectionMode(result.mode)
		} catch (err) {
			if (controller.signal.aborted) return
			if (selectionVersionRef.current !== selectionVersion || currentScopeKeyRef.current !== scopeKey) return
			if ((err as Error)?.name === 'AbortError') return
			uploadsFeedback.error(err)
		} finally {
			if (folderAbortControllerRef.current === controller) {
				folderAbortControllerRef.current = null
			}
			if (selectionVersionRef.current === selectionVersion && currentScopeKeyRef.current === scopeKey) {
				props.setUploadSourceBusy(false)
				props.setUploadSourceOpen(false)
			}
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
		closeUploadSource,
		chooseUploadFiles,
		chooseUploadFolder,
	}
}

export type UploadsPageSelectionActions = ReturnType<typeof useUploadsPageSelectionActions>
