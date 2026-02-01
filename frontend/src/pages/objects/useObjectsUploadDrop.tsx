import { useCallback, useRef, useState } from 'react'
import { message } from 'antd'

import type { TransfersContextValue } from '../../components/Transfers'
import { formatErrorWithHint as formatErr } from '../../lib/errors'

type UseObjectsUploadDropArgs = {
	profileId: string | null
	bucket: string
	prefix: string
	isOffline: boolean
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

export function useObjectsUploadDrop({ profileId, bucket, prefix, isOffline, transfers }: UseObjectsUploadDropArgs) {
	const uploadDragCounterRef = useRef(0)
	const [uploadDropActive, setUploadDropActive] = useState(false)

	const startUploadFromFiles = useCallback(
		(files: File[]) => {
			if (isOffline) {
				message.warning('Offline: uploads are disabled.')
				return
			}
			if (!profileId) {
				message.info('Select a profile first')
				return
			}
			if (!bucket) {
				message.info('Select a bucket first')
				return
			}
			const cleanedFiles = files.filter((f) => !!f)
			if (cleanedFiles.length === 0) return
			transfers.queueUploadFiles({ profileId, bucket, prefix, files: cleanedFiles })
			transfers.openTransfers('uploads')
		},
		[bucket, isOffline, prefix, profileId, transfers],
	)

	const onUploadDragEnter = useCallback(
		(e: React.DragEvent) => {
			if (!profileId || !bucket || isOffline) return
			if (!e.dataTransfer.types.includes('Files')) return
			e.preventDefault()
			uploadDragCounterRef.current += 1
			setUploadDropActive(true)
		},
		[bucket, isOffline, profileId],
	)

	const onUploadDragLeave = useCallback(
		(e: React.DragEvent) => {
			if (!profileId || !bucket || isOffline) return
			if (!e.dataTransfer.types.includes('Files')) return
			e.preventDefault()
			uploadDragCounterRef.current -= 1
			if (uploadDragCounterRef.current <= 0) {
				uploadDragCounterRef.current = 0
				setUploadDropActive(false)
			}
		},
		[bucket, isOffline, profileId],
	)

	const onUploadDragOver = useCallback(
		(e: React.DragEvent) => {
			if (!profileId || !bucket || isOffline) return
			if (!e.dataTransfer.types.includes('Files')) return
			e.preventDefault()
			e.dataTransfer.dropEffect = 'copy'
		},
		[bucket, isOffline, profileId],
	)

	const onUploadDrop = useCallback(
		(e: React.DragEvent) => {
			if (!profileId || !bucket) return
			if (isOffline) {
				message.warning('Offline: uploads are disabled.')
				return
			}
			if (!e.dataTransfer.types.includes('Files')) return
			e.preventDefault()
			setUploadDropActive(false)
			uploadDragCounterRef.current = 0

			const dt = e.dataTransfer
			const hasEntryAPI = Array.from(dt.items ?? []).some((item) => typeof (item as { webkitGetAsEntry?: unknown }).webkitGetAsEntry === 'function')
			if (!hasEntryAPI) {
				const files = Array.from(dt.files ?? [])
				startUploadFromFiles(files)
				return
			}

			const key = 'upload_prepare'
			message.open({ type: 'loading', content: 'Preparing folder upload…', duration: 0, key })
			void (async () => {
				try {
					const files = await collectDroppedUploadFiles(dt)
					if (files.length === 0) {
						message.open({ type: 'warning', content: 'No files found', key, duration: 2 })
						return
					}
					message.open({ type: 'success', content: `Queued ${files.length} file(s)`, key, duration: 2 })
					startUploadFromFiles(files)
				} catch (err) {
					message.open({ type: 'error', content: formatErr(err), key, duration: 4 })
				}
			})()
		},
		[bucket, isOffline, profileId, startUploadFromFiles],
	)

	return {
		uploadDropActive,
		startUploadFromFiles,
		onUploadDragEnter,
		onUploadDragLeave,
		onUploadDragOver,
		onUploadDrop,
	}
}
