import type { APIClient } from '../../api/client'
import { ensureReadWritePermission, getFileHandleForPath, writeResponseToFile } from '../../lib/deviceFs'
import type { ObjectDeviceDownloadTask } from './transferTypes'
import { shouldFallbackToProxy } from './transferDownloadUtils'

export async function downloadObjectToDevice(args: {
	api: APIClient
	task: ObjectDeviceDownloadTask
	downloadLinkProxyEnabled: boolean
	signal: AbortSignal
	onProgress?: (stats: { loadedBytes: number; totalBytes?: number }) => void
}): Promise<void> {
	const { api, task, downloadLinkProxyEnabled, signal, onProgress } = args

	await ensureReadWritePermission(task.targetDirHandle)

	let res: Response
	if (downloadLinkProxyEnabled) {
		const proxy = await api.getObjectDownloadURL({
			profileId: task.profileId,
			bucket: task.bucket,
			key: task.key,
			proxy: true,
		})
		res = await fetch(proxy.url, { signal })
	} else {
		try {
			const direct = await api.getObjectDownloadURL({
				profileId: task.profileId,
				bucket: task.bucket,
				key: task.key,
			})
			res = await fetch(direct.url, { signal })
		} catch (err) {
			if (!shouldFallbackToProxy(err) || signal.aborted) {
				throw err
			}
			const proxy = await api.getObjectDownloadURL({
				profileId: task.profileId,
				bucket: task.bucket,
				key: task.key,
				proxy: true,
			})
			res = await fetch(proxy.url, { signal })
		}
	}

	if (!res.ok) {
		throw new Error(`Download failed (HTTP ${res.status})`)
	}

	const fileHandle = await getFileHandleForPath(task.targetDirHandle, task.targetPath)
	await writeResponseToFile({
		response: res,
		fileHandle,
		signal,
		onProgress,
	})
}

