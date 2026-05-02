import { useCallback, useEffect, useRef, useState } from 'react'

import type { TransfersContextValue } from '../../components/transfersTypes'
import { collectFilesFromDirectoryHandle } from '../../lib/deviceFs'
import { objectsFeedback } from './objectsFeedback'

const MAX_UPLOAD_FOLDER_FILES = 5000

type UploadFolderValues = {
	localFolder: string
}

type UseObjectsUploadFolderArgs = {
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
	uploadsEnabled: boolean
	uploadsDisabledReason?: string | null
	transfers: TransfersContextValue
}

export function useObjectsUploadFolder({
	apiToken,
	profileId,
	bucket,
	prefix,
	uploadsEnabled,
	uploadsDisabledReason,
	transfers,
}: UseObjectsUploadFolderArgs) {
	const currentScopeKey = `${apiToken}:${profileId ?? ''}:${bucket}:${prefix}`
	const [uploadFolderOpen, setUploadFolderOpen] = useState(false)
	const [uploadFolderValues, setUploadFolderValues] = useState<UploadFolderValues>(() => ({ localFolder: '' }))
	const [uploadFolderHandle, setUploadFolderHandle] = useState<FileSystemDirectoryHandle | null>(null)
	const [uploadFolderLabel, setUploadFolderLabel] = useState('')
	const [uploadFolderSubmitting, setUploadFolderSubmitting] = useState(false)
	const [uploadFolderScopeKey, setUploadFolderScopeKey] = useState(currentScopeKey)
	const requestTokenRef = useRef(0)
	const uploadFolderScopeMatches = uploadFolderScopeKey === currentScopeKey

	const resetUploadFolderState = useCallback(() => {
		setUploadFolderHandle(null)
		setUploadFolderLabel('')
		setUploadFolderValues({ localFolder: '' })
		setUploadFolderSubmitting(false)
	}, [])

	useEffect(() => {
		requestTokenRef.current += 1
	}, [apiToken, bucket, prefix, profileId, uploadsEnabled])

	const openUploadFolderModal = useCallback(() => {
		if (!uploadsEnabled) {
			objectsFeedback.uploadsUnsupported(uploadsDisabledReason)
			return
		}
		setUploadFolderScopeKey(currentScopeKey)
		requestTokenRef.current += 1
		resetUploadFolderState()
		setUploadFolderOpen(true)
	}, [currentScopeKey, resetUploadFolderState, uploadsDisabledReason, uploadsEnabled])

	const handleUploadFolderPick = useCallback((handle: FileSystemDirectoryHandle) => {
		setUploadFolderHandle(handle)
		setUploadFolderLabel(handle.name)
	}, [])

	const handleUploadFolderCancel = useCallback(() => {
		setUploadFolderScopeKey(currentScopeKey)
		requestTokenRef.current += 1
		setUploadFolderOpen(false)
		resetUploadFolderState()
	}, [currentScopeKey, resetUploadFolderState])

	const handleUploadFolderSubmit = useCallback(
		async () => {
			if (!uploadFolderScopeMatches) return
			if (!profileId) {
				objectsFeedback.selectProfileFirst()
				return
			}
			if (!bucket) {
				objectsFeedback.selectBucketFirst()
				return
			}
			if (!uploadsEnabled) {
				objectsFeedback.uploadsUnsupported(uploadsDisabledReason)
				return
			}
			if (!uploadFolderHandle) {
				objectsFeedback.selectLocalFolderFirst()
				return
			}

			const requestToken = requestTokenRef.current + 1
			requestTokenRef.current = requestToken
			setUploadFolderSubmitting(true)
			try {
				const files = await collectFilesFromDirectoryHandle(uploadFolderHandle, '', { maxFiles: MAX_UPLOAD_FOLDER_FILES })
				if (requestTokenRef.current !== requestToken) return
				if (files.length === 0) {
					objectsFeedback.noFilesFoundInSelectedFolder()
					return
				}
				const label = uploadFolderLabel || uploadFolderHandle.name
				transfers.queueUploadFiles({
					profileId,
					bucket,
					prefix,
					files,
					label,
					directorySelectionMode: 'picker',
				})
				transfers.openTransfers('uploads')
				if (requestTokenRef.current !== requestToken) return
				setUploadFolderScopeKey(currentScopeKey)
				setUploadFolderOpen(false)
				resetUploadFolderState()
			} catch (err) {
				if (requestTokenRef.current !== requestToken) return
				objectsFeedback.error(err)
			} finally {
				if (requestTokenRef.current === requestToken) {
					setUploadFolderSubmitting(false)
				}
			}
		},
		[
			bucket,
			currentScopeKey,
			prefix,
			profileId,
			resetUploadFolderState,
			transfers,
			uploadFolderHandle,
			uploadFolderLabel,
			uploadFolderScopeMatches,
			uploadsDisabledReason,
			uploadsEnabled,
		],
	)

	return {
		uploadFolderOpen: uploadFolderScopeMatches ? uploadFolderOpen : false,
		uploadFolderValues: uploadFolderScopeMatches ? uploadFolderValues : { localFolder: '' },
		setUploadFolderValues,
		uploadFolderSubmitting: uploadFolderScopeMatches ? uploadFolderSubmitting : false,
		uploadFolderCanSubmit: uploadFolderScopeMatches && !!uploadFolderHandle && uploadsEnabled,
		openUploadFolderModal,
		handleUploadFolderSubmit,
		handleUploadFolderCancel,
		handleUploadFolderPick,
	}
}
