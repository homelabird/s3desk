import { message } from 'antd'
import { useCallback, useState } from 'react'

import { getDirectorySelectionSupport } from '../../lib/deviceFs'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { promptForFiles, promptForFolderFiles } from '../../components/transfers/transfersUploadUtils'

export function useObjectsUploadPickers(args: {
	isOffline: boolean
	uploadsEnabled: boolean
	uploadsDisabledReason?: string | null
	startUploadFromFiles: (args: { files: File[]; label?: string; directorySelectionMode?: 'picker' | 'input' }) => void
}) {
	const { isOffline, uploadsEnabled, uploadsDisabledReason, startUploadFromFiles } = args
	const [uploadSourceOpen, setUploadSourceOpen] = useState(false)
	const [uploadSourceBusy, setUploadSourceBusy] = useState(false)
	const directorySelectionSupport = getDirectorySelectionSupport()

	const ensureUploadAllowed = useCallback(() => {
		if (isOffline) {
			message.warning('Offline: uploads are disabled.')
			return false
		}
		if (!uploadsEnabled) {
			message.warning(uploadsDisabledReason ?? 'Uploads are not supported by this provider.')
			return false
		}
		return true
	}, [isOffline, uploadsDisabledReason, uploadsEnabled])

	const openUploadPicker = useCallback(() => {
		if (!ensureUploadAllowed()) return
		setUploadSourceOpen(true)
	}, [ensureUploadAllowed])

	const closeUploadSource = useCallback(() => {
		if (uploadSourceBusy) return
		setUploadSourceOpen(false)
	}, [uploadSourceBusy])

	const chooseUploadFiles = useCallback(async () => {
		if (!ensureUploadAllowed()) return
		setUploadSourceBusy(true)
		try {
			setUploadSourceOpen(false)
			const files = await promptForFiles({ multiple: true, directory: false })
			if (!files || files.length === 0) return
			startUploadFromFiles({ files })
		} catch (err) {
			message.error(formatErr(err))
		} finally {
			setUploadSourceBusy(false)
		}
	}, [ensureUploadAllowed, startUploadFromFiles])

	const chooseUploadFolder = useCallback(async () => {
		if (!ensureUploadAllowed()) return
		setUploadSourceBusy(true)
		try {
			setUploadSourceOpen(false)
			const result = await promptForFolderFiles()
			if (!result || result.files.length === 0) return
			startUploadFromFiles({ files: result.files, label: result.label, directorySelectionMode: result.mode })
		} catch (err) {
			message.error(formatErr(err))
		} finally {
			setUploadSourceBusy(false)
		}
	}, [ensureUploadAllowed, startUploadFromFiles])

	return {
		uploadSourceOpen,
		uploadSourceBusy,
		folderSelectionSupported: directorySelectionSupport.ok,
		folderSelectionReason: directorySelectionSupport.reason ?? null,
		openUploadPicker,
		closeUploadSource,
		chooseUploadFiles,
		chooseUploadFolder,
	}
}
