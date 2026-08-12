import { useLayoutEffect, useRef } from 'react'

import type { TransfersRuntimeApi } from '../../components/transfersTypes'
import type { ObjectItem } from '../../api/types'
import { getDevicePickerSupport, pickDirectory } from '../../lib/deviceFs'
import { objectsFeedback } from './objectsFeedback'
import { displayNameForKey, normalizePrefix } from './objectsListUtils'

type UseObjectDownloadsArgs = {
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
	selectedKeys: Set<string>
	selectedCount: number
	objectByKey: Map<string, ObjectItem>
	transfers: TransfersRuntimeApi
	onZipObjects: (keys: string[]) => void
}

export type ObjectDownloadsResult = {
	onDownload: (key: string, expectedBytes?: number) => void
	onDownloadToDevice: (key: string, expectedBytes?: number) => Promise<void>
	handleDownloadSelected: () => Promise<void>
}

export function useObjectDownloads(args: UseObjectDownloadsArgs): ObjectDownloadsResult {
	const currentScopeKey = `${args.apiToken}:${args.profileId ?? ''}:${args.bucket}:${args.prefix}`
	const currentScopeKeyRef = useRef(currentScopeKey)
	const scopeVersionRef = useRef(0)

	useLayoutEffect(() => {
		currentScopeKeyRef.current = currentScopeKey
		scopeVersionRef.current += 1
	}, [currentScopeKey])

	const onDownload = (key: string, expectedBytes?: number) => {
		if (!args.profileId) {
			objectsFeedback.selectProfileFirst()
			return
		}
		if (!args.bucket) {
			objectsFeedback.selectBucketFirst()
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
			objectsFeedback.selectProfileFirst()
			return
		}
		if (!args.bucket) {
			objectsFeedback.selectBucketFirst()
			return
		}

		const support = getDevicePickerSupport()
		if (!support.ok) {
			objectsFeedback.directoryPickerUnavailable(support.reason)
			return
		}
		const profileId = args.profileId
		const bucket = args.bucket
		const prefix = normalizePrefix(args.prefix)
		const scopeVersion = scopeVersionRef.current
		const scopeKey = currentScopeKey
		try {
			const dirHandle = await pickDirectory('readwrite')
			if (scopeVersionRef.current !== scopeVersion || currentScopeKeyRef.current !== scopeKey) return
			args.transfers.queueDownloadObjectsToDevice({
				profileId,
				bucket,
				items: [{ key, size: expectedBytes }],
				targetDirHandle: dirHandle,
				targetLabel: dirHandle.name,
				prefix,
			})
			args.transfers.openTransfers('downloads')
		} catch (err) {
			if (scopeVersionRef.current !== scopeVersion || currentScopeKeyRef.current !== scopeKey) return
			const error = err as Error
			if (error?.name === 'AbortError') return
			objectsFeedback.localFolderSelectionFailed(error)
		}
	}

	const handleDownloadSelected = async () => {
		if (args.selectedCount <= 0) {
			objectsFeedback.selectObjectsFirst()
			return
		}
		if (!args.profileId) {
			objectsFeedback.selectProfileFirst()
			return
		}
		if (!args.bucket) {
			objectsFeedback.selectBucketFirst()
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
			objectsFeedback.directoryPickerUnavailable(support.reason)
			args.onZipObjects(keys)
			return
		}
		const profileId = args.profileId
		const bucket = args.bucket
		const prefix = normalizePrefix(args.prefix)
		const scopeVersion = scopeVersionRef.current
		const scopeKey = currentScopeKey
		try {
			const dirHandle = await pickDirectory('readwrite')
			if (scopeVersionRef.current !== scopeVersion || currentScopeKeyRef.current !== scopeKey) return
			args.transfers.queueDownloadObjectsToDevice({
				profileId,
				bucket,
				items: keys.map((key) => ({ key, size: args.objectByKey.get(key)?.size })),
				targetDirHandle: dirHandle,
				targetLabel: dirHandle.name,
				prefix,
			})
			args.transfers.openTransfers('downloads')
		} catch (err) {
			if (scopeVersionRef.current !== scopeVersion || currentScopeKeyRef.current !== scopeKey) return
			const error = err as Error
			if (error?.name === 'AbortError') return
			objectsFeedback.localFolderSelectionFailed(error)
		}
	}

	return { onDownload, onDownloadToDevice, handleDownloadSelected }
}
