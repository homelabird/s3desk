import { message } from 'antd'

import type { TransfersContextValue } from '../../components/Transfers'
import type { ObjectItem } from '../../api/types'
import { getDevicePickerSupport, pickDirectory } from '../../lib/deviceFs'
import { displayNameForKey, normalizePrefix } from './objectsListUtils'

type UseObjectDownloadsArgs = {
	profileId: string | null
	bucket: string
	prefix: string
	selectedKeys: Set<string>
	selectedCount: number
	objectByKey: Map<string, ObjectItem>
	transfers: TransfersContextValue
	onZipObjects: (keys: string[]) => void
}

export type ObjectDownloadsResult = {
	onDownload: (key: string, expectedBytes?: number) => void
	onDownloadToDevice: (key: string, expectedBytes?: number) => Promise<void>
	handleDownloadSelected: () => Promise<void>
}

export function useObjectDownloads(args: UseObjectDownloadsArgs): ObjectDownloadsResult {
	const onDownload = (key: string, expectedBytes?: number) => {
		if (!args.profileId) {
			message.info('Select a profile first')
			return
		}
		if (!args.bucket) {
			message.info('Select a bucket first')
			return
		}

		args.transfers.queueDownloadObject({
			profileId: args.profileId,
			bucket: args.bucket,
			key,
			expectedBytes,
			label: displayNameForKey(key, args.prefix),
		})
		args.transfers.openTransfers('downloads')
	}

	const onDownloadToDevice = async (key: string, expectedBytes?: number) => {
		if (!args.profileId) {
			message.info('Select a profile first')
			return
		}
		if (!args.bucket) {
			message.info('Select a bucket first')
			return
		}

		const support = getDevicePickerSupport()
		if (!support.ok) {
			message.warning(support.reason ?? 'Directory picker is not available.')
			return
		}
		try {
			const dirHandle = await pickDirectory()
			args.transfers.queueDownloadObjectsToDevice({
				profileId: args.profileId,
				bucket: args.bucket,
				items: [{ key, size: expectedBytes }],
				targetDirHandle: dirHandle,
				targetLabel: dirHandle.name,
				prefix: normalizePrefix(args.prefix),
			})
			args.transfers.openTransfers('downloads')
		} catch (err) {
			const error = err as Error
			if (error?.name === 'AbortError') return
			message.error(error?.message ?? 'Failed to select a local folder.')
		}
	}

	const handleDownloadSelected = async () => {
		if (args.selectedCount <= 0) {
			message.info('Select objects first')
			return
		}
		const keys = Array.from(args.selectedKeys)
		if (keys.length === 1) {
			const key = keys[0]
			const item = args.objectByKey.get(key)
			onDownload(key, item?.size)
			return
		}

		const support = getDevicePickerSupport()
		if (!support.ok) {
			message.warning(support.reason ?? 'Directory picker is not available.')
			args.onZipObjects(keys)
			return
		}
		try {
			const dirHandle = await pickDirectory()
			args.transfers.queueDownloadObjectsToDevice({
				profileId: args.profileId!,
				bucket: args.bucket,
				items: keys.map((key) => ({ key, size: args.objectByKey.get(key)?.size })),
				targetDirHandle: dirHandle,
				targetLabel: dirHandle.name,
				prefix: normalizePrefix(args.prefix),
			})
			args.transfers.openTransfers('downloads')
		} catch (err) {
			const error = err as Error
			if (error?.name === 'AbortError') return
			message.error(error?.message ?? 'Failed to select a local folder.')
		}
	}

	return { onDownload, onDownloadToDevice, handleDownloadSelected }
}
