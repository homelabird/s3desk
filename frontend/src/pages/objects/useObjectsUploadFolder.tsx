import { useCallback, useState } from 'react'
import { message } from 'antd'

import type { TransfersContextValue } from '../../components/Transfers'
import { collectFilesFromDirectoryHandle, normalizeRelativePath } from '../../lib/deviceFs'
import { formatErrorWithHint as formatErr } from '../../lib/errors'

type UploadFolderValues = {
	localFolder: string
	moveAfterUpload: boolean
	cleanupEmptyDirs: boolean
}

type UseObjectsUploadFolderArgs = {
	profileId: string | null
	bucket: string
	prefix: string
	uploadsEnabled: boolean
	uploadsDisabledReason?: string | null
	transfers: TransfersContextValue
	defaultMoveAfterUpload: boolean
	defaultCleanupEmptyDirs: boolean
}

export function useObjectsUploadFolder({
	profileId,
	bucket,
	prefix,
	uploadsEnabled,
	uploadsDisabledReason,
	transfers,
	defaultMoveAfterUpload,
	defaultCleanupEmptyDirs,
}: UseObjectsUploadFolderArgs) {
	const [uploadFolderOpen, setUploadFolderOpen] = useState(false)
	const [uploadFolderValues, setUploadFolderValues] = useState<UploadFolderValues>(() => ({
		localFolder: '',
		moveAfterUpload: defaultMoveAfterUpload,
		cleanupEmptyDirs: defaultCleanupEmptyDirs,
	}))
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
		setUploadFolderValues({
			localFolder: '',
			moveAfterUpload: defaultMoveAfterUpload,
			cleanupEmptyDirs: defaultCleanupEmptyDirs,
		})
		setUploadFolderOpen(true)
	}, [defaultCleanupEmptyDirs, defaultMoveAfterUpload, uploadsDisabledReason, uploadsEnabled])

	const handleUploadFolderPick = useCallback((handle: FileSystemDirectoryHandle) => {
		setUploadFolderHandle(handle)
		setUploadFolderLabel(handle.name)
	}, [])

	const handleUploadFolderCancel = useCallback(() => {
		setUploadFolderOpen(false)
		setUploadFolderHandle(null)
		setUploadFolderLabel('')
		setUploadFolderValues({
			localFolder: '',
			moveAfterUpload: defaultMoveAfterUpload,
			cleanupEmptyDirs: defaultCleanupEmptyDirs,
		})
	}, [defaultCleanupEmptyDirs, defaultMoveAfterUpload])

	const handleUploadFolderSubmit = useCallback(
		async (values: UploadFolderValues) => {
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
				const files = await collectFilesFromDirectoryHandle(uploadFolderHandle)
				if (files.length === 0) {
					message.info('No files found in the selected folder')
					return
				}
				const relPaths = files
					.map((file) => {
						const fileWithPath = file as File & { relativePath?: string; webkitRelativePath?: string }
						const relPath = (fileWithPath.relativePath ?? fileWithPath.webkitRelativePath ?? file.name).trim()
						return normalizeRelativePath(relPath || file.name)
					})
					.filter(Boolean)

				const label = uploadFolderLabel || uploadFolderHandle.name
				transfers.queueUploadFiles({
					profileId,
					bucket,
					prefix,
					files,
					label,
					moveSource: values.moveAfterUpload
						? {
							rootHandle: uploadFolderHandle,
							relPaths,
							label,
							cleanupEmptyDirs: values.cleanupEmptyDirs,
						}
						: undefined,
				})
				transfers.openTransfers('uploads')
				setUploadFolderOpen(false)
				setUploadFolderHandle(null)
				setUploadFolderLabel('')
				setUploadFolderValues({
					localFolder: '',
					moveAfterUpload: defaultMoveAfterUpload,
					cleanupEmptyDirs: defaultCleanupEmptyDirs,
				})
			} catch (err) {
				message.error(formatErr(err))
			} finally {
				setUploadFolderSubmitting(false)
			}
		},
		[
			bucket,
			defaultCleanupEmptyDirs,
			defaultMoveAfterUpload,
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
