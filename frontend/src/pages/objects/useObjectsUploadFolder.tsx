import { useCallback, useState } from 'react'
import { message } from 'antd'

import type { TransfersContextValue } from '../../components/Transfers'
import { collectFilesFromDirectoryHandle } from '../../lib/deviceFs'
import { formatErrorWithHint as formatErr } from '../../lib/errors'

const MAX_UPLOAD_FOLDER_FILES = 5000

type UploadFolderValues = {
	localFolder: string
}

type UseObjectsUploadFolderArgs = {
	profileId: string | null
	bucket: string
	prefix: string
	uploadsEnabled: boolean
	uploadsDisabledReason?: string | null
	transfers: TransfersContextValue
}

export function useObjectsUploadFolder({
	profileId,
	bucket,
	prefix,
	uploadsEnabled,
	uploadsDisabledReason,
	transfers,
}: UseObjectsUploadFolderArgs) {
	const [uploadFolderOpen, setUploadFolderOpen] = useState(false)
	const [uploadFolderValues, setUploadFolderValues] = useState<UploadFolderValues>(() => ({ localFolder: '' }))
	const [uploadFolderHandle, setUploadFolderHandle] = useState<FileSystemDirectoryHandle | null>(null)
	const [uploadFolderLabel, setUploadFolderLabel] = useState('')
	const [uploadFolderSubmitting, setUploadFolderSubmitting] = useState(false)

	const openUploadFolderModal = useCallback(() => {
		if (!uploadsEnabled) {
			message.warning(uploadsDisabledReason ?? 'Uploads are not supported by this provider.')
			return
		}
		setUploadFolderHandle(null)
		setUploadFolderLabel('')
		setUploadFolderValues({ localFolder: '' })
		setUploadFolderOpen(true)
	}, [uploadsDisabledReason, uploadsEnabled])

	const handleUploadFolderPick = useCallback((handle: FileSystemDirectoryHandle) => {
		setUploadFolderHandle(handle)
		setUploadFolderLabel(handle.name)
	}, [])

	const handleUploadFolderCancel = useCallback(() => {
		setUploadFolderOpen(false)
		setUploadFolderHandle(null)
		setUploadFolderLabel('')
		setUploadFolderValues({ localFolder: '' })
	}, [])

	const handleUploadFolderSubmit = useCallback(
		async () => {
			if (!profileId) {
				message.info('Select a profile first')
				return
			}
			if (!bucket) {
				message.info('Select a bucket first')
				return
			}
			if (!uploadsEnabled) {
				message.warning(uploadsDisabledReason ?? 'Uploads are not supported by this provider.')
				return
			}
			if (!uploadFolderHandle) {
				message.info('Select a local folder first')
				return
			}

			setUploadFolderSubmitting(true)
			try {
				const files = await collectFilesFromDirectoryHandle(uploadFolderHandle, '', { maxFiles: MAX_UPLOAD_FOLDER_FILES })
				if (files.length === 0) {
					message.info('No files found in the selected folder')
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
				setUploadFolderOpen(false)
				setUploadFolderHandle(null)
				setUploadFolderLabel('')
				setUploadFolderValues({ localFolder: '' })
			} catch (err) {
				message.error(formatErr(err))
			} finally {
				setUploadFolderSubmitting(false)
			}
		},
		[
			bucket,
			prefix,
			profileId,
			transfers,
			uploadFolderHandle,
			uploadFolderLabel,
			uploadsDisabledReason,
			uploadsEnabled,
		],
	)

	return {
		uploadFolderOpen,
		uploadFolderValues,
		setUploadFolderValues,
		uploadFolderSubmitting,
		uploadFolderCanSubmit: !!uploadFolderHandle && uploadsEnabled,
		openUploadFolderModal,
		handleUploadFolderSubmit,
		handleUploadFolderCancel,
		handleUploadFolderPick,
	}
}
