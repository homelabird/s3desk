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
const PERSIST_INTERVAL_MS = 1_000

function parsePersistedTransfers(raw: string | null): PersistedTransfers | null {
	if (!raw) return null
	try {
		const parsed = JSON.parse(raw) as PersistedTransfers
		if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.downloads) || !Array.isArray(parsed.uploads)) {
			return null
		}
		return parsed
	} catch {
		return null
	}
}

export function clearPersistedTransfersStorage() {
	if (typeof window === 'undefined') return
	try {
		window.sessionStorage.removeItem(TRANSFERS_STORAGE_KEY)
	} catch {
		// ignore
	}
	try {
		window.localStorage.removeItem(TRANSFERS_STORAGE_KEY)
	} catch {
		// ignore
	}
}

const isActiveDownloadStatus = (status: DownloadTask['status']) =>
	status === 'queued' || status === 'waiting' || status === 'running'

const isActiveUploadStatus = (status: UploadTask['status']) =>
	status === 'queued' || status === 'staging' || status === 'commit'

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
	if (normalized.status === 'waiting_job') return normalized
	if (!isActiveUploadStatus(task.status)) {
		if (normalized.status === 'failed' || normalized.status === 'canceled') {
			return {
				...normalized,
				retryFileHandleState: 'selection_required',
			}
		}
		return normalized
	}
	return {
		...normalized,
		status: 'canceled',
		finishedAtMs: now,
		error: task.error ?? 'Transfer interrupted by refresh. Select the same file(s) and click Retry to resume.',
		retryFileHandleState: 'selection_required',
	}
}

const toPersistedUploadTask = (task: UploadTask): PersistedUploadTask => {
	return withoutPreview(task)
}

const persistTransfers = (downloadTasks: DownloadTask[], uploadTasks: UploadTask[]) => {
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
		window.sessionStorage.setItem(TRANSFERS_STORAGE_KEY, JSON.stringify(payload))
	} catch {
		// ignore
	}
}

const loadPersistedTransfers = (): PersistedTransfers | null => {
	if (typeof window === 'undefined') return null
	try {
		const sessionParsed = parsePersistedTransfers(window.sessionStorage.getItem(TRANSFERS_STORAGE_KEY))
		if (sessionParsed) return sessionParsed
	} catch {
		// ignore
	}
	try {
		const legacyRaw = window.localStorage.getItem(TRANSFERS_STORAGE_KEY)
		const legacyParsed = parsePersistedTransfers(legacyRaw)
		if (!legacyParsed) return null
		try {
			window.sessionStorage.setItem(TRANSFERS_STORAGE_KEY, legacyRaw as string)
		} catch {
			// ignore
		}
		try {
			window.localStorage.removeItem(TRANSFERS_STORAGE_KEY)
		} catch {
			// ignore
		}
		return legacyParsed
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
	const latestTransfersRef = useRef({ downloadTasks, uploadTasks })
	const persistenceDirtyRef = useRef(true)

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
		latestTransfersRef.current = { downloadTasks, uploadTasks }
		persistenceDirtyRef.current = true
	}, [downloadTasks, uploadTasks])

	useEffect(() => {
		if (typeof window === 'undefined') return
		const flush = () => {
			if (!persistenceDirtyRef.current) return
			persistenceDirtyRef.current = false
			const { downloadTasks: latestDownloads, uploadTasks: latestUploads } = latestTransfersRef.current
			persistTransfers(latestDownloads, latestUploads)
		}
		flush()
		const intervalId = window.setInterval(flush, PERSIST_INTERVAL_MS)
		window.addEventListener('pagehide', flush)
		return () => {
			window.clearInterval(intervalId)
			window.removeEventListener('pagehide', flush)
			flush()
		}
	}, [])
}
