import { useCallback, useState } from 'react'
import { message } from 'antd'

import type { APIClient } from '../../api/client'
import type { TransfersContextValue } from '../../components/Transfers'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { listAllObjects } from '../../lib/objects'
import { normalizePrefix } from './objectsListUtils'

type DownloadPrefixValues = { localFolder: string }

type UseObjectsDownloadPrefixArgs = {
	api: APIClient
	profileId: string | null
	bucket: string
	prefix: string
	transfers: TransfersContextValue
}

export function useObjectsDownloadPrefix({ api, profileId, bucket, prefix, transfers }: UseObjectsDownloadPrefixArgs) {
	const [downloadPrefixOpen, setDownloadPrefixOpen] = useState(false)
	const [downloadPrefixValues, setDownloadPrefixValues] = useState<DownloadPrefixValues>({ localFolder: '' })
	const [downloadPrefixFolderLabel, setDownloadPrefixFolderLabel] = useState('')
	const [downloadPrefixFolderHandle, setDownloadPrefixFolderHandle] = useState<FileSystemDirectoryHandle | null>(null)
	const [downloadPrefixSubmitting, setDownloadPrefixSubmitting] = useState(false)

	const openDownloadPrefix = useCallback(
		(srcPrefixOverride?: string) => {
			if (!profileId || !bucket) return
			const srcPrefix = normalizePrefix(srcPrefixOverride ?? prefix)
			if (!srcPrefix) return

			setDownloadPrefixFolderHandle(null)
			setDownloadPrefixFolderLabel('')
			setDownloadPrefixValues({ localFolder: '' })
			setDownloadPrefixOpen(true)
		},
		[bucket, prefix, profileId],
	)

	const handleDownloadPrefixSubmit = useCallback(
		async (values: DownloadPrefixValues) => {
			void values
			if (!profileId || !bucket) return
			const srcPrefix = normalizePrefix(prefix)
			if (!srcPrefix) return
			if (!downloadPrefixFolderHandle) {
				message.info('Select a local folder first')
				return
			}

			setDownloadPrefixSubmitting(true)
			try {
				const items = await listAllObjects({
					api,
					profileId,
					bucket,
					prefix: srcPrefix,
				})
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
				setDownloadPrefixOpen(false)
				setDownloadPrefixFolderHandle(null)
				setDownloadPrefixFolderLabel('')
				setDownloadPrefixValues({ localFolder: '' })
			} catch (err) {
				message.error(formatErr(err))
			} finally {
				setDownloadPrefixSubmitting(false)
			}
		},
		[
			api,
			bucket,
			downloadPrefixFolderHandle,
			downloadPrefixFolderLabel,
			prefix,
			profileId,
			transfers,
		],
	)

	const handleDownloadPrefixCancel = useCallback(() => {
		setDownloadPrefixOpen(false)
		setDownloadPrefixFolderHandle(null)
		setDownloadPrefixFolderLabel('')
		setDownloadPrefixValues({ localFolder: '' })
	}, [])

	const handleDownloadPrefixPick = useCallback((handle: FileSystemDirectoryHandle) => {
		setDownloadPrefixFolderHandle(handle)
		setDownloadPrefixFolderLabel(handle.name)
	}, [])

	return {
		downloadPrefixOpen,
		downloadPrefixValues,
		setDownloadPrefixValues,
		downloadPrefixSubmitting,
		downloadPrefixCanSubmit: !!downloadPrefixFolderHandle,
		openDownloadPrefix,
		handleDownloadPrefixSubmit,
		handleDownloadPrefixCancel,
		handleDownloadPrefixPick,
	}
}
