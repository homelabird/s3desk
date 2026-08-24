import { useCallback, useLayoutEffect, useRef, useState } from 'react'

import { getDirectorySelectionSupport } from '../../lib/deviceFs'
import { promptForFiles, promptForFolderFiles } from '../../components/transfers/transfersUploadUtils'
import { objectsFeedback } from './objectsFeedback'

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
	const currentScopeKey = `${apiToken}:${profileId ?? ''}:${bucket}:${prefix}:${isOffline}:${uploadsEnabled}`
	const currentScopeKeyRef = useRef(currentScopeKey)
	const scopeVersionRef = useRef(0)
	const folderAbortControllerRef = useRef<AbortController | null>(null)
	const uploadSourceOpenVisible = uploadSourceOpen && uploadSourceScopeKey === currentScopeKey
	const uploadSourceBusyVisible = uploadSourceBusy && uploadSourceScopeKey === currentScopeKey
	const directorySelectionSupport = getDirectorySelectionSupport()

	useLayoutEffect(() => {
		const scopeChanged = currentScopeKeyRef.current !== currentScopeKey
		currentScopeKeyRef.current = currentScopeKey
		scopeVersionRef.current += 1
		folderAbortControllerRef.current?.abort()
		folderAbortControllerRef.current = null
		if (scopeChanged) {
			setUploadSourceOpen(false)
			setUploadSourceBusy(false)
			setUploadSourceScopeKey('')
		}
		return () => {
			scopeVersionRef.current += 1
			folderAbortControllerRef.current?.abort()
			folderAbortControllerRef.current = null
		}
	}, [currentScopeKey])

	const ensureUploadAllowed = useCallback(() => {
		if (isOffline) {
			objectsFeedback.offlineUploadsDisabled()
			return false
		}
		if (!uploadsEnabled) {
			objectsFeedback.uploadsUnsupported(uploadsDisabledReason)
			return false
		}
		return true
	}, [isOffline, uploadsDisabledReason, uploadsEnabled])

	const openUploadPicker = useCallback(() => {
		if (!ensureUploadAllowed()) return
		scopeVersionRef.current += 1
		folderAbortControllerRef.current?.abort()
		folderAbortControllerRef.current = null
		setUploadSourceBusy(false)
		setUploadSourceScopeKey(currentScopeKey)
		setUploadSourceOpen(true)
	}, [currentScopeKey, ensureUploadAllowed])

	const closeUploadSource = useCallback(() => {
		scopeVersionRef.current += 1
		folderAbortControllerRef.current?.abort()
		folderAbortControllerRef.current = null
		setUploadSourceBusy(false)
		setUploadSourceOpen(false)
		setUploadSourceScopeKey('')
	}, [])

	const chooseUploadFiles = useCallback(async () => {
		if (!ensureUploadAllowed()) return
		const scopeVersion = scopeVersionRef.current + 1
		scopeVersionRef.current = scopeVersion
		const scopeKey = currentScopeKey
		folderAbortControllerRef.current?.abort()
		folderAbortControllerRef.current = null
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
			objectsFeedback.error(err)
		} finally {
			if (scopeVersionRef.current === scopeVersion && currentScopeKeyRef.current === scopeKey) {
				setUploadSourceBusy(false)
				setUploadSourceScopeKey('')
			}
		}
	}, [currentScopeKey, ensureUploadAllowed, startUploadFromFiles])

	const chooseUploadFolder = useCallback(async () => {
		if (!ensureUploadAllowed()) return
		const scopeVersion = scopeVersionRef.current + 1
		scopeVersionRef.current = scopeVersion
		const scopeKey = currentScopeKey
		folderAbortControllerRef.current?.abort()
		const controller = new AbortController()
		folderAbortControllerRef.current = controller
		setUploadSourceScopeKey(scopeKey)
		setUploadSourceBusy(true)
		setUploadSourceOpen(true)
		try {
			const result = await promptForFolderFiles({ signal: controller.signal })
			if (controller.signal.aborted) return
			if (scopeVersionRef.current !== scopeVersion || currentScopeKeyRef.current !== scopeKey) return
			if (!result || result.files.length === 0) return
			startUploadFromFiles({ files: result.files, label: result.label, directorySelectionMode: result.mode })
		} catch (err) {
			if (controller.signal.aborted) return
			if (scopeVersionRef.current !== scopeVersion || currentScopeKeyRef.current !== scopeKey) return
			if ((err as Error)?.name === 'AbortError') return
			objectsFeedback.error(err)
		} finally {
			if (folderAbortControllerRef.current === controller) {
				folderAbortControllerRef.current = null
			}
			if (scopeVersionRef.current === scopeVersion && currentScopeKeyRef.current === scopeKey) {
				setUploadSourceBusy(false)
				setUploadSourceOpen(false)
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
