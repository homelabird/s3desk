import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'

import type { DownloadTask, JobArtifactDownloadTask, ObjectDownloadTask, UploadTask } from './transferTypes'

type PersistedDownloadTask = ObjectDownloadTask | JobArtifactDownloadTask
type PersistedUploadTask = Omit<UploadTask, 'preview'>

type PersistedTransfers = {
	version: 1
	savedAtMs: number
	downloads: PersistedDownloadTask[]
	uploads: PersistedUploadTask[]
}

const TRANSFERS_STORAGE_KEY = 'transfersHistoryV1'
const MAX_PERSISTED_TRANSFERS = 200

const isActiveDownloadStatus = (status: DownloadTask['status']) =>
	status === 'queued' || status === 'waiting' || status === 'running'

const isActiveUploadStatus = (status: UploadTask['status']) =>
	status === 'queued' || status === 'staging' || status === 'commit' || status === 'waiting_job'

function withoutPreview<T extends { preview?: unknown }>(task: T): Omit<T, 'preview'> {
	const { preview, ...rest } = task
	void preview
	return rest
}

const normalizeDownloadTask = (task: PersistedDownloadTask, now: number): DownloadTask => {
	if (!isActiveDownloadStatus(task.status)) return task
	return {
		...task,
		status: 'canceled',
		finishedAtMs: now,
		error: task.error ?? 'Transfer interrupted by refresh. Select the same file(s) and click Retry to resume.',
	}
}

const normalizeUploadTask = (task: PersistedUploadTask, now: number): UploadTask => {
	const normalized = withoutPreview(task as PersistedUploadTask & { preview?: unknown })
	if (!isActiveUploadStatus(task.status)) return normalized
	return {
		...normalized,
		status: 'canceled',
		finishedAtMs: now,
		error: task.error ?? 'Transfer interrupted by refresh. Select the same file(s) and click Retry to resume.',
	}
}

const toPersistedUploadTask = (task: UploadTask): PersistedUploadTask => {
	return withoutPreview(task)
}

const loadPersistedTransfers = (): PersistedTransfers | null => {
	if (typeof window === 'undefined') return null
	try {
		const raw = window.localStorage.getItem(TRANSFERS_STORAGE_KEY)
		if (!raw) return null
		const parsed = JSON.parse(raw) as PersistedTransfers
		if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.downloads) || !Array.isArray(parsed.uploads)) {
			return null
		}
		return parsed
	} catch {
		return null
	}
}

type UseTransfersPersistenceArgs = {
	downloadTasks: DownloadTask[]
	uploadTasks: UploadTask[]
	setDownloadTasks: Dispatch<SetStateAction<DownloadTask[]>>
	setUploadTasks: Dispatch<SetStateAction<UploadTask[]>>
}

export function useTransfersPersistence({
	downloadTasks,
	uploadTasks,
	setDownloadTasks,
	setUploadTasks,
}: UseTransfersPersistenceArgs) {
	const hasLoadedPersistedRef = useRef(false)

	useEffect(() => {
		if (hasLoadedPersistedRef.current) return
		hasLoadedPersistedRef.current = true
		const persisted = loadPersistedTransfers()
		if (!persisted) return
		const now = Date.now()
		setDownloadTasks(persisted.downloads.map((task) => normalizeDownloadTask(task, now)))
		setUploadTasks(persisted.uploads.map((task) => normalizeUploadTask(task, now)))
	}, [setDownloadTasks, setUploadTasks])

	useEffect(() => {
		if (typeof window === 'undefined') return
		const downloads = downloadTasks
			.filter((task): task is PersistedDownloadTask => task.kind !== 'object_device')
			.slice(0, MAX_PERSISTED_TRANSFERS)
		const uploads = uploadTasks.slice(0, MAX_PERSISTED_TRANSFERS).map(toPersistedUploadTask)
		const payload: PersistedTransfers = {
			version: 1,
			savedAtMs: Date.now(),
			downloads,
			uploads,
		}
		try {
			window.localStorage.setItem(TRANSFERS_STORAGE_KEY, JSON.stringify(payload))
		} catch {
			// ignore
		}
	}, [downloadTasks, uploadTasks])
}
