import { useCallback, useEffect, useRef, useState } from 'react'
import { message } from 'antd'

import type { APIClient } from '../../api/client'
import type { TransfersContextValue } from '../../components/Transfers'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { listAllObjects } from '../../lib/objects'
import { normalizePrefix } from './objectsListUtils'

type DownloadPrefixValues = { localFolder: string }

type UseObjectsDownloadPrefixArgs = {
	api: APIClient
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
	transfers: TransfersContextValue
}

export function useObjectsDownloadPrefix({ api, apiToken, profileId, bucket, prefix, transfers }: UseObjectsDownloadPrefixArgs) {
	const currentScopeKey = `${apiToken}:${profileId ?? ''}:${bucket}:${prefix}`
	const [downloadPrefixOpen, setDownloadPrefixOpen] = useState(false)
	const [downloadPrefixValues, setDownloadPrefixValues] = useState<DownloadPrefixValues>({ localFolder: '' })
	const [downloadPrefixFolderLabel, setDownloadPrefixFolderLabel] = useState('')
	const [downloadPrefixFolderHandle, setDownloadPrefixFolderHandle] = useState<FileSystemDirectoryHandle | null>(null)
	const [downloadPrefixSubmitting, setDownloadPrefixSubmitting] = useState(false)
	const [downloadPrefixScopeKey, setDownloadPrefixScopeKey] = useState(currentScopeKey)
	const requestTokenRef = useRef(0)
	const downloadPrefixScopeMatches = downloadPrefixScopeKey === currentScopeKey

	const resetDownloadPrefixState = useCallback(() => {
		setDownloadPrefixFolderHandle(null)
		setDownloadPrefixFolderLabel('')
		setDownloadPrefixValues({ localFolder: '' })
		setDownloadPrefixSubmitting(false)
	}, [])

	useEffect(() => {
		requestTokenRef.current += 1
	}, [apiToken, bucket, prefix, profileId])

	const openDownloadPrefix = useCallback(
		(srcPrefixOverride?: string) => {
			if (!profileId || !bucket) return
			const srcPrefix = normalizePrefix(srcPrefixOverride ?? prefix)
			if (!srcPrefix) return

			setDownloadPrefixScopeKey(currentScopeKey)
			requestTokenRef.current += 1
			resetDownloadPrefixState()
			setDownloadPrefixOpen(true)
		},
		[bucket, currentScopeKey, prefix, profileId, resetDownloadPrefixState],
	)

	const handleDownloadPrefixSubmit = useCallback(
		async (values: DownloadPrefixValues) => {
			void values
			if (!downloadPrefixScopeMatches) return
			if (!profileId || !bucket) return
			const srcPrefix = normalizePrefix(prefix)
			if (!srcPrefix) return
			if (!downloadPrefixFolderHandle) {
				message.info('Select a local folder first')
				return
			}

			const requestToken = requestTokenRef.current + 1
			requestTokenRef.current = requestToken
			setDownloadPrefixSubmitting(true)
			try {
				const items = await listAllObjects({
					api,
					profileId,
					bucket,
					prefix: srcPrefix,
				})
				if (requestTokenRef.current !== requestToken) return
				if (items.length === 0) {
					message.info('No objects found under this prefix')
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
				if (requestTokenRef.current !== requestToken) return
				message.error(formatErr(err))
			} finally {
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
			prefix,
			profileId,
			resetDownloadPrefixState,
			transfers,
		],
	)

	const handleDownloadPrefixCancel = useCallback(() => {
		setDownloadPrefixScopeKey(currentScopeKey)
		requestTokenRef.current += 1
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
		setDownloadPrefixValues,
		downloadPrefixSubmitting: downloadPrefixScopeMatches ? downloadPrefixSubmitting : false,
		downloadPrefixCanSubmit: downloadPrefixScopeMatches && !!downloadPrefixFolderHandle,
		openDownloadPrefix,
		handleDownloadPrefixSubmit,
		handleDownloadPrefixCancel,
		handleDownloadPrefixPick,
	}
}
