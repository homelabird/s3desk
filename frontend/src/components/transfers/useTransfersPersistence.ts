import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'

import type { DownloadTask, JobArtifactDownloadTask, ObjectDownloadTask, UploadTask } from './transferTypes'

type PersistedDownloadTask = ObjectDownloadTask | JobArtifactDownloadTask

type PersistedTransfers = {
	version: 1
	savedAtMs: number
	downloads: PersistedDownloadTask[]
	uploads: UploadTask[]
}

const TRANSFERS_STORAGE_KEY = 'transfersHistoryV1'
const MAX_PERSISTED_TRANSFERS = 200

const isActiveDownloadStatus = (status: DownloadTask['status']) =>
	status === 'queued' || status === 'waiting' || status === 'running'

const isActiveUploadStatus = (status: UploadTask['status']) =>
	status === 'queued' || status === 'staging' || status === 'commit' || status === 'waiting_job' || status === 'cleanup'

const normalizeDownloadTask = (task: PersistedDownloadTask, now: number): DownloadTask => {
	if (!isActiveDownloadStatus(task.status)) return task
	return {
		...task,
		status: 'canceled',
		finishedAtMs: now,
		error: task.error ?? 'Transfer interrupted by refresh. Select the same file(s) and click Retry to resume.',
	}
}

const normalizeUploadTask = (task: UploadTask, now: number): UploadTask => {
	if (!isActiveUploadStatus(task.status)) return task
	return {
		...task,
		status: 'canceled',
		finishedAtMs: now,
		error: task.error ?? 'Transfer interrupted by refresh. Select the same file(s) and click Retry to resume.',
	}
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
		const uploads = uploadTasks.slice(0, MAX_PERSISTED_TRANSFERS)
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
