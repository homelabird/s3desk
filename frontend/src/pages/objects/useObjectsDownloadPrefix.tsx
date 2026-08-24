import { useCallback, useEffect, useRef, useState } from 'react'

import type { APIClientShape } from '../../api/client'
import type { TransfersRuntimeApi } from '../../components/transfersTypes'
import { listAllObjects } from '../../lib/objects'
import { objectsFeedback } from './objectsFeedback'
import { normalizePrefix } from './objectsListUtils'

type DownloadPrefixValues = { localFolder: string }

type UseObjectsDownloadPrefixArgs = {
	api: APIClientShape
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
	transfers: TransfersRuntimeApi
}

export function useObjectsDownloadPrefix({ api, apiToken, profileId, bucket, prefix, transfers }: UseObjectsDownloadPrefixArgs) {
	const currentScopeKey = `${apiToken}:${profileId ?? ''}:${bucket}:${prefix}`
	const [downloadPrefixOpen, setDownloadPrefixOpen] = useState(false)
	const [downloadPrefixValues, setDownloadPrefixValues] = useState<DownloadPrefixValues>({ localFolder: '' })
	const [downloadPrefixFolderLabel, setDownloadPrefixFolderLabel] = useState('')
	const [downloadPrefixFolderHandle, setDownloadPrefixFolderHandle] = useState<FileSystemDirectoryHandle | null>(null)
	const [downloadPrefixSourcePrefix, setDownloadPrefixSourcePrefix] = useState('')
	const [downloadPrefixSubmitting, setDownloadPrefixSubmitting] = useState(false)
	const [downloadPrefixScopeKey, setDownloadPrefixScopeKey] = useState(currentScopeKey)
	const requestTokenRef = useRef(0)
	const requestAbortControllerRef = useRef<AbortController | null>(null)
	const downloadPrefixScopeMatches = downloadPrefixScopeKey === currentScopeKey

	const resetDownloadPrefixState = useCallback(() => {
		setDownloadPrefixFolderHandle(null)
		setDownloadPrefixFolderLabel('')
		setDownloadPrefixValues({ localFolder: '' })
		setDownloadPrefixSourcePrefix('')
		setDownloadPrefixSubmitting(false)
	}, [])

	useEffect(() => {
		requestTokenRef.current += 1
		setDownloadPrefixOpen(false)
		resetDownloadPrefixState()
		return () => {
			requestTokenRef.current += 1
			requestAbortControllerRef.current?.abort()
			requestAbortControllerRef.current = null
		}
	}, [apiToken, bucket, prefix, profileId, resetDownloadPrefixState])

	const openDownloadPrefix = useCallback(
		(srcPrefixOverride?: string) => {
			if (!profileId || !bucket) return
			const srcPrefix = normalizePrefix(srcPrefixOverride ?? prefix)
			if (!srcPrefix) return

			setDownloadPrefixScopeKey(currentScopeKey)
			requestTokenRef.current += 1
			requestAbortControllerRef.current?.abort()
			requestAbortControllerRef.current = null
			resetDownloadPrefixState()
			setDownloadPrefixSourcePrefix(srcPrefix)
			setDownloadPrefixOpen(true)
		},
		[bucket, currentScopeKey, prefix, profileId, resetDownloadPrefixState],
	)

	const handleDownloadPrefixSubmit = useCallback(
		async (values: DownloadPrefixValues) => {
			void values
			if (!downloadPrefixScopeMatches) return
			if (!profileId || !bucket) return
			const srcPrefix = downloadPrefixSourcePrefix
			if (!srcPrefix) return
			if (!downloadPrefixFolderHandle) {
				objectsFeedback.selectLocalFolderFirst()
				return
			}

			const requestToken = requestTokenRef.current + 1
			requestTokenRef.current = requestToken
			requestAbortControllerRef.current?.abort()
			const controller = new AbortController()
			requestAbortControllerRef.current = controller
			setDownloadPrefixSubmitting(true)
			try {
				const items = await listAllObjects({
					api,
					profileId,
					bucket,
					prefix: srcPrefix,
					signal: controller.signal,
				})
				if (requestTokenRef.current !== requestToken) return
				if (items.length === 0) {
					objectsFeedback.noObjectsFoundUnderPrefix()
					return
				}

				transfers.queueDownloadObjectsToDevice({
					profileId,
					bucket,
					items: items.map((item) => ({ key: item.key, size: item.size })),
					targetDirHandle: downloadPrefixFolderHandle,
					targetLabel: downloadPrefixFolderLabel || downloadPrefixFolderHandle.name,
					prefix: srcPrefix,
				})
				transfers.openTransfers('downloads')
				if (requestTokenRef.current !== requestToken) return
				setDownloadPrefixScopeKey(currentScopeKey)
				setDownloadPrefixOpen(false)
				resetDownloadPrefixState()
			} catch (err) {
				if (controller.signal.aborted || requestTokenRef.current !== requestToken) return
				objectsFeedback.error(err)
			} finally {
				if (requestAbortControllerRef.current === controller) {
					requestAbortControllerRef.current = null
				}
				if (requestTokenRef.current === requestToken) {
					setDownloadPrefixSubmitting(false)
				}
			}
		},
		[
			api,
			bucket,
			currentScopeKey,
			downloadPrefixScopeMatches,
			downloadPrefixFolderHandle,
			downloadPrefixFolderLabel,
			downloadPrefixSourcePrefix,
			profileId,
			resetDownloadPrefixState,
			transfers,
		],
	)

	const handleDownloadPrefixCancel = useCallback(() => {
		setDownloadPrefixScopeKey(currentScopeKey)
		requestTokenRef.current += 1
		requestAbortControllerRef.current?.abort()
		requestAbortControllerRef.current = null
		setDownloadPrefixOpen(false)
		resetDownloadPrefixState()
	}, [currentScopeKey, resetDownloadPrefixState])

	const handleDownloadPrefixPick = useCallback((handle: FileSystemDirectoryHandle) => {
		setDownloadPrefixFolderHandle(handle)
		setDownloadPrefixFolderLabel(handle.name)
	}, [])

	return {
		downloadPrefixOpen: downloadPrefixScopeMatches ? downloadPrefixOpen : false,
		downloadPrefixValues: downloadPrefixScopeMatches ? downloadPrefixValues : { localFolder: '' },
		downloadPrefixSourcePrefix: downloadPrefixScopeMatches ? downloadPrefixSourcePrefix : '',
		setDownloadPrefixValues,
		downloadPrefixSubmitting: downloadPrefixScopeMatches ? downloadPrefixSubmitting : false,
		downloadPrefixCanSubmit: downloadPrefixScopeMatches && !!downloadPrefixFolderHandle,
		openDownloadPrefix,
		handleDownloadPrefixSubmit,
		handleDownloadPrefixCancel,
		handleDownloadPrefixPick,
	}
}
