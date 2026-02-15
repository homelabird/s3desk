import type { ObjectDeviceDownloadTask } from './transferTypes'
import { defaultFilenameFromKey, normalizeDevicePath, normalizePrefixForDevice, randomId } from './transferDownloadUtils'

export function planObjectDeviceDownloadTasks(args: {
	profileId: string
	bucket: string
	items: { key: string; size?: number }[]
	targetDirHandle: FileSystemDirectoryHandle
	targetLabel?: string
	prefix?: string
	makeId?: () => string
	nowMs?: () => number
}): ObjectDeviceDownloadTask[] {
	const prefix = normalizePrefixForDevice(args.prefix)
	const makeId = args.makeId ?? randomId
	const nowMs = args.nowMs ?? (() => Date.now())

	const tasks: ObjectDeviceDownloadTask[] = []
	for (const item of args.items) {
		if (!item?.key) continue
		if (item.key.endsWith('/')) continue

		const relative = prefix && item.key.startsWith(prefix) ? item.key.slice(prefix.length) : item.key
		const targetPath = normalizeDevicePath(relative || defaultFilenameFromKey(item.key))
		const label = relative || item.key

		tasks.push({
			id: makeId(),
			kind: 'object_device',
			profileId: args.profileId,
			bucket: args.bucket,
			key: item.key,
			label,
			status: 'queued',
			createdAtMs: nowMs(),
			loadedBytes: 0,
			totalBytes: typeof item.size === 'number' && item.size >= 0 ? item.size : undefined,
			speedBps: 0,
			etaSeconds: 0,
			error: undefined,
			filenameHint: targetPath.split('/').pop() || defaultFilenameFromKey(item.key),
			targetDirHandle: args.targetDirHandle,
			targetPath,
			targetLabel: args.targetLabel,
		})
	}

	return tasks
}

