import { message } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getDirectorySelectionSupport } from '../../lib/deviceFs'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { promptForFiles, promptForFolderFiles } from '../../components/transfers/transfersUploadUtils'

export function useObjectsUploadPickers(args: {
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
	isOffline: boolean
	uploadsEnabled: boolean
	uploadsDisabledReason?: string | null
	startUploadFromFiles: (args: { files: File[]; label?: string; directorySelectionMode?: 'picker' | 'input' }) => void
}) {
	const { apiToken, profileId, bucket, prefix, isOffline, uploadsEnabled, uploadsDisabledReason, startUploadFromFiles } = args
	const [uploadSourceOpen, setUploadSourceOpen] = useState(false)
	const [uploadSourceBusy, setUploadSourceBusy] = useState(false)
	const [uploadSourceScopeKey, setUploadSourceScopeKey] = useState('')
	const currentScopeKey = `${apiToken}:${profileId ?? ''}:${bucket}:${prefix}`
	const currentScopeKeyRef = useRef(currentScopeKey)
	const scopeVersionRef = useRef(0)
	const uploadSourceOpenVisible = uploadSourceOpen && uploadSourceScopeKey === currentScopeKey
	const uploadSourceBusyVisible = uploadSourceBusy && uploadSourceScopeKey === currentScopeKey
	const directorySelectionSupport = getDirectorySelectionSupport()

	useEffect(() => {
		currentScopeKeyRef.current = currentScopeKey
		scopeVersionRef.current += 1
	}, [currentScopeKey])

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
		setUploadSourceScopeKey(currentScopeKey)
		setUploadSourceOpen(true)
	}, [currentScopeKey, ensureUploadAllowed])

	const closeUploadSource = useCallback(() => {
		if (uploadSourceBusyVisible) return
		setUploadSourceOpen(false)
		setUploadSourceScopeKey('')
	}, [uploadSourceBusyVisible])

	const chooseUploadFiles = useCallback(async () => {
		if (!ensureUploadAllowed()) return
		const scopeVersion = scopeVersionRef.current
		const scopeKey = currentScopeKey
		setUploadSourceScopeKey(scopeKey)
		setUploadSourceBusy(true)
		try {
			setUploadSourceOpen(false)
			const files = await promptForFiles({ multiple: true, directory: false })
			if (scopeVersionRef.current !== scopeVersion || currentScopeKeyRef.current !== scopeKey) return
			if (!files || files.length === 0) return
			startUploadFromFiles({ files })
		} catch (err) {
			if (scopeVersionRef.current !== scopeVersion || currentScopeKeyRef.current !== scopeKey) return
			message.error(formatErr(err))
		} finally {
			setUploadSourceBusy(false)
			if (scopeVersionRef.current === scopeVersion && currentScopeKeyRef.current === scopeKey) {
				setUploadSourceScopeKey('')
			}
		}
	}, [currentScopeKey, ensureUploadAllowed, startUploadFromFiles])

	const chooseUploadFolder = useCallback(async () => {
		if (!ensureUploadAllowed()) return
		const scopeVersion = scopeVersionRef.current
		const scopeKey = currentScopeKey
		setUploadSourceScopeKey(scopeKey)
		setUploadSourceBusy(true)
		try {
			setUploadSourceOpen(false)
			const result = await promptForFolderFiles()
			if (scopeVersionRef.current !== scopeVersion || currentScopeKeyRef.current !== scopeKey) return
			if (!result || result.files.length === 0) return
			startUploadFromFiles({ files: result.files, label: result.label, directorySelectionMode: result.mode })
		} catch (err) {
			if (scopeVersionRef.current !== scopeVersion || currentScopeKeyRef.current !== scopeKey) return
			message.error(formatErr(err))
		} finally {
			setUploadSourceBusy(false)
			if (scopeVersionRef.current === scopeVersion && currentScopeKeyRef.current === scopeKey) {
				setUploadSourceScopeKey('')
			}
		}
	}, [currentScopeKey, ensureUploadAllowed, startUploadFromFiles])

	return {
		uploadSourceOpen: uploadSourceOpenVisible,
		uploadSourceBusy: uploadSourceBusyVisible,
		folderSelectionSupported: directorySelectionSupport.ok,
		folderSelectionReason: directorySelectionSupport.reason ?? null,
		openUploadPicker,
		closeUploadSource,
		chooseUploadFiles,
		chooseUploadFolder,
	}
}
