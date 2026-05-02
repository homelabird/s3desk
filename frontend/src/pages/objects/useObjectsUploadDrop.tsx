import { useCallback, useEffect, useRef, useState } from 'react'

import type { TransfersContextValue } from '../../components/transfersTypes'
import { objectsFeedback } from './objectsFeedback'
import { hasInternalObjectsDndPayload, resolveObjectsDropIntent } from './objectsDropIntent'

type UseObjectsUploadDropArgs = {
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
	isOffline: boolean
	uploadsEnabled: boolean
	uploadsDisabledReason?: string | null
	transfers: TransfersContextValue
}

type WebKitEntry = {
	isFile: boolean
	isDirectory: boolean
	fullPath?: string
	name: string
	file?: (success: (file: File) => void, error?: (err: unknown) => void) => void
	createReader?: () => { readEntries: (success: (entries: WebKitEntry[]) => void, error?: (err: unknown) => void) => void }
}

const collectDroppedUploadFiles = async (dt: DataTransfer): Promise<File[]> => {
	const items = Array.from(dt.items ?? [])
	const entries: WebKitEntry[] = []
	for (const item of items) {
		const withEntry = item as DataTransferItem & { webkitGetAsEntry?: () => WebKitEntry | null }
		if (typeof withEntry.webkitGetAsEntry !== 'function') continue
		const entry = withEntry.webkitGetAsEntry()
		if (entry) entries.push(entry)
	}

	if (entries.length === 0) return Array.from(dt.files ?? [])

	const out: (File & { relativePath?: string })[] = []

	const readAllDirEntries = async (dir: WebKitEntry): Promise<WebKitEntry[]> => {
		const reader = dir.createReader?.()
		if (!reader) return []

		const acc: WebKitEntry[] = []
		for (;;) {
			const batch = await new Promise<WebKitEntry[]>((resolve, reject) => {
				reader.readEntries(resolve, reject)
			})
			if (batch.length === 0) break
			acc.push(...batch)
		}
		return acc
	}

	const walk = async (entry: WebKitEntry): Promise<void> => {
		if (entry.isFile) {
			if (!entry.file) return
			const file = await new Promise<File>((resolve, reject) => {
				try {
					entry.file?.call(entry, resolve, reject)
				} catch (err) {
					reject(err)
				}
			})
			const fullPath = typeof entry.fullPath === 'string' && entry.fullPath ? entry.fullPath : file.name
			const relPath = fullPath.replace(/^\/+/, '')
			const fileWithPath = file as File & { relativePath?: string }
			fileWithPath.relativePath = relPath
			out.push(fileWithPath)
			return
		}

		if (entry.isDirectory) {
			const children = await readAllDirEntries(entry)
			for (const child of children) await walk(child)
		}
	}

	for (const entry of entries) {
		await walk(entry)
	}
	return out
}

export function useObjectsUploadDrop({
	apiToken,
	profileId,
	bucket,
	prefix,
	isOffline,
	uploadsEnabled,
	uploadsDisabledReason,
	transfers,
}: UseObjectsUploadDropArgs) {
	const uploadDragCounterRef = useRef(0)
	const [uploadDropActive, setUploadDropActive] = useState(false)
	const [uploadDropScopeKey, setUploadDropScopeKey] = useState('')
	const scopeVersionRef = useRef(0)
	const currentScopeKey = `${apiToken || '__no_server__'}:${profileId?.trim() || '__no_profile__'}:${bucket}|${prefix}`
	const currentScopeKeyRef = useRef(currentScopeKey)
	const uploadDropVisible = uploadDropActive && uploadDropScopeKey === currentScopeKey

	useEffect(() => {
		currentScopeKeyRef.current = currentScopeKey
		scopeVersionRef.current += 1
	}, [currentScopeKey])

	const resetUploadDropState = useCallback(() => {
		uploadDragCounterRef.current = 0
		setUploadDropActive(false)
		setUploadDropScopeKey('')
	}, [])

	useEffect(() => {
		if (typeof window === 'undefined') return
		window.addEventListener('blur', resetUploadDropState)
		window.addEventListener('dragend', resetUploadDropState)
		window.addEventListener('drop', resetUploadDropState)
		return () => {
			window.removeEventListener('blur', resetUploadDropState)
			window.removeEventListener('dragend', resetUploadDropState)
			window.removeEventListener('drop', resetUploadDropState)
		}
	}, [resetUploadDropState])

	const startUploadFromFiles = useCallback(
		(args: { files: File[]; label?: string; directorySelectionMode?: 'picker' | 'input' }) => {
			if (isOffline) {
				objectsFeedback.offlineUploadsDisabled()
				return
			}
			if (!uploadsEnabled) {
				objectsFeedback.uploadsUnsupported(uploadsDisabledReason)
				return
			}
			if (!profileId) {
				objectsFeedback.selectProfileFirst()
				return
			}
			if (!bucket) {
				objectsFeedback.selectBucketFirst()
				return
			}
			const cleanedFiles = args.files.filter((f) => !!f)
			if (cleanedFiles.length === 0) return
			transfers.queueUploadFiles({
				profileId,
				bucket,
				prefix,
				files: cleanedFiles,
				label: args.label,
				directorySelectionMode: args.directorySelectionMode,
			})
			transfers.openTransfers('uploads')
		},
		[bucket, isOffline, prefix, profileId, transfers, uploadsDisabledReason, uploadsEnabled],
	)

	const onUploadDragEnter = useCallback(
		(e: React.DragEvent) => {
			if (resolveObjectsDropIntent(e.dataTransfer) !== 'external_upload') return
			e.preventDefault()
			if (!profileId || !bucket || isOffline || !uploadsEnabled) {
				e.dataTransfer.dropEffect = 'none'
				return
			}
			uploadDragCounterRef.current += 1
			setUploadDropActive(true)
			setUploadDropScopeKey(currentScopeKey)
		},
		[bucket, currentScopeKey, isOffline, profileId, uploadsEnabled],
	)

	const onUploadDragLeave = useCallback(
		(e: React.DragEvent) => {
			if (resolveObjectsDropIntent(e.dataTransfer) !== 'external_upload') return
			e.preventDefault()
			if (!profileId || !bucket || isOffline || !uploadsEnabled) return
			uploadDragCounterRef.current -= 1
			if (uploadDragCounterRef.current <= 0) {
				uploadDragCounterRef.current = 0
				setUploadDropActive(false)
				setUploadDropScopeKey('')
			}
		},
		[bucket, isOffline, profileId, uploadsEnabled],
	)

	const onUploadDragOver = useCallback(
		(e: React.DragEvent) => {
			if (resolveObjectsDropIntent(e.dataTransfer) !== 'external_upload') return
			e.preventDefault()
			if (!profileId || !bucket || isOffline || !uploadsEnabled) {
				e.dataTransfer.dropEffect = 'none'
				return
			}
			e.dataTransfer.dropEffect = 'copy'
		},
		[bucket, isOffline, profileId, uploadsEnabled],
	)

	const onUploadDrop = useCallback(
		(e: React.DragEvent) => {
			if (hasInternalObjectsDndPayload(e.dataTransfer)) return
			if (resolveObjectsDropIntent(e.dataTransfer) !== 'external_upload') return
			e.preventDefault()
			e.stopPropagation()
			resetUploadDropState()
			if (!profileId || !bucket) {
				if (!profileId) objectsFeedback.selectProfileFirst()
				else objectsFeedback.selectBucketFirst()
				return
			}
			if (!uploadsEnabled) {
				objectsFeedback.uploadsUnsupported(uploadsDisabledReason)
				return
			}
			if (isOffline) {
				objectsFeedback.offlineUploadsDisabled()
				return
			}

			const dt = e.dataTransfer
			const hasEntryAPI = Array.from(dt.items ?? []).some((item) => typeof (item as { webkitGetAsEntry?: unknown }).webkitGetAsEntry === 'function')
			if (!hasEntryAPI) {
				const files = Array.from(dt.files ?? [])
				startUploadFromFiles({ files })
				return
			}

			const key = 'upload_prepare'
			const scopeVersion = scopeVersionRef.current
			const scopeKey = currentScopeKey
			objectsFeedback.preparingFolderUpload(key)
			void (async () => {
				try {
					const files = await collectDroppedUploadFiles(dt)
					if (scopeVersionRef.current !== scopeVersion || currentScopeKeyRef.current !== scopeKey) {
						objectsFeedback.destroy(key)
						return
					}
					if (files.length === 0) {
						objectsFeedback.noFilesFound(key)
						return
					}
					objectsFeedback.queuedFiles(key, files.length)
					startUploadFromFiles({ files })
				} catch (err) {
					if (scopeVersionRef.current !== scopeVersion || currentScopeKeyRef.current !== scopeKey) {
						objectsFeedback.destroy(key)
						return
					}
					objectsFeedback.dropUploadFailed(key, err)
				}
			})()
		},
		[bucket, currentScopeKey, isOffline, profileId, resetUploadDropState, startUploadFromFiles, uploadsDisabledReason, uploadsEnabled],
	)

	return {
		uploadDropActive: uploadDropVisible,
		startUploadFromFiles,
		onUploadDragEnter,
		onUploadDragLeave,
		onUploadDragOver,
		onUploadDrop,
	}
}
