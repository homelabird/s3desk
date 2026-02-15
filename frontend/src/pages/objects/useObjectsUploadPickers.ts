import { message } from 'antd'
import { useCallback, useEffect, useRef, type ChangeEvent } from 'react'

import { getDevicePickerSupport } from '../../lib/deviceFs'

export function useObjectsUploadPickers(args: {
	isOffline: boolean
	uploadsEnabled: boolean
	uploadsDisabledReason?: string | null
	startUploadFromFiles: (files: File[]) => void
	openUploadFolderModal: () => void
}) {
	const { isOffline, uploadsEnabled, uploadsDisabledReason, startUploadFromFiles, openUploadFolderModal } = args
	const uploadFilesInputRef = useRef<HTMLInputElement | null>(null)
	const uploadFolderInputRef = useRef<HTMLInputElement | null>(null)

	useEffect(() => {
		const el = uploadFolderInputRef.current
		if (!el) return
		el.setAttribute('webkitdirectory', '')
		el.setAttribute('directory', '')
	}, [])

	const onUploadFilesInputChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			const files = Array.from(e.target.files ?? [])
			startUploadFromFiles(files)
			e.target.value = ''
		},
		[startUploadFromFiles],
	)

	const onUploadFolderInputChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			const files = Array.from(e.target.files ?? [])
			startUploadFromFiles(files)
			e.target.value = ''
		},
		[startUploadFromFiles],
	)

	const openUploadFilesPicker = useCallback(() => {
		if (isOffline) {
			message.warning('Offline: uploads are disabled.')
			return
		}
		if (!uploadsEnabled) {
			message.warning(uploadsDisabledReason ?? 'Uploads are not supported by this provider.')
			return
		}
		uploadFilesInputRef.current?.click()
	}, [isOffline, uploadsDisabledReason, uploadsEnabled])

	const openUploadFolderPicker = useCallback(() => {
		if (isOffline) {
			message.warning('Offline: uploads are disabled.')
			return
		}
		if (!uploadsEnabled) {
			message.warning(uploadsDisabledReason ?? 'Uploads are not supported by this provider.')
			return
		}
		const support = getDevicePickerSupport()
		if (support.ok) {
			openUploadFolderModal()
			return
		}
		uploadFolderInputRef.current?.click()
	}, [isOffline, openUploadFolderModal, uploadsDisabledReason, uploadsEnabled])

	return {
		uploadFilesInputRef,
		uploadFolderInputRef,
		onUploadFilesInputChange,
		onUploadFolderInputChange,
		openUploadFilesPicker,
		openUploadFolderPicker,
	}
}
