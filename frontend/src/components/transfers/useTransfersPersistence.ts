import { readPendingUploadCommit } from './uploadCommitRecovery'
import { useEffect, useLayoutEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { subscribePageLifecycle } from '../../lib/pageLifecycle'

import { isTransferFinished } from './transferTypes'
import type { DownloadTask, JobArtifactDownloadTask, ObjectDownloadTask, UploadTask } from './transferTypes'

type PersistedDownloadTask = ObjectDownloadTask | JobArtifactDownloadTask
type PersistedUploadTask = Omit<UploadTask, 'preview' | 'preparation'>

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
	status === 'queued' || status === 'waiting' || status === 'running' || status === 'ready'

const isActiveUploadStatus = (status: UploadTask['status']) =>
	status === 'queued' || status === 'staging' || status === 'commit'

function withoutPreview<T extends { preview?: unknown; preparation?: unknown }>(task: T): Omit<T, 'preview' | 'preparation'> {
	const { preview, preparation, ...rest } = task
	void preview
	void preparation
	return rest
}

const normalizeDownloadTask = (input: PersistedDownloadTask, now: number): DownloadTask => {
	const task = withoutDownloadLink(input)
	if (task.kind === 'job_artifact' && task.status === 'waiting') return task
	if (!isActiveDownloadStatus(task.status)) return task
	return {
		...task,
		status: 'canceled',
		finishedAtMs: now,
		error: task.error ?? 'Download interrupted. Retry requests a new download; check the browser download manager first.',
	}
}

const normalizeUploadTask = (task: PersistedUploadTask, now: number): UploadTask => {
	const normalized = withoutPreview(task as PersistedUploadTask & { preview?: unknown })
	if (normalized.status === 'waiting_job') return normalized
	if (normalized.status === 'commit' && normalized.jobId) return { ...normalized, status: 'waiting_job', error: undefined }
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
		error: task.error ?? 'Upload interrupted. Select the same file(s) and Retry; confirmed chunks are reused when available.',
		retryFileHandleState: 'selection_required',
	}
}

const toPersistedUploadTask = (task: UploadTask): PersistedUploadTask => {
	return withoutPreview(task)
}

type WithoutDownloadLink<T> = T extends unknown ? Omit<T, 'nativeDownloadUrl' | 'nativeDownloadExpiresAtMs'> : never

export function withoutDownloadLink<T extends { nativeDownloadUrl?: string; nativeDownloadExpiresAtMs?: number }>(task: T): WithoutDownloadLink<T> {
	const { nativeDownloadUrl, nativeDownloadExpiresAtMs, ...safe } = task
	void nativeDownloadUrl
	void nativeDownloadExpiresAtMs
	// Preserve the object/job discriminated union while removing optional secrets.
	return safe as WithoutDownloadLink<T>
}

export function selectPersistedTasks<T extends { status: DownloadTask['status'] | UploadTask['status'] }>(tasks: T[], historyLimit = MAX_PERSISTED_TRANSFERS): T[] {
	let completed = 0
	return tasks.filter((task) => !isTransferFinished(task.status) || completed++ < historyLimit)
}

export const persistTransfers = (downloadTasks: DownloadTask[], uploadTasks: UploadTask[]): 'full' | 'active_only' | 'failed' => {
	if (typeof window === 'undefined') return 'failed'
	const downloads = selectPersistedTasks(downloadTasks
		.filter((task): task is PersistedDownloadTask => task.kind !== 'object_device'))
		.map(withoutDownloadLink)
	const uploads = selectPersistedTasks(uploadTasks).map(toPersistedUploadTask)
	const payload: PersistedTransfers = {
		version: 1,
		savedAtMs: Date.now(),
		downloads,
		uploads,
	}
	try {
		window.sessionStorage.setItem(TRANSFERS_STORAGE_KEY, JSON.stringify(payload))
		return 'full'
	} catch {
		// Do not sacrifice live server jobs to make room for completed history.
		try {
			payload.downloads = payload.downloads.filter((task) => !isTransferFinished(task.status))
			payload.uploads = payload.uploads.filter((task) => !isTransferFinished(task.status))
			window.sessionStorage.setItem(TRANSFERS_STORAGE_KEY, JSON.stringify(payload))
			return 'active_only'
		} catch {
			return 'failed'
		}
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
	onPersistenceWarning?: (message: string) => void
}

export function useTransfersPersistence({
	downloadTasks,
	uploadTasks,
	setDownloadTasks,
	setUploadTasks,
	onPersistenceWarning,
}: UseTransfersPersistenceArgs) {
	const hasLoadedPersistedRef = useRef(false)
	const latestTransfersRef = useRef({ downloadTasks, uploadTasks })
	const persistenceDirtyRef = useRef(true)
	const warningRef = useRef(onPersistenceWarning)
	const lastWarningRef = useRef<string | null>(null)

	useEffect(() => {
		if (hasLoadedPersistedRef.current) return
		hasLoadedPersistedRef.current = true
		const persisted = loadPersistedTransfers()
		if (!persisted) return
		const now = Date.now()
		setDownloadTasks(persisted.downloads.map((task) => normalizeDownloadTask(task, now)))
		setUploadTasks(persisted.uploads.map((task) => normalizeUploadTask(task, now)))
	}, [setDownloadTasks, setUploadTasks])

	useLayoutEffect(() => {
		warningRef.current = onPersistenceWarning
		latestTransfersRef.current = { downloadTasks, uploadTasks }
		persistenceDirtyRef.current = true
	}, [downloadTasks, uploadTasks, onPersistenceWarning])

	useEffect(() => {
		if (typeof window === 'undefined') return
		const flush = () => {
			if (!persistenceDirtyRef.current) return
			persistenceDirtyRef.current = false
			const { downloadTasks: latestDownloads, uploadTasks: latestUploads } = latestTransfersRef.current
			const result = persistTransfers(latestDownloads, latestUploads)
			// Retry failed persistence on the next lifecycle/interval, not just a state change.
			persistenceDirtyRef.current = result === 'failed'
			if (result === 'full') lastWarningRef.current = null
			else if (lastWarningRef.current !== result) {
				lastWarningRef.current = result
				warningRef.current?.(result === 'active_only'
					? 'Storage is full. Active transfers were saved, but completed history was omitted.'
					: 'Transfer history could not be saved. Keep this page open; recovery after refresh is not guaranteed.')
			}
		}
		flush()
		const intervalId = window.setInterval(flush, PERSIST_INTERVAL_MS)
		const unsubscribe = subscribePageLifecycle({ onHidden: flush })
		return () => {
			window.clearInterval(intervalId)
			unsubscribe()
			flush()
		}
	}, [])
}
