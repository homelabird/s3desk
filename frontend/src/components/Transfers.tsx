import { type ReactNode, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Modal, Space, Typography, message } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import {
	APIClient,
	APIError,
	RequestAbortedError,
	type UploadCommitRequest,
	type UploadFileItem,
	type UploadFilesResult,
} from '../api/client'
import { buildApiHttpUrl, buildApiWsUrl } from '../api/baseUrl'
import type { JobProgress, JobStatus, WSEvent } from '../api/types'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { TransfersContext, useTransfers } from './useTransfers'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { TransferEstimator } from '../lib/transfer'
import { clearNetworkStatus, publishNetworkStatus } from '../lib/networkStatus'
import {
	ensureReadWritePermission,
	getDevicePickerSupport,
	getFileHandleForPath,
	removeEntriesFromDirectoryHandle,
	type RemoveEntriesResult,
	writeResponseToFile,
} from '../lib/deviceFs'
import { withJobQueueRetry } from '../lib/jobQueue'
import { MOVE_CLEANUP_FILENAME_MAX_LEN, MOVE_CLEANUP_FILENAME_TEMPLATE } from '../lib/moveCleanupDefaults'
import type {
	DownloadTask,
	JobArtifactDownloadTask,
	ObjectDeviceDownloadTask,
	ObjectDownloadTask,
	TransfersTab,
	UploadTask,
} from './transfers/transferTypes'
import {
	defaultFilenameFromKey,
	downloadURLWithProgress,
	filenameFromContentDisposition,
	maybeReportNetworkError,
	normalizeDevicePath,
	normalizePrefixForDevice,
	randomId,
	saveBlob,
	shouldFallbackToProxy,
} from './transfers/transferDownloadUtils'

type UploadMovePlan = {
	rootHandle: FileSystemDirectoryHandle
	relPaths: string[]
	label?: string
	cleanupEmptyDirs?: boolean
}

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

const normalizeRelPath = (value: string): string => {
	const trimmed = value.trim()
	if (!trimmed) return ''
	return trimmed.replace(/\\/g, '/').replace(/^\.\//, '')
}

const promptForFiles = (args: { multiple: boolean; directory: boolean }): Promise<File[] | null> =>
	new Promise((resolve) => {
		const input = document.createElement('input')
		input.type = 'file'
		input.multiple = args.multiple
		if (args.directory) {
			;(input as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory = true
		}
		input.style.display = 'none'
		const cleanup = () => {
			input.remove()
		}
		input.addEventListener('change', () => {
			const files = input.files ? Array.from(input.files) : []
			cleanup()
			resolve(files.length ? files : null)
		})
		document.body.appendChild(input)
		input.click()
	})

const buildUploadItems = (files: File[]): UploadFileItem[] =>
	files.map((file) => {
		const fileWithPath = file as File & { webkitRelativePath?: string; relativePath?: string }
		const relPathRaw = (fileWithPath.webkitRelativePath ?? fileWithPath.relativePath ?? '').trim()
		return { file, relPath: relPathRaw || file.name }
	})

const resolveUploadItemPath = (item: UploadFileItem): string => {
	const rel = (item.relPath ?? '').trim()
	return rel || item.file.name
}

const resolveUploadItemPathNormalized = (item: UploadFileItem): string => normalizeRelPath(resolveUploadItemPath(item))

const PRESIGNED_MIN_PART_BYTES = 5 * 1024 * 1024
const PRESIGNED_MAX_PARTS = 10_000
const PRESIGNED_UNSAFE_HEADERS = new Set(['accept-encoding', 'connection', 'content-length', 'host', 'user-agent'])

type PresignedUploadItem = {
	item: UploadFileItem
	path: string
	size: number
	contentType?: string
	index: number
}

type PresignedMultipartPlan = {
	partSizeBytes: number
	partCount: number
}

const planPresignedMultipart = (args: {
	fileSize: number
	partSizeBytes: number
	thresholdBytes: number
}): PresignedMultipartPlan | null => {
	if (!Number.isFinite(args.fileSize) || args.fileSize <= 0) return null
	if (args.fileSize < args.thresholdBytes) return null

	let partSizeBytes = Math.max(PRESIGNED_MIN_PART_BYTES, Math.ceil(args.partSizeBytes))
	let partCount = Math.ceil(args.fileSize / partSizeBytes)
	if (partCount > PRESIGNED_MAX_PARTS) {
		partSizeBytes = Math.ceil(args.fileSize / PRESIGNED_MAX_PARTS)
		if (partSizeBytes < PRESIGNED_MIN_PART_BYTES) {
			partSizeBytes = PRESIGNED_MIN_PART_BYTES
		}
		partCount = Math.ceil(args.fileSize / partSizeBytes)
	}

	if (partCount < 2) return null
	return { partSizeBytes, partCount }
}

const applyPresignedHeaders = (xhr: XMLHttpRequest, headers?: Record<string, string>) => {
	if (!headers) return
	for (const [key, value] of Object.entries(headers)) {
		if (!value) continue
		if (PRESIGNED_UNSAFE_HEADERS.has(key.toLowerCase())) continue
		xhr.setRequestHeader(key, value)
	}
}

const uploadPresignedBlob = (args: {
	url: string
	method?: string
	headers?: Record<string, string>
	body: Blob
	onProgress?: (loadedBytes: number) => void
}): { promise: Promise<{ etag?: string }>; abort: () => void } => {
	const xhr = new XMLHttpRequest()
	xhr.open(args.method ?? 'PUT', args.url)
	applyPresignedHeaders(xhr, args.headers)

	if (args.onProgress) {
		xhr.upload.onprogress = (e) => {
			args.onProgress?.(e.loaded)
		}
	}

	const promise = new Promise<{ etag?: string }>((resolve, reject) => {
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				clearNetworkStatus()
				resolve({ etag: xhr.getResponseHeader('etag') ?? xhr.getResponseHeader('ETag') ?? undefined })
				return
			}
			if (xhr.status >= 500 || xhr.status === 0) {
				publishNetworkStatus({ kind: 'unstable', message: `Server error (HTTP ${xhr.status || '0'}).` })
			}
			reject(new Error(xhr.responseText ? `upload failed: ${xhr.responseText}` : `upload failed (HTTP ${xhr.status || '0'})`))
		}
		xhr.onerror = () => {
			publishNetworkStatus({ kind: 'unstable', message: 'Network error. Check your connection.' })
			reject(new Error('network error'))
		}
		xhr.onabort = () => reject(new RequestAbortedError())
	})

	xhr.send(args.body)
	return { promise, abort: () => xhr.abort() }
}

const uploadPresignedFilesWithProgress = (args: {
	api: APIClient
	profileId: string
	uploadId: string
	items: UploadFileItem[]
	onProgress?: (progress: { loadedBytes: number; totalBytes?: number }) => void
	singleConcurrency: number
	multipartFileConcurrency: number
	partConcurrency: number
	chunkThresholdBytes: number
	chunkSizeBytes: number
}): { promise: Promise<UploadFilesResult>; abort: () => void } => {
	const totalBytes = args.items.reduce((acc, item) => acc + (item.file?.size ?? 0), 0)
	if (args.items.length === 0) {
		return { promise: Promise.resolve({ skipped: 0 }), abort: () => {} }
	}

	const validItems: PresignedUploadItem[] = []
	let skipped = 0
	let skippedBytes = 0
	for (const [index, item] of args.items.entries()) {
		const path = normalizeUploadPath(resolveUploadItemPath(item))
		if (!path) {
			skipped += 1
			skippedBytes += item.file?.size ?? 0
			continue
		}
		validItems.push({
			item,
			path,
			size: item.file?.size ?? 0,
			contentType: item.file?.type?.trim() || undefined,
			index,
		})
	}

	if (validItems.length === 0) {
		return { promise: Promise.resolve({ skipped }), abort: () => {} }
	}

	const emitProgress = (loadedBytes: number) => {
		if (!args.onProgress) return
		args.onProgress({ loadedBytes, totalBytes: totalBytes || undefined })
	}

	const loadedByKey = new Map<string, number>()
	let loadedBytes = skippedBytes
	if (skippedBytes > 0) emitProgress(loadedBytes)

	const updateLoaded = (key: string, nextLoaded: number) => {
		const prev = loadedByKey.get(key) ?? 0
		const delta = nextLoaded - prev
		if (delta <= 0) return
		loadedByKey.set(key, nextLoaded)
		loadedBytes += delta
		emitProgress(loadedBytes)
	}

	const singleItems: PresignedUploadItem[] = []
	const multipartItems: Array<{ info: PresignedUploadItem; plan: PresignedMultipartPlan }> = []
	for (const info of validItems) {
		const plan = planPresignedMultipart({
			fileSize: info.size,
			partSizeBytes: args.chunkSizeBytes,
			thresholdBytes: args.chunkThresholdBytes,
		})
		if (plan) multipartItems.push({ info, plan })
		else singleItems.push(info)
	}

	const singleConcurrency = Math.max(1, args.singleConcurrency)
	const multipartConcurrency = Math.max(1, args.multipartFileConcurrency)
	const partConcurrency = Math.max(1, args.partConcurrency)
	const aborters: Array<() => void> = []
	let aborted = false

	const uploadSingleItem = async (info: PresignedUploadItem) => {
		const presigned = await args.api.presignUpload(args.profileId, args.uploadId, {
			path: info.path,
			contentType: info.contentType,
			size: info.size,
		})
		if (presigned.mode !== 'single' || !presigned.url) {
			throw new Error('unexpected presigned response for single upload')
		}
		const key = `single:${info.index}`
		const handle = uploadPresignedBlob({
			url: presigned.url,
			method: presigned.method,
			headers: presigned.headers,
			body: info.item.file,
			onProgress: (loaded) => updateLoaded(key, loaded),
		})
		aborters.push(handle.abort)
		await handle.promise
		updateLoaded(key, info.size)
	}

	const uploadMultipartItem = async (info: PresignedUploadItem, plan: PresignedMultipartPlan) => {
		const presigned = await args.api.presignUpload(args.profileId, args.uploadId, {
			path: info.path,
			contentType: info.contentType,
			size: info.size,
			multipart: {
				fileSize: info.size,
				partSizeBytes: plan.partSizeBytes,
			},
		})
		if (presigned.mode !== 'multipart' || !presigned.multipart) {
			throw new Error('unexpected presigned response for multipart upload')
		}
		try {
			const partSizeBytes = presigned.multipart.partSizeBytes
			const partCount = presigned.multipart.partCount
			const parts = presigned.multipart.parts ?? []
			if (parts.length === 0) {
				throw new Error('multipart presign returned no parts')
			}
			const partsByNumber = new Map(parts.map((part) => [part.number, part]))
			for (let i = 1; i <= partCount; i += 1) {
				if (!partsByNumber.has(i)) {
					throw new Error(`missing presigned part ${i}`)
				}
			}

			let nextPart = 1
			const completed: Array<{ number: number; etag: string }> = []
			const uploadPart = async (partNumber: number) => {
				const part = partsByNumber.get(partNumber)
				if (!part) throw new Error(`missing presigned part ${partNumber}`)
				const start = (partNumber - 1) * partSizeBytes
				const end = Math.min(info.size, start + partSizeBytes)
				const blob = info.item.file.slice(start, end)
				const key = `multi:${info.index}:${partNumber}`
				const handle = uploadPresignedBlob({
					url: part.url,
					method: part.method,
					headers: part.headers,
					body: blob,
					onProgress: (loaded) => updateLoaded(key, loaded),
				})
				aborters.push(handle.abort)
				const res = await handle.promise
				const etag = res.etag?.trim()
				if (!etag) {
					throw new Error(`missing etag for part ${partNumber}`)
				}
				updateLoaded(key, end - start)
				return { number: partNumber, etag }
			}

			const partWorker = async () => {
				while (true) {
					if (aborted) return
					const current = nextPart
					if (current > partCount) return
					nextPart += 1
					const partResult = await uploadPart(current)
					completed.push(partResult)
				}
			}

			const workers = Array.from({ length: Math.min(partConcurrency, partCount) }, () => partWorker())
			await Promise.all(workers)
			await args.api.completeMultipartUpload(args.profileId, args.uploadId, {
				path: info.path,
				parts: completed,
			})
		} catch (err) {
			await args.api.abortMultipartUpload(args.profileId, args.uploadId, { path: info.path }).catch(() => {})
			throw err
		}
	}

	const runSingles = async () => {
		if (singleItems.length === 0) return
		let nextIndex = 0
		const worker = async () => {
			while (true) {
				if (aborted) return
				const currentIndex = nextIndex
				if (currentIndex >= singleItems.length) return
				nextIndex += 1
				try {
					await uploadSingleItem(singleItems[currentIndex])
				} catch (err) {
					if (!aborted) {
						aborted = true
						for (const abort of aborters) abort()
					}
					throw err
				}
			}
		}
		const workers = Array.from({ length: Math.min(singleConcurrency, singleItems.length) }, () => worker())
		await Promise.all(workers)
	}

	const runMultiparts = async () => {
		if (multipartItems.length === 0) return
		let nextIndex = 0
		const worker = async () => {
			while (true) {
				if (aborted) return
				const currentIndex = nextIndex
				if (currentIndex >= multipartItems.length) return
				nextIndex += 1
				const entry = multipartItems[currentIndex]
				try {
					await uploadMultipartItem(entry.info, entry.plan)
				} catch (err) {
					if (!aborted) {
						aborted = true
						for (const abort of aborters) abort()
					}
					throw err
				}
			}
		}
		const workers = Array.from({ length: Math.min(multipartConcurrency, multipartItems.length) }, () => worker())
		await Promise.all(workers)
	}

	const promise = (async () => {
		await Promise.all([runSingles(), runMultiparts()])
		return { skipped }
	})()

	return {
		promise,
		abort: () => {
			aborted = true
			for (const abort of aborters) abort()
		},
	}
}

const TransfersDrawer = lazy(async () => {
	const m = await import('./transfers/TransfersDrawer')
	return { default: m.TransfersDrawer }
})

export type TransfersContextValue = {
	isOpen: boolean
	tab: TransfersTab
	activeDownloadCount: number
	activeUploadCount: number
	activeTransferCount: number
	downloadTasks: DownloadTask[]
	uploadTasks: UploadTask[]
	openTransfers: (tab?: TransfersTab) => void
	closeTransfers: () => void
	queueDownloadObject: (args: { profileId: string; bucket: string; key: string; expectedBytes?: number; label?: string; filenameHint?: string }) => void
	queueDownloadObjectsToDevice: (args: {
		profileId: string
		bucket: string
		items: { key: string; size?: number }[]
		targetDirHandle: FileSystemDirectoryHandle
		targetLabel?: string
		prefix?: string
	}) => void
	queueDownloadJobArtifact: (args: {
		profileId: string
		jobId: string
		label?: string
		filenameHint?: string
		waitForJob?: boolean
	}) => void
	queueUploadFiles: (args: {
		profileId: string
		bucket: string
		prefix: string
		files: File[]
		label?: string
		moveSource?: UploadMovePlan
	}) => void
}

type UploadCapabilityByProfileId = Record<string, { presignedUpload: boolean; directUpload: boolean }>

export function TransfersProvider(props: {
	apiToken: string
	uploadDirectStream?: boolean
	uploadCapabilityByProfileId?: UploadCapabilityByProfileId
	children: ReactNode
}) {
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])

	const [isOpen, setIsOpen] = useState(false)
	const [tab, setTab] = useLocalStorageState<TransfersTab>('transfersTab', 'downloads')

	const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([])
	const downloadTasksRef = useRef<DownloadTask[]>([])
	const downloadAbortByTaskIdRef = useRef<Record<string, () => void>>({})
	const downloadEstimatorByTaskIdRef = useRef<Record<string, TransferEstimator>>({})

	const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([])
	const uploadTasksRef = useRef<UploadTask[]>([])
	const uploadAbortByTaskIdRef = useRef<Record<string, () => void>>({})
	const uploadEstimatorByTaskIdRef = useRef<Record<string, TransferEstimator>>({})
	const uploadItemsByTaskIdRef = useRef<Record<string, UploadFileItem[]>>({})
	const uploadMoveByTaskIdRef = useRef<Record<string, UploadMovePlan>>({})
	const [moveCleanupFilenameTemplate] = useLocalStorageState<string>(
		'moveCleanupFilenameTemplate',
		MOVE_CLEANUP_FILENAME_TEMPLATE,
	)
	const [moveCleanupFilenameMaxLen] = useLocalStorageState<number>(
		'moveCleanupFilenameMaxLen',
		MOVE_CLEANUP_FILENAME_MAX_LEN,
	)
	const [downloadLinkProxyEnabled] = useLocalStorageState<boolean>('downloadLinkProxyEnabled', false)
	const [uploadEventsConnected, setUploadEventsConnected] = useState(false)
	const hasLoadedPersistedRef = useRef(false)

	useEffect(() => {
		if (hasLoadedPersistedRef.current) return
		hasLoadedPersistedRef.current = true
		const persisted = loadPersistedTransfers()
		if (!persisted) return
		const now = Date.now()
		setDownloadTasks(persisted.downloads.map((task) => normalizeDownloadTask(task, now)))
		setUploadTasks(persisted.uploads.map((task) => normalizeUploadTask(task, now)))
	}, [])

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

	useEffect(() => {
		downloadTasksRef.current = downloadTasks
	}, [downloadTasks])
	useEffect(() => {
		uploadTasksRef.current = uploadTasks
	}, [uploadTasks])

	const activeDownloadCount = downloadTasks.filter((t) => t.status === 'queued' || t.status === 'waiting' || t.status === 'running').length
	const hasCompletedDownloads = downloadTasks.some((t) => t.status === 'succeeded')
	const activeUploadCount = uploadTasks.filter(
		(t) => t.status === 'queued' || t.status === 'staging' || t.status === 'commit' || t.status === 'waiting_job' || t.status === 'cleanup',
	).length
	const hasCompletedUploads = uploadTasks.some((t) => t.status === 'succeeded')
	const activeTransferCount = activeDownloadCount + activeUploadCount

	const downloadSummaryText = useMemo(() => summarizeDownloadTasks(downloadTasks), [downloadTasks])
	const uploadSummaryText = useMemo(() => summarizeUploadTasks(uploadTasks), [uploadTasks])

	const downloadConcurrency = 2
	const uploadConcurrency = 1
	const [uploadAutoTuneEnabled] = useLocalStorageState<boolean>('uploadAutoTuneEnabled', true)
	const [uploadBatchConcurrencySetting] = useLocalStorageState<number>('uploadBatchConcurrency', 16)
	const [uploadBatchBytesMiBSetting] = useLocalStorageState<number>('uploadBatchBytesMiB', 64)
	const [uploadChunkSizeMiBSetting] = useLocalStorageState<number>('uploadChunkSizeMiB', 128)
	const [uploadChunkConcurrencySetting] = useLocalStorageState<number>('uploadChunkConcurrency', 8)
	const [uploadChunkThresholdMiBSetting] = useLocalStorageState<number>('uploadChunkThresholdMiB', 256)
	const [uploadChunkFileConcurrencySetting] = useLocalStorageState<number>('uploadChunkFileConcurrency', 2)
	const [uploadResumeConversionEnabled] = useLocalStorageState<boolean>('uploadResumeConversionEnabled', false)
	const uploadBatchConcurrency = Math.min(
		32,
		Math.max(1, Number.isFinite(uploadBatchConcurrencySetting) ? uploadBatchConcurrencySetting : 16),
	)
	const uploadBatchBytesMiB = Math.min(256, Math.max(8, Number.isFinite(uploadBatchBytesMiBSetting) ? uploadBatchBytesMiBSetting : 64))
	const uploadChunkSizeMiB = Math.min(512, Math.max(16, Number.isFinite(uploadChunkSizeMiBSetting) ? uploadChunkSizeMiBSetting : 128))
	const uploadChunkConcurrency = Math.min(
		16,
		Math.max(1, Number.isFinite(uploadChunkConcurrencySetting) ? uploadChunkConcurrencySetting : 8),
	)
	const uploadChunkThresholdMiB = Math.min(
		2048,
		Math.max(64, Number.isFinite(uploadChunkThresholdMiBSetting) ? uploadChunkThresholdMiBSetting : 256),
	)
	const uploadChunkFileConcurrency = Math.min(
		8,
		Math.max(1, Number.isFinite(uploadChunkFileConcurrencySetting) ? uploadChunkFileConcurrencySetting : 2),
	)
	const uploadBatchBytes = uploadBatchBytesMiB * 1024 * 1024
	const uploadChunkSizeBytes = uploadChunkSizeMiB * 1024 * 1024
	const uploadChunkThresholdBytes = uploadChunkThresholdMiB * 1024 * 1024

	const pickUploadTuning = useCallback(
		(totalBytes: number, maxFileBytes: number | null) => {
			if (!uploadAutoTuneEnabled) {
				return {
					batchConcurrency: uploadBatchConcurrency,
					batchBytes: uploadBatchBytes,
					chunkSizeBytes: uploadChunkSizeBytes,
					chunkConcurrency: uploadChunkConcurrency,
					chunkThresholdBytes: uploadChunkThresholdBytes,
				}
			}

			const size = Math.max(totalBytes, maxFileBytes ?? 0)
			const mib = size / (1024 * 1024)

			if (mib <= 256) {
				return {
					batchConcurrency: 8,
					batchBytes: 32 * 1024 * 1024,
					chunkSizeBytes: 64 * 1024 * 1024,
					chunkConcurrency: 4,
					chunkThresholdBytes: 128 * 1024 * 1024,
				}
			}
			if (mib <= 2048) {
				return {
					batchConcurrency: 16,
					batchBytes: 64 * 1024 * 1024,
					chunkSizeBytes: 128 * 1024 * 1024,
					chunkConcurrency: 8,
					chunkThresholdBytes: 256 * 1024 * 1024,
				}
			}
			if (mib <= 8192) {
				return {
					batchConcurrency: 24,
					batchBytes: 96 * 1024 * 1024,
					chunkSizeBytes: 256 * 1024 * 1024,
					chunkConcurrency: 12,
					chunkThresholdBytes: 512 * 1024 * 1024,
				}
			}
			return {
				batchConcurrency: 32,
				batchBytes: 128 * 1024 * 1024,
				chunkSizeBytes: 256 * 1024 * 1024,
				chunkConcurrency: 16,
				chunkThresholdBytes: 512 * 1024 * 1024,
			}
		},
		[
			uploadAutoTuneEnabled,
			uploadBatchConcurrency,
			uploadBatchBytes,
			uploadChunkSizeBytes,
			uploadChunkConcurrency,
			uploadChunkThresholdBytes,
		],
	)

	const openTransfers = useCallback(
		(nextTab?: TransfersTab) => {
			if (nextTab) setTab(nextTab)
			setIsOpen(true)
		},
		[setTab],
	)

	const closeTransfers = useCallback(() => setIsOpen(false), [])

	const updateDownloadTask = useCallback((taskId: string, updater: (task: DownloadTask) => DownloadTask) => {
		setDownloadTasks((prev) => prev.map((t) => (t.id === taskId ? updater(t) : t)))
	}, [])

	const cancelDownloadTask = useCallback(
		(taskId: string) => {
			const abort = downloadAbortByTaskIdRef.current[taskId]
			if (abort) abort()
			updateDownloadTask(taskId, (t) => ({ ...t, status: 'canceled', finishedAtMs: Date.now() }))
		},
		[updateDownloadTask],
	)

	const retryDownloadTask = useCallback(
		(taskId: string) => {
			updateDownloadTask(taskId, (t) => ({
				...t,
				status: 'queued',
				startedAtMs: undefined,
				finishedAtMs: undefined,
				loadedBytes: 0,
				speedBps: 0,
				etaSeconds: 0,
				error: undefined,
			}))
		},
		[updateDownloadTask],
	)

	const removeDownloadTask = useCallback((taskId: string) => {
		const abort = downloadAbortByTaskIdRef.current[taskId]
		if (abort) abort()
		delete downloadAbortByTaskIdRef.current[taskId]
		delete downloadEstimatorByTaskIdRef.current[taskId]
		setDownloadTasks((prev) => prev.filter((t) => t.id !== taskId))
	}, [])

	const clearCompletedDownloads = useCallback(() => {
		setDownloadTasks((prev) => prev.filter((t) => t.status !== 'succeeded'))
	}, [])

	const updateUploadTask = useCallback((taskId: string, updater: (task: UploadTask) => UploadTask) => {
		setUploadTasks((prev) => prev.map((t) => (t.id === taskId ? updater(t) : t)))
	}, [])

	const updateUploadTaskProgressFromJob = useCallback(
		(taskId: string, progress?: JobProgress | null) => {
			if (!progress) return
			updateUploadTask(taskId, (prev) => {
				const loadedBytes = progress.bytesDone ?? prev.loadedBytes
				const totalBytes = progress.bytesTotal ?? prev.totalBytes
				const speedBps = progress.speedBps ?? prev.speedBps
				const etaSeconds = progress.etaSeconds ?? prev.etaSeconds
				if (
					loadedBytes === prev.loadedBytes &&
					totalBytes === prev.totalBytes &&
					speedBps === prev.speedBps &&
					etaSeconds === prev.etaSeconds
				) {
					return prev
				}
				return {
					...prev,
					loadedBytes,
					totalBytes,
					speedBps,
					etaSeconds,
				}
			})
		},
		[updateUploadTask],
	)

	const finalizeUploadJob = useCallback(
		async (taskId: string, status: JobStatus, error?: string | null) => {
			const current = uploadTasksRef.current.find((t) => t.id === taskId)
			if (!current || current.status !== 'waiting_job') return

			if (status === 'succeeded') {
				const movePlan = uploadMoveByTaskIdRef.current[taskId]
				if (!current.moveAfterUpload || !movePlan) {
					updateUploadTask(taskId, (prev) => ({
						...prev,
						status: 'succeeded',
						finishedAtMs: Date.now(),
						error: undefined,
						cleanupFailed: false,
						speedBps: 0,
						etaSeconds: 0,
						loadedBytes: prev.totalBytes,
					}))
					delete uploadMoveByTaskIdRef.current[taskId]
					return
				}

				updateUploadTask(taskId, (prev) => ({
					...prev,
					status: 'cleanup',
					error: undefined,
					cleanupFailed: false,
				}))

				try {
					const result = await removeEntriesFromDirectoryHandle({
						root: movePlan.rootHandle,
						relPaths: movePlan.relPaths,
						cleanupEmptyDirs: movePlan.cleanupEmptyDirs,
					})
					const summary = formatMoveCleanupSummary(result, movePlan.label ?? '')
					if (result.failed.length > 0) {
						updateUploadTask(taskId, (prev) => ({
							...prev,
							status: 'failed',
							finishedAtMs: Date.now(),
							error: summary,
							cleanupFailed: true,
						}))
						showMoveCleanupReport({
							title: 'Move completed with errors',
							label: movePlan.label,
							bucket: current.bucket,
							prefix: current.prefix,
							filenameTemplate: moveCleanupFilenameTemplate,
							filenameMaxLen: moveCleanupFilenameMaxLen,
							result,
						})
					} else {
						updateUploadTask(taskId, (prev) => ({
							...prev,
							status: 'succeeded',
							finishedAtMs: Date.now(),
							speedBps: 0,
							etaSeconds: 0,
							loadedBytes: prev.totalBytes,
						}))
						const label = movePlan.label ? ` from ${movePlan.label}` : ''
						message.success(`Moved ${result.removed.length} item(s)${label}`)
						if (result.skipped.length > 0 || result.removedDirs.length > 0) {
							showMoveCleanupReport({
								title: 'Move completed with notes',
								label: movePlan.label,
								bucket: current.bucket,
								prefix: current.prefix,
								filenameTemplate: moveCleanupFilenameTemplate,
								filenameMaxLen: moveCleanupFilenameMaxLen,
								result,
								kind: 'info',
							})
						}
						delete uploadMoveByTaskIdRef.current[taskId]
					}
				} catch (err) {
					maybeReportNetworkError(err)
					const msg = formatErr(err)
					updateUploadTask(taskId, (prev) => ({
						...prev,
						status: 'failed',
						finishedAtMs: Date.now(),
						error: msg,
						cleanupFailed: true,
					}))
					message.error(msg)
				}
				return
			}

			if (status === 'failed') {
				updateUploadTask(taskId, (prev) => ({
					...prev,
					status: 'failed',
					finishedAtMs: Date.now(),
					error: error ?? 'upload job failed',
					cleanupFailed: false,
					speedBps: 0,
					etaSeconds: 0,
				}))
				delete uploadMoveByTaskIdRef.current[taskId]
				return
			}

			if (status === 'canceled') {
				updateUploadTask(taskId, (prev) => ({
					...prev,
					status: 'canceled',
					finishedAtMs: Date.now(),
					error: error ?? prev.error,
					cleanupFailed: false,
					speedBps: 0,
					etaSeconds: 0,
				}))
				delete uploadMoveByTaskIdRef.current[taskId]
			}
		},
		[moveCleanupFilenameMaxLen, moveCleanupFilenameTemplate, updateUploadTask],
	)

	const handleUploadJobUpdate = useCallback(
		async (taskId: string, job: { status?: JobStatus; progress?: JobProgress | null; error?: string | null }) => {
			const current = uploadTasksRef.current.find((t) => t.id === taskId)
			if (!current || current.status !== 'waiting_job') return
			if (job.progress) {
				updateUploadTaskProgressFromJob(taskId, job.progress)
			}
			if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'canceled') {
				await finalizeUploadJob(taskId, job.status, job.error ?? null)
			}
		},
		[finalizeUploadJob, updateUploadTaskProgressFromJob],
	)

	const cancelUploadTask = useCallback(
		(taskId: string) => {
			const abort = uploadAbortByTaskIdRef.current[taskId]
			if (abort) abort()
			updateUploadTask(taskId, (t) => {
				if (t.status === 'succeeded') return t
				return { ...t, status: 'canceled', finishedAtMs: Date.now() }
			})
		},
		[updateUploadTask],
	)

	const retryUploadTask = useCallback(
		async (taskId: string) => {
			const current = uploadTasksRef.current.find((t) => t.id === taskId)
			if (!current) return

			const movePlan = uploadMoveByTaskIdRef.current[taskId]
			if (current.cleanupFailed && current.moveAfterUpload && current.jobId && movePlan) {
				updateUploadTask(taskId, (t) => ({
					...t,
					status: 'waiting_job',
					finishedAtMs: undefined,
					error: undefined,
					cleanupFailed: false,
				}))
				return
			}

			let items = uploadItemsByTaskIdRef.current[taskId]
			if (!items || items.length === 0) {
				const resumeFiles = current.resumeFiles ?? []
				const expectedPaths = (resumeFiles.length > 0 ? resumeFiles.map((f) => f.path) : current.filePaths ?? [])
					.map(normalizeRelPath)
					.filter(Boolean)
				const expectDirectory = expectedPaths.some((p) => p.includes('/'))
				const selected = await promptForFiles({
					multiple: current.fileCount > 1 || expectDirectory,
					directory: expectDirectory,
				})
				if (!selected) return

				const selectedItems = buildUploadItems(selected)
				if (expectedPaths.length > 0) {
					const selectedByPath = new Map(
						selectedItems.map((item) => [normalizeRelPath(item.relPath ?? item.file.name), item]),
					)
					const matched: UploadFileItem[] = []
					const missing: string[] = []
					for (const path of expectedPaths) {
						const found = selectedByPath.get(path)
						if (!found) {
							missing.push(path)
							continue
						}
						if (resumeFiles.length > 0) {
							const resume = resumeFiles.find((f) => normalizeRelPath(f.path) === path)
							if (resume && found.file?.size !== resume.size) {
								missing.push(path)
								continue
							}
						}
						matched.push(found)
					}
					if (missing.length > 0) {
						message.error(`Missing ${missing.length} file(s). Select the same files or folder to resume.`)
						return
					}
					items = matched
				} else {
					items = selectedItems
				}

				const totalBytes = items.reduce((sum, item) => sum + (item.file?.size ?? 0), 0)
				if (current.resumeFileSize && items.length === 1 && items[0]?.file?.size !== current.resumeFileSize) {
					message.error('Selected file size does not match the previous upload.')
					return
				}
				uploadItemsByTaskIdRef.current[taskId] = items
				updateUploadTask(taskId, (t) => ({
					...t,
					fileCount: items.length,
					totalBytes,
					filePaths: items.map((item) => normalizeRelPath(item.relPath ?? item.file.name)).filter(Boolean),
					resumeFileSize: items.length === 1 ? items[0]?.file?.size ?? 0 : undefined,
				}))
			}

			updateUploadTask(taskId, (t) => ({
				...t,
				status: 'queued',
				startedAtMs: undefined,
				finishedAtMs: undefined,
				loadedBytes: 0,
				speedBps: 0,
				etaSeconds: 0,
				error: undefined,
				jobId: undefined,
				cleanupFailed: false,
			}))
		},
		[updateUploadTask],
	)

	const removeUploadTask = useCallback((taskId: string) => {
		const abort = uploadAbortByTaskIdRef.current[taskId]
		if (abort) abort()
		delete uploadAbortByTaskIdRef.current[taskId]
		delete uploadEstimatorByTaskIdRef.current[taskId]
		delete uploadItemsByTaskIdRef.current[taskId]
		delete uploadMoveByTaskIdRef.current[taskId]
		setUploadTasks((prev) => prev.filter((t) => t.id !== taskId))
	}, [])

	const clearCompletedUploads = useCallback(() => {
		setUploadTasks((prev) => {
			for (const t of prev) {
				if (t.status !== 'succeeded') continue
				delete uploadAbortByTaskIdRef.current[t.id]
				delete uploadEstimatorByTaskIdRef.current[t.id]
				delete uploadItemsByTaskIdRef.current[t.id]
				delete uploadMoveByTaskIdRef.current[t.id]
			}
			return prev.filter((t) => t.status !== 'succeeded')
		})
	}, [])

	const clearAllTransfers = useCallback(() => {
		for (const abort of Object.values(downloadAbortByTaskIdRef.current)) abort()
		for (const abort of Object.values(uploadAbortByTaskIdRef.current)) abort()
		downloadAbortByTaskIdRef.current = {}
		downloadEstimatorByTaskIdRef.current = {}
		uploadAbortByTaskIdRef.current = {}
		uploadEstimatorByTaskIdRef.current = {}
		uploadItemsByTaskIdRef.current = {}
		uploadMoveByTaskIdRef.current = {}
		setDownloadTasks([])
		setUploadTasks([])
	}, [])

	const startDownloadTask = useCallback(
		async (taskId: string) => {
			const current = downloadTasksRef.current.find((t) => t.id === taskId)
			if (!current || current.status !== 'queued') return

			const estimator = new TransferEstimator({ totalBytes: current.totalBytes })
			downloadEstimatorByTaskIdRef.current[taskId] = estimator
			updateDownloadTask(taskId, (t) => ({
				...t,
				status: 'running',
				startedAtMs: estimator.getStartedAtMs(),
				finishedAtMs: undefined,
				loadedBytes: 0,
				speedBps: 0,
				etaSeconds: 0,
				error: undefined,
			}))

			if (current.kind === 'object_device') {
				const controller = new AbortController()
				downloadAbortByTaskIdRef.current[taskId] = () => controller.abort()

				try {
					await ensureReadWritePermission(current.targetDirHandle)
					let res: Response
					if (downloadLinkProxyEnabled) {
						const proxy = await api.getObjectDownloadURL({
							profileId: current.profileId,
							bucket: current.bucket,
							key: current.key,
							proxy: true,
						})
						res = await fetch(proxy.url, { signal: controller.signal })
					} else {
						try {
							const direct = await api.getObjectDownloadURL({
								profileId: current.profileId,
								bucket: current.bucket,
								key: current.key,
							})
							res = await fetch(direct.url, { signal: controller.signal })
						} catch (err) {
							if (!shouldFallbackToProxy(err) || controller.signal.aborted) {
								throw err
							}
							const proxy = await api.getObjectDownloadURL({
								profileId: current.profileId,
								bucket: current.bucket,
								key: current.key,
								proxy: true,
							})
							res = await fetch(proxy.url, { signal: controller.signal })
						}
					}
					if (!res.ok) {
						throw new Error(`Download failed (HTTP ${res.status})`)
					}
					const fileHandle = await getFileHandleForPath(current.targetDirHandle, current.targetPath)

					await writeResponseToFile({
						response: res,
						fileHandle,
						signal: controller.signal,
						onProgress: (p) => {
							const e = downloadEstimatorByTaskIdRef.current[taskId]
							if (!e) return
							const stats = e.update(p.loadedBytes, p.totalBytes)
							updateDownloadTask(taskId, (t) => ({
								...t,
								loadedBytes: stats.loadedBytes,
								totalBytes: stats.totalBytes ?? t.totalBytes,
								speedBps: stats.speedBps,
								etaSeconds: stats.etaSeconds,
							}))
						},
					})

					updateDownloadTask(taskId, (t) => ({
						...t,
						status: 'succeeded',
						finishedAtMs: Date.now(),
						loadedBytes: typeof t.totalBytes === 'number' ? t.totalBytes : t.loadedBytes,
					}))
					message.success(`Downloaded ${current.targetPath}`)
				} catch (err) {
					const error = err as Error
					if (error?.name === 'AbortError' || err instanceof RequestAbortedError) {
						updateDownloadTask(taskId, (t) => ({ ...t, status: 'canceled', finishedAtMs: Date.now() }))
						return
					}
					maybeReportNetworkError(err)
					const msg = formatErr(err)
					updateDownloadTask(taskId, (t) => ({ ...t, status: 'failed', finishedAtMs: Date.now(), error: msg }))
					message.error(msg)
				} finally {
					delete downloadAbortByTaskIdRef.current[taskId]
					delete downloadEstimatorByTaskIdRef.current[taskId]
				}
				return
			}

			if (current.kind === 'object') {
				try {
					const runDownload = async (proxy: boolean) => {
						const presigned = await api.getObjectDownloadURL({
							profileId: current.profileId,
							bucket: current.bucket,
							key: current.key,
							proxy,
						})
						const latest = downloadTasksRef.current.find((t) => t.id === taskId)
						if (!latest || latest.status !== 'running') {
							throw new RequestAbortedError()
						}
						const handle = downloadURLWithProgress(presigned.url, {
							onProgress: (p) => {
								const e = downloadEstimatorByTaskIdRef.current[taskId]
								if (!e) return
								const stats = e.update(p.loadedBytes, p.totalBytes)
								updateDownloadTask(taskId, (t) => ({
									...t,
									loadedBytes: stats.loadedBytes,
									totalBytes: stats.totalBytes ?? t.totalBytes,
									speedBps: stats.speedBps,
									etaSeconds: stats.etaSeconds,
								}))
							},
						})
						downloadAbortByTaskIdRef.current[taskId] = handle.abort
						return await handle.promise
					}

					let resp: { blob: Blob; contentDisposition: string | null; contentType: string | null }
					if (downloadLinkProxyEnabled) {
						resp = await runDownload(true)
					} else {
						try {
							resp = await runDownload(false)
						} catch (err) {
							if (!shouldFallbackToProxy(err)) {
								throw err
							}
							resp = await runDownload(true)
						}
					}
					const fallbackName = defaultFilenameFromKey(current.key)
					const filename = filenameFromContentDisposition(resp.contentDisposition) ?? (current.filenameHint?.trim() || fallbackName)
					saveBlob(resp.blob, filename)
					updateDownloadTask(taskId, (t) => ({
						...t,
						status: 'succeeded',
						finishedAtMs: Date.now(),
						loadedBytes: typeof t.totalBytes === 'number' ? t.totalBytes : t.loadedBytes,
						filenameHint: filename,
					}))
					message.success(`Downloaded ${filename}`)
				} catch (err) {
					if (err instanceof RequestAbortedError) {
						updateDownloadTask(taskId, (t) => ({ ...t, status: 'canceled', finishedAtMs: Date.now() }))
						return
					}
					maybeReportNetworkError(err)
					const msg = formatErr(err)
					updateDownloadTask(taskId, (t) => ({ ...t, status: 'failed', finishedAtMs: Date.now(), error: msg }))
					message.error(msg)
				} finally {
					delete downloadAbortByTaskIdRef.current[taskId]
					delete downloadEstimatorByTaskIdRef.current[taskId]
				}
				return
			}

			const handle = api.downloadJobArtifact(
				{ profileId: current.profileId, jobId: current.jobId },
				{
					onProgress: (p) => {
						const e = downloadEstimatorByTaskIdRef.current[taskId]
						if (!e) return
						const stats = e.update(p.loadedBytes, p.totalBytes)
						updateDownloadTask(taskId, (t) => ({
							...t,
							loadedBytes: stats.loadedBytes,
							totalBytes: stats.totalBytes ?? t.totalBytes,
							speedBps: stats.speedBps,
							etaSeconds: stats.etaSeconds,
						}))
					},
				},
			)

			downloadAbortByTaskIdRef.current[taskId] = handle.abort

			try {
				const resp = await handle.promise
				const fallbackName = current.filenameHint?.trim() || `job-${current.jobId}.zip`
				const filename = filenameFromContentDisposition(resp.contentDisposition) ?? fallbackName
				saveBlob(resp.blob, filename)
				updateDownloadTask(taskId, (t) => ({
					...t,
					status: 'succeeded',
					finishedAtMs: Date.now(),
					loadedBytes: typeof t.totalBytes === 'number' ? t.totalBytes : t.loadedBytes,
					filenameHint: filename,
				}))
				message.success(`Downloaded ${filename}`)
			} catch (err) {
				if (err instanceof RequestAbortedError) {
					updateDownloadTask(taskId, (t) => ({ ...t, status: 'canceled', finishedAtMs: Date.now() }))
					return
				}
				maybeReportNetworkError(err)
				const msg = formatErr(err)
				updateDownloadTask(taskId, (t) => ({ ...t, status: 'failed', finishedAtMs: Date.now(), error: msg }))
				message.error(msg)
			} finally {
				delete downloadAbortByTaskIdRef.current[taskId]
				delete downloadEstimatorByTaskIdRef.current[taskId]
			}
		},
		[api, downloadLinkProxyEnabled, updateDownloadTask],
	)

	useEffect(() => {
		const running = downloadTasks.filter((t) => t.status === 'running').length
		const capacity = downloadConcurrency - running
		if (capacity <= 0) return
		const toStart = downloadTasks.filter((t) => t.status === 'queued').slice(0, capacity)
		for (const t of toStart) void startDownloadTask(t.id)
	}, [downloadConcurrency, downloadTasks, startDownloadTask])

	const hasWaitingJobArtifactDownloads = downloadTasks.some((t) => t.kind === 'job_artifact' && t.status === 'waiting')
	useEffect(() => {
		if (!hasWaitingJobArtifactDownloads) return

		let stopped = false
		const tick = async () => {
			const waiting = downloadTasksRef.current.filter(
				(t): t is JobArtifactDownloadTask => t.kind === 'job_artifact' && t.status === 'waiting',
			)
			for (const t of waiting) {
				if (stopped) return
				try {
					const job = await api.getJob(t.profileId, t.jobId)
					if (stopped) return

					if (job.status === 'succeeded') {
						updateDownloadTask(t.id, (prev) => ({ ...prev, status: 'queued', error: undefined }))
						continue
					}
					if (job.status === 'failed') {
						updateDownloadTask(t.id, (prev) => ({
							...prev,
							status: 'failed',
							finishedAtMs: Date.now(),
							error: job.error ?? 'job failed',
						}))
						continue
					}
					if (job.status === 'canceled') {
						updateDownloadTask(t.id, (prev) => ({
							...prev,
							status: 'canceled',
							finishedAtMs: Date.now(),
							error: job.error ?? prev.error,
						}))
					}
				} catch (err) {
					maybeReportNetworkError(err)
					updateDownloadTask(t.id, (prev) => ({ ...prev, error: formatErr(err) }))
				}
			}
		}

		void tick()
		const id = window.setInterval(() => void tick(), 1500)
		return () => {
			stopped = true
			window.clearInterval(id)
		}
	}, [api, hasWaitingJobArtifactDownloads, updateDownloadTask])

	const startUploadTask = useCallback(
		async (taskId: string) => {
			const current = uploadTasksRef.current.find((t) => t.id === taskId)
			if (!current || current.status !== 'queued') return

			const items = uploadItemsByTaskIdRef.current[taskId]
			if (!items || items.length === 0) {
				updateUploadTask(taskId, (t) => ({ ...t, status: 'failed', finishedAtMs: Date.now(), error: 'missing files (remove and re-add)' }))
				return
			}

			const estimator = new TransferEstimator({ totalBytes: current.totalBytes })
			uploadEstimatorByTaskIdRef.current[taskId] = estimator
			updateUploadTask(taskId, (t) => ({
				...t,
				status: 'staging',
				startedAtMs: estimator.getStartedAtMs(),
				finishedAtMs: undefined,
				loadedBytes: 0,
				speedBps: 0,
				etaSeconds: 0,
				error: undefined,
				jobId: undefined,
			}))

			let committed = false
			let uploadId = ''
			let existingChunksByPath: Record<string, number[]> | undefined
			try {
				const maxFileBytes =
					items.length > 0 ? Math.max(...items.map((entry) => entry.file?.size ?? 0)) : current.totalBytes
				const tuning = pickUploadTuning(current.totalBytes, Number.isFinite(maxFileBytes) ? maxFileBytes : null)

				const allowResume = current.uploadMode !== 'presigned'
				const resumeFilesByPath = new Map<string, { size: number; chunkSizeBytes: number }>()
				if (allowResume) {
					if (current.resumeFiles && current.resumeFiles.length > 0) {
						for (const file of current.resumeFiles) {
							const pathKey = normalizeRelPath(file.path)
							if (!pathKey) continue
							resumeFilesByPath.set(pathKey, { size: file.size, chunkSizeBytes: file.chunkSizeBytes })
						}
					} else if (current.resumeChunkSizeBytes && current.resumeFileSize && items.length === 1) {
						const pathKey = resolveUploadItemPathNormalized(items[0])
						if (pathKey) {
							resumeFilesByPath.set(pathKey, {
								size: current.resumeFileSize,
								chunkSizeBytes: current.resumeChunkSizeBytes,
							})
						}
					}
				}

				let resumeChunkSizeBytes = 0
				let allowPerFileChunkSize = false
				if (allowResume && resumeFilesByPath.size > 0) {
					allowPerFileChunkSize = uploadResumeConversionEnabled
					const distinctSizes = new Set(Array.from(resumeFilesByPath.values()).map((v) => v.chunkSizeBytes))
					if (distinctSizes.size > 1) {
						if (!uploadResumeConversionEnabled) {
							message.error('Resume requires consistent chunk size across files. Enable conversion mode or re-add files.')
							return
						}
						allowPerFileChunkSize = true
					}
					resumeChunkSizeBytes = Array.from(distinctSizes)[0] ?? 0
				}

				if (allowResume && current.uploadId && resumeFilesByPath.size > 0) {
					const existing: Record<string, number[]> = {}
					let resumeAvailable = true
					for (const item of items) {
						const pathRaw = resolveUploadItemPath(item)
						const pathKey = normalizeRelPath(pathRaw)
						const resumeInfo = resumeFilesByPath.get(pathKey)
						if (!resumeInfo) continue
						if ((item.file?.size ?? 0) !== resumeInfo.size) {
							message.error('Selected file size does not match the previous upload.')
							return
						}
						try {
							const chunkState = await api.getUploadChunks(current.profileId, current.uploadId, {
								path: pathRaw,
								total: Math.max(1, Math.ceil(resumeInfo.size / resumeInfo.chunkSizeBytes)),
								chunkSize: resumeInfo.chunkSizeBytes,
								fileSize: resumeInfo.size,
							})
							existing[pathRaw] = chunkState.present
						} catch (err) {
							if (err instanceof APIError && err.status === 404) {
								resumeAvailable = false
								break
							}
							throw err
						}
					}
					if (resumeAvailable) {
						uploadId = current.uploadId
						existingChunksByPath = existing
					}
				}

				let sessionMode = current.uploadMode
				if (!uploadId) {
					const uploadCapability = props.uploadCapabilityByProfileId?.[current.profileId]
					const canUsePresigned = uploadCapability ? uploadCapability.presignedUpload : true
					const canUseDirect = uploadCapability ? uploadCapability.directUpload : !!props.uploadDirectStream
					const directModePreferred = !!props.uploadDirectStream && canUseDirect
					const fallbackMode: 'direct' | 'staging' = directModePreferred ? 'direct' : 'staging'
					const preferredMode: 'presigned' | 'direct' | 'staging' = canUsePresigned ? 'presigned' : fallbackMode
					let session: { uploadId: string; mode: 'staging' | 'direct' | 'presigned'; maxBytes?: number | null }
					try {
						session = await api.createUpload(current.profileId, {
							bucket: current.bucket,
							prefix: current.prefix ?? '',
							mode: preferredMode,
						})
					} catch (err) {
						if (
							canUsePresigned &&
							err instanceof APIError &&
							(err.code === 'not_supported' || err.code === 'invalid_request')
						) {
							session = await api.createUpload(current.profileId, {
								bucket: current.bucket,
								prefix: current.prefix ?? '',
								mode: fallbackMode,
							})
							message.info(`Presigned uploads are not supported here. Falling back to ${fallbackMode} uploads.`)
						} else if (
							preferredMode === 'direct' &&
							err instanceof APIError &&
							(err.code === 'not_supported' || err.code === 'invalid_request')
						) {
							session = await api.createUpload(current.profileId, {
								bucket: current.bucket,
								prefix: current.prefix ?? '',
								mode: 'staging',
							})
						} else {
							throw err
						}
					}
					uploadId = session.uploadId
					sessionMode = session.mode
					if (session.maxBytes && current.totalBytes > session.maxBytes) {
						throw new Error(`selected files exceed maxBytes (${current.totalBytes} > ${session.maxBytes})`)
					}
				}

				const chunkSizeBytes = resumeChunkSizeBytes > 0 && !allowPerFileChunkSize ? resumeChunkSizeBytes : tuning.chunkSizeBytes
				const chunkThresholdBytes = tuning.chunkThresholdBytes
				const shouldTrackResume = sessionMode !== 'presigned'
				const chunkSizeByPath: Record<string, number> = {}

				const resumeFilesNext = shouldTrackResume
					? items
							.filter((item) => {
								const pathKey = resolveUploadItemPathNormalized(item)
								if (resumeFilesByPath.has(pathKey)) return true
								return (item.file?.size ?? 0) >= chunkThresholdBytes
							})
							.map((item) => {
								const pathKey = resolveUploadItemPathNormalized(item)
								const pathRaw = resolveUploadItemPath(item)
								const resumeInfo = resumeFilesByPath.get(pathKey)
								const fileChunkSize = resumeInfo?.chunkSizeBytes ?? chunkSizeBytes
								if (pathRaw) {
									chunkSizeByPath[pathRaw] = fileChunkSize
								}
								return {
									path: pathKey,
									size: item.file?.size ?? 0,
									chunkSizeBytes: fileChunkSize,
								}
							})
					: undefined

				updateUploadTask(taskId, (t) => ({
					...t,
					uploadId,
					uploadMode: sessionMode,
					resumeChunkSizeBytes: shouldTrackResume && items.length === 1 ? chunkSizeBytes : undefined,
					resumeFileSize: items.length === 1 ? items[0]?.file?.size ?? 0 : undefined,
					resumeFiles: resumeFilesNext,
				}))

				const handle =
					sessionMode === 'presigned'
						? uploadPresignedFilesWithProgress({
								api,
								profileId: current.profileId,
								uploadId,
								items,
								onProgress: (p) => {
									const e = uploadEstimatorByTaskIdRef.current[taskId]
									if (!e) return
									const stats = e.update(p.loadedBytes, p.totalBytes)
									updateUploadTask(taskId, (t) => ({
										...t,
										loadedBytes: stats.loadedBytes,
										totalBytes: stats.totalBytes ?? t.totalBytes,
										speedBps: stats.speedBps,
										etaSeconds: stats.etaSeconds,
									}))
								},
								singleConcurrency: tuning.batchConcurrency,
								multipartFileConcurrency: uploadChunkFileConcurrency,
								partConcurrency: tuning.chunkConcurrency,
								chunkThresholdBytes,
								chunkSizeBytes,
							})
						: api.uploadFilesWithProgress(current.profileId, uploadId, items, {
								onProgress: (p) => {
									const e = uploadEstimatorByTaskIdRef.current[taskId]
									if (!e) return
									const stats = e.update(p.loadedBytes, p.totalBytes)
									updateUploadTask(taskId, (t) => ({
										...t,
										loadedBytes: stats.loadedBytes,
										totalBytes: stats.totalBytes ?? t.totalBytes,
										speedBps: stats.speedBps,
										etaSeconds: stats.etaSeconds,
									}))
								},
								concurrency: tuning.batchConcurrency,
								maxBatchBytes: tuning.batchBytes,
								maxBatchItems: 50,
								chunkSizeBytes,
								chunkConcurrency: tuning.chunkConcurrency,
								chunkThresholdBytes,
								existingChunksByPath,
								chunkSizeBytesByPath: allowPerFileChunkSize ? chunkSizeByPath : undefined,
								chunkFileConcurrency: uploadChunkFileConcurrency,
							})
				uploadAbortByTaskIdRef.current[taskId] = handle.abort
				const result = await handle.promise
				delete uploadAbortByTaskIdRef.current[taskId]
				if (result.skipped > 0) {
					message.warning(`Skipped ${result.skipped} file(s) with invalid paths.`)
				}

				updateUploadTask(taskId, (t) => ({
					...t,
					status: 'commit',
					loadedBytes: t.totalBytes,
					speedBps: 0,
					etaSeconds: 0,
				}))

				const commitReq = buildUploadCommitRequest(current, items)
				const resp = await withJobQueueRetry(() => api.commitUpload(current.profileId, uploadId, commitReq))
				committed = true
				delete uploadItemsByTaskIdRef.current[taskId]
				updateUploadTask(taskId, (t) => ({
					...t,
					status: 'waiting_job',
					finishedAtMs: undefined,
					jobId: resp.jobId,
					cleanupFailed: false,
					loadedBytes: 0,
					speedBps: 0,
					etaSeconds: 0,
				}))

				if (resp.jobId) {
					void api
						.getJob(current.profileId, resp.jobId)
						.then((job) => handleUploadJobUpdate(taskId, job))
						.catch((err) => {
							maybeReportNetworkError(err)
							updateUploadTask(taskId, (prev) => ({ ...prev, error: formatErr(err) }))
						})
				}

							message.open({
								type: 'success',
								content: (
									<Space>
										<Typography.Text>Upload committed (job {resp.jobId})</Typography.Text>
										<Button size="small" type="link" onClick={() => navigate('/jobs')}>
											Open Jobs
										</Button>
									</Space>
								),
								duration: 6,
							})
				await queryClient.invalidateQueries({ queryKey: ['jobs'] })
			} catch (err) {
				if (err instanceof RequestAbortedError) {
					updateUploadTask(taskId, (t) => ({ ...t, status: 'canceled', finishedAtMs: Date.now() }))
					message.info('Upload canceled')
					return
				}
				maybeReportNetworkError(err)
				const msg = formatErr(err)
				updateUploadTask(taskId, (t) => ({ ...t, status: 'failed', finishedAtMs: Date.now(), error: msg }))
				message.error(msg)
			} finally {
				delete uploadAbortByTaskIdRef.current[taskId]
				delete uploadEstimatorByTaskIdRef.current[taskId]
				if (!committed && uploadId) {
					await api.deleteUpload(current.profileId, uploadId).catch(() => {})
				}
			}
		},
				[
					api,
					handleUploadJobUpdate,
					navigate,
					pickUploadTuning,
					props.uploadCapabilityByProfileId,
					props.uploadDirectStream,
					queryClient,
					updateUploadTask,
				uploadChunkFileConcurrency,
				uploadResumeConversionEnabled,
			],
	)

	useEffect(() => {
		const running = uploadTasks.filter((t) => t.status === 'staging' || t.status === 'commit').length
		const capacity = uploadConcurrency - running
		if (capacity <= 0) return
		const toStart = uploadTasks.filter((t) => t.status === 'queued').slice(0, capacity)
		for (const t of toStart) void startUploadTask(t.id)
	}, [startUploadTask, uploadConcurrency, uploadTasks])

	const hasPendingUploadJobs = uploadTasks.some((t) => t.status === 'waiting_job')
	useEffect(() => {
		if (!hasPendingUploadJobs) {
			setUploadEventsConnected(false)
			return
		}
		if (typeof window === 'undefined') {
			setUploadEventsConnected(false)
			return
		}

		let stopped = false
		let ws: WebSocket | null = null
		let es: EventSource | null = null
		let reconnectTimer: number | null = null
		let reconnectAttempt = 0
		let wsFallbackTimer: number | null = null
		let wsOpened = false

		const clearReconnect = () => {
			if (reconnectTimer) {
				window.clearTimeout(reconnectTimer)
				reconnectTimer = null
			}
		}

		const clearWSFallbackTimer = () => {
			if (wsFallbackTimer) {
				window.clearTimeout(wsFallbackTimer)
				wsFallbackTimer = null
			}
		}

		const scheduleReconnect = () => {
			if (stopped || reconnectTimer) return
			const jitter = Math.floor(Math.random() * 250)
			const delay = Math.min(20_000, 1000 * Math.pow(2, reconnectAttempt) + jitter)
			reconnectAttempt += 1
			reconnectTimer = window.setTimeout(() => {
				reconnectTimer = null
				if (stopped) return
				connect()
			}, delay)
		}

		const handleEvent = (data: string) => {
			try {
				const msg = JSON.parse(data) as WSEvent
				if (!msg.jobId || typeof msg.payload !== 'object' || msg.payload === null) return
				const task = uploadTasksRef.current.find((t) => t.status === 'waiting_job' && t.jobId === msg.jobId)
				if (!task) return
				if (msg.type !== 'job.progress' && msg.type !== 'job.completed') return
				const payload = msg.payload as { status?: JobStatus; progress?: JobProgress; error?: string | null }
				void handleUploadJobUpdate(task.id, payload)
			} catch {
				// ignore malformed events
			}
		}

		const closeTransport = () => {
			if (ws) {
				try {
					ws.close()
				} catch {
					// ignore
				}
				ws = null
			}
			if (es) {
				try {
					es.close()
				} catch {
					// ignore
				}
				es = null
			}
		}

		const connectSSE = () => {
			if (stopped || typeof window.EventSource === 'undefined') {
				setUploadEventsConnected(false)
				scheduleReconnect()
				return
			}
			clearReconnect()
			clearWSFallbackTimer()
			closeTransport()
			try {
				es = new EventSource(buildSSEURL(props.apiToken))
			} catch {
				setUploadEventsConnected(false)
				scheduleReconnect()
				return
			}
			es.onopen = () => {
				setUploadEventsConnected(true)
				reconnectAttempt = 0
			}
			es.onerror = () => {
				setUploadEventsConnected(false)
				scheduleReconnect()
			}
			es.onmessage = (ev) => handleEvent(ev.data)
		}

		const connectWS = () => {
			if (stopped || typeof window.WebSocket === 'undefined') {
				connectSSE()
				return
			}
			clearReconnect()
			clearWSFallbackTimer()
			closeTransport()
			wsOpened = false
			try {
				ws = new WebSocket(buildWSURL(props.apiToken))
			} catch {
				connectSSE()
				return
			}
			wsFallbackTimer = window.setTimeout(() => {
				if (!wsOpened && !stopped) {
					connectSSE()
				}
			}, 1500)
			ws.onopen = () => {
				wsOpened = true
				clearWSFallbackTimer()
				setUploadEventsConnected(true)
				reconnectAttempt = 0
			}
			ws.onerror = () => {
				setUploadEventsConnected(false)
				if (!wsOpened) {
					clearWSFallbackTimer()
					connectSSE()
					return
				}
				scheduleReconnect()
			}
			ws.onclose = () => {
				setUploadEventsConnected(false)
				if (!wsOpened) {
					clearWSFallbackTimer()
					connectSSE()
					return
				}
				scheduleReconnect()
			}
			ws.onmessage = (ev) => handleEvent(typeof ev.data === 'string' ? ev.data : '')
		}

		const connect = () => {
			connectWS()
		}

		connect()
		return () => {
			stopped = true
			clearReconnect()
			clearWSFallbackTimer()
			closeTransport()
		}
	}, [handleUploadJobUpdate, hasPendingUploadJobs, props.apiToken])

	useEffect(() => {
		if (!hasPendingUploadJobs || uploadEventsConnected) return

		let stopped = false
		const tick = async () => {
			const waiting = uploadTasksRef.current.filter((t) => t.status === 'waiting_job' && !!t.jobId)
			for (const task of waiting) {
				if (stopped) return
				try {
					const job = await api.getJob(task.profileId, task.jobId as string)
					if (stopped) return
					await handleUploadJobUpdate(task.id, job)
				} catch (err) {
					maybeReportNetworkError(err)
					updateUploadTask(task.id, (prev) => ({ ...prev, error: formatErr(err) }))
				}
			}
		}

		void tick()
		const id = window.setInterval(() => void tick(), 2000)
		return () => {
			stopped = true
			window.clearInterval(id)
		}
	}, [api, handleUploadJobUpdate, hasPendingUploadJobs, updateUploadTask, uploadEventsConnected])

	const queueDownloadObject = useCallback(
		(args: { profileId: string; bucket: string; key: string; expectedBytes?: number; label?: string; filenameHint?: string }) => {
			const existing = downloadTasksRef.current.find(
				(t) =>
					t.kind === 'object' &&
					t.profileId === args.profileId &&
					t.bucket === args.bucket &&
					t.key === args.key &&
					(t.status === 'queued' || t.status === 'waiting' || t.status === 'running'),
			)
			if (existing) {
				openTransfers('downloads')
				message.info('Download already queued')
				return
			}

			const totalBytes = typeof args.expectedBytes === 'number' && args.expectedBytes >= 0 ? args.expectedBytes : undefined
			const taskId = randomId()
			const task: ObjectDownloadTask = {
				id: taskId,
				kind: 'object',
				profileId: args.profileId,
				label: args.label?.trim() || args.key,
				status: 'queued',
				createdAtMs: Date.now(),
				loadedBytes: 0,
				totalBytes,
				speedBps: 0,
				etaSeconds: 0,
				bucket: args.bucket,
				key: args.key,
				filenameHint: args.filenameHint?.trim() || defaultFilenameFromKey(args.key),
			}

			setDownloadTasks((prev) => [task, ...prev])
			openTransfers('downloads')
		},
		[openTransfers],
	)

	const queueDownloadObjectsToDevice = useCallback(
		(args: {
			profileId: string
			bucket: string
			items: { key: string; size?: number }[]
			targetDirHandle: FileSystemDirectoryHandle
			targetLabel?: string
			prefix?: string
		}) => {
			const support = getDevicePickerSupport()
			if (!support.ok) {
				message.error(support.reason ?? 'Directory picker is not available.')
				return
			}

			const prefix = normalizePrefixForDevice(args.prefix)
			const tasks: ObjectDeviceDownloadTask[] = []
			for (const item of args.items) {
				if (!item?.key) continue
				if (item.key.endsWith('/')) continue
				const relative = prefix && item.key.startsWith(prefix) ? item.key.slice(prefix.length) : item.key
				const targetPath = normalizeDevicePath(relative || defaultFilenameFromKey(item.key))
				const label = relative || item.key
				const taskId = randomId()
				tasks.push({
					id: taskId,
					kind: 'object_device',
					profileId: args.profileId,
					bucket: args.bucket,
					key: item.key,
					label,
					status: 'queued',
					createdAtMs: Date.now(),
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

			if (tasks.length === 0) {
				message.info('No objects to download')
				return
			}

			setDownloadTasks((prev) => [...tasks, ...prev])
			openTransfers('downloads')
		},
		[openTransfers],
	)

	const queueDownloadJobArtifact = useCallback(
		(args: { profileId: string; jobId: string; label?: string; filenameHint?: string; waitForJob?: boolean }) => {
			const existing = downloadTasksRef.current.find(
				(t) =>
					t.kind === 'job_artifact' &&
					t.profileId === args.profileId &&
					t.jobId === args.jobId &&
					(t.status === 'queued' || t.status === 'waiting' || t.status === 'running'),
			)
			if (existing) {
				openTransfers('downloads')
				message.info('Artifact download already queued')
				return
			}

			const taskId = randomId()
			const task: JobArtifactDownloadTask = {
				id: taskId,
				kind: 'job_artifact',
				profileId: args.profileId,
				jobId: args.jobId,
				label: args.label?.trim() || `Job artifact: ${args.jobId}`,
				status: args.waitForJob ? 'waiting' : 'queued',
				createdAtMs: Date.now(),
				loadedBytes: 0,
				totalBytes: undefined,
				speedBps: 0,
				etaSeconds: 0,
				error: undefined,
				filenameHint: args.filenameHint?.trim() || `job-${args.jobId}.zip`,
			}

			setDownloadTasks((prev) => [task, ...prev])
			openTransfers('downloads')
		},
		[openTransfers],
	)

	const queueUploadFiles = useCallback(
		(args: { profileId: string; bucket: string; prefix: string; files: File[]; label?: string; moveSource?: UploadMovePlan }) => {
			const files = args.files.filter((f) => !!f)
			if (files.length === 0) return

			const items: UploadFileItem[] = buildUploadItems(files)
			const totalBytes = items.reduce((sum, i) => sum + (i.file.size ?? 0), 0)
			const filePaths = items.map((item) => normalizeRelPath(item.relPath ?? item.file.name)).filter(Boolean)

			const taskId = randomId()
			uploadItemsByTaskIdRef.current[taskId] = items
			if (args.moveSource) {
				const relPaths =
					args.moveSource.relPaths.length > 0
						? args.moveSource.relPaths
						: items.map((item) => item.relPath || item.file.name).filter(Boolean)
				uploadMoveByTaskIdRef.current[taskId] = {
					...args.moveSource,
					relPaths,
				}
			}
			const task: UploadTask = {
				id: taskId,
				profileId: args.profileId,
				bucket: args.bucket,
				prefix: args.prefix,
				fileCount: items.length,
				status: 'queued',
				moveAfterUpload: !!args.moveSource,
				moveSourceLabel: args.moveSource?.label,
				createdAtMs: Date.now(),
				loadedBytes: 0,
				totalBytes,
				speedBps: 0,
				etaSeconds: 0,
				error: undefined,
				jobId: undefined,
				label: args.label?.trim() || (items.length === 1 ? `Upload: ${items[0]?.file?.name ?? '1 file'}` : `Upload: ${items.length} file(s)`),
				filePaths,
				resumeFileSize: items.length === 1 ? items[0]?.file?.size ?? 0 : undefined,
			}

			setUploadTasks((prev) => [task, ...prev])
			openTransfers('uploads')
		},
		[openTransfers],
	)

	const ctx = useMemo<TransfersContextValue>(
		() => ({
			isOpen,
			tab,
			activeDownloadCount,
			activeUploadCount,
			activeTransferCount,
			downloadTasks,
			uploadTasks,
			openTransfers,
			closeTransfers,
			queueDownloadObject,
			queueDownloadObjectsToDevice,
			queueDownloadJobArtifact,
			queueUploadFiles,
		}),
		[
			activeDownloadCount,
			activeTransferCount,
			activeUploadCount,
			closeTransfers,
			downloadTasks,
			isOpen,
			openTransfers,
			queueDownloadObjectsToDevice,
			queueDownloadJobArtifact,
			queueDownloadObject,
			queueUploadFiles,
			tab,
			uploadTasks,
		],
	)

	return (
		<TransfersContext.Provider value={ctx}>
			{props.children}
			<Suspense fallback={null}>
				<TransfersDrawer
					open={isOpen}
					onClose={closeTransfers}
					tab={tab}
					onTabChange={(nextTab) => setTab(nextTab)}
					activeDownloadCount={activeDownloadCount}
					activeUploadCount={activeUploadCount}
					activeTransferCount={activeTransferCount}
					downloadTasks={downloadTasks}
					uploadTasks={uploadTasks}
					downloadSummaryText={downloadSummaryText}
					uploadSummaryText={uploadSummaryText}
					hasCompletedDownloads={hasCompletedDownloads}
					hasCompletedUploads={hasCompletedUploads}
					onClearCompletedDownloads={clearCompletedDownloads}
					onClearCompletedUploads={clearCompletedUploads}
					onClearAll={clearAllTransfers}
					onCancelDownload={cancelDownloadTask}
					onRetryDownload={retryDownloadTask}
					onRemoveDownload={removeDownloadTask}
					onCancelUpload={cancelUploadTask}
					onRetryUpload={retryUploadTask}
					onRemoveUpload={removeUploadTask}
					onOpenJobs={() => navigate('/jobs')}
				/>
			</Suspense>
		</TransfersContext.Provider>
	)
}

export function TransfersButton(props: { showLabel?: boolean } = {}) {
	const transfers = useTransfers()
	return (
		<Button
			icon={
				<Badge count={transfers.activeTransferCount} size="small" showZero={false}>
					<DownloadOutlined />
				</Badge>
			}
			onClick={() => transfers.openTransfers()}
		>
			{props.showLabel ? 'Transfers' : null}
		</Button>
	)
}

function summarizeDownloadTasks(tasks: DownloadTask[]): string {
	if (tasks.length === 0) return ''
	const counts = {
		queued: 0,
		waiting: 0,
		running: 0,
		succeeded: 0,
		failed: 0,
		canceled: 0,
	}
	for (const t of tasks) {
		switch (t.status) {
			case 'queued':
				counts.queued++
				break
			case 'waiting':
				counts.waiting++
				break
			case 'running':
				counts.running++
				break
			case 'succeeded':
				counts.succeeded++
				break
			case 'failed':
				counts.failed++
				break
			case 'canceled':
				counts.canceled++
				break
		}
	}
	const parts: string[] = [`Total ${tasks.length}`]
	if (counts.queued) parts.push(`Queued ${counts.queued}`)
	if (counts.waiting) parts.push(`Waiting ${counts.waiting}`)
	if (counts.running) parts.push(`Running ${counts.running}`)
	if (counts.succeeded) parts.push(`Done ${counts.succeeded}`)
	if (counts.failed) parts.push(`Failed ${counts.failed}`)
	if (counts.canceled) parts.push(`Canceled ${counts.canceled}`)
	return parts.join(' · ')
}

const maxUploadCommitItems = 200

type UploadCommitNormalizedItem = {
	path: string
	size: number
}

function normalizeUploadPath(value: string): string {
	const trimmed = value.trim()
	if (!trimmed) return ''
	const normalized = trimmed.replace(/\\/g, '/').replace(/^\/+/, '')
	const parts = normalized.split('/').filter(Boolean)
	const cleaned: string[] = []
	for (const part of parts) {
		if (part === '.' || part === '') continue
		if (part === '..') {
			if (cleaned.length === 0) return ''
			cleaned.pop()
			continue
		}
		if (part.includes('\u0000')) return ''
		cleaned.push(part)
	}
	return cleaned.length ? cleaned.join('/') : ''
}

function deriveUploadRoot(paths: string[]): { rootKind?: 'file' | 'folder' | 'collection'; rootName?: string } {
	if (paths.length === 0) return {}
	if (paths.length === 1) {
		const parts = paths[0].split('/').filter(Boolean)
		if (parts.length === 1) return { rootKind: 'file', rootName: parts[0] }
		return { rootKind: 'folder', rootName: parts[0] }
	}
	const roots = Array.from(new Set(paths.map((p) => p.split('/')[0]).filter(Boolean)))
	if (roots.length === 1) {
		return { rootKind: 'folder', rootName: roots[0] }
	}
	return { rootKind: 'collection' }
}

function buildUploadCommitRequest(task: UploadTask, items: UploadFileItem[]): UploadCommitRequest | undefined {
	const normalizedItems: UploadCommitNormalizedItem[] = []
	for (const item of items) {
		const fileWithPath = item.file as File & { webkitRelativePath?: string; relativePath?: string }
		const rawPath = (item.relPath ?? fileWithPath.webkitRelativePath ?? fileWithPath.relativePath ?? item.file.name).trim()
		const path = normalizeUploadPath(rawPath)
		if (!path) continue
		const size = Number.isFinite(item.file.size) ? item.file.size : 0
		normalizedItems.push({ path, size })
	}
	if (normalizedItems.length === 0) return undefined

	const totalFiles = normalizedItems.length
	const totalBytes = normalizedItems.reduce((sum, item) => sum + item.size, 0)
	const root = deriveUploadRoot(normalizedItems.map((item) => item.path))
	const sample = normalizedItems.slice(0, maxUploadCommitItems).map((item) => ({ path: item.path, size: item.size }))
	const itemsTruncated = normalizedItems.length > maxUploadCommitItems

	const label = task.label?.trim()
	return {
		label: label || undefined,
		rootName: root.rootName,
		rootKind: root.rootKind,
		totalFiles,
		totalBytes,
		items: sample,
		itemsTruncated: itemsTruncated || undefined,
	}
}

function summarizeUploadTasks(tasks: UploadTask[]): string {
	if (tasks.length === 0) return ''
	const counts = {
		queued: 0,
		staging: 0,
		commit: 0,
		waitingJob: 0,
		cleanup: 0,
		succeeded: 0,
		failed: 0,
		canceled: 0,
	}
	for (const t of tasks) {
		switch (t.status) {
			case 'queued':
				counts.queued++
				break
			case 'staging':
				counts.staging++
				break
			case 'commit':
				counts.commit++
				break
			case 'waiting_job':
				counts.waitingJob++
				break
			case 'cleanup':
				counts.cleanup++
				break
			case 'succeeded':
				counts.succeeded++
				break
			case 'failed':
				counts.failed++
				break
			case 'canceled':
				counts.canceled++
				break
		}
	}
	const parts: string[] = [`Total ${tasks.length}`]
	if (counts.queued) parts.push(`Queued ${counts.queued}`)
	if (counts.staging) parts.push(`Uploading ${counts.staging}`)
	if (counts.commit) parts.push(`Committing ${counts.commit}`)
	if (counts.waitingJob) parts.push(`Transferring ${counts.waitingJob}`)
	if (counts.cleanup) parts.push(`Cleaning ${counts.cleanup}`)
	if (counts.succeeded) parts.push(`Done ${counts.succeeded}`)
	if (counts.failed) parts.push(`Failed ${counts.failed}`)
	if (counts.canceled) parts.push(`Canceled ${counts.canceled}`)
	return parts.join(' · ')
}

function formatMoveCleanupSummary(result: RemoveEntriesResult, label: string): string {
	const parts = [`Moved ${result.removed.length} item(s)`]
	if (label) parts[0] += ` from ${label}`
	if (result.failed.length) parts.push(`failed ${result.failed.length}`)
	if (result.skipped.length) parts.push(`skipped ${result.skipped.length}`)
	if (result.removedDirs.length) parts.push(`cleaned ${result.removedDirs.length} folder(s)`)
	return parts.join(' · ')
}

	function buildWSURL(apiToken: string): string {
		const url = buildApiWsUrl('/ws')
		if (apiToken) url.searchParams.set('apiToken', apiToken)
		url.searchParams.set('includeLogs', 'false')
		return url.toString()
	}

	function buildSSEURL(apiToken: string): string {
		const url = buildApiHttpUrl('/events')
		if (apiToken) url.searchParams.set('apiToken', apiToken)
		url.searchParams.set('includeLogs', 'false')
		return url.toString()
	}

function buildMoveCleanupReportText(result: RemoveEntriesResult, label: string, bucket?: string, prefix?: string): string {
	const lines: string[] = []
	lines.push('Move cleanup report')
	lines.push(`Generated: ${new Date().toISOString()}`)
	if (label) lines.push(`Source: ${label}`)
	if (bucket) {
	const normalizedPrefix = prefix?.trim() ? normalizePrefixLabel(prefix) : '(root)'
		lines.push(`Destination: s3://${bucket}/${normalizedPrefix}`)
	}
	lines.push('')
	lines.push(`Summary: ${formatMoveCleanupSummary(result, label)}`)
	lines.push('')

	const pushSection = (title: string, items: string[]) => {
		lines.push(`${title} (${items.length})`)
		if (items.length === 0) {
			lines.push('-')
		} else {
			for (const item of items) lines.push(item)
		}
		lines.push('')
	}

	pushSection('Removed files', result.removed)
	pushSection('Failed to remove', result.failed)
	pushSection('Skipped', result.skipped)
	pushSection('Removed empty folders', result.removedDirs)

	return lines.join('\n')
}

function downloadTextFile(filename: string, content: string): void {
	const blob = new Blob([content], { type: 'text/plain' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.style.display = 'none'
	document.body.appendChild(a)
	a.click()
	a.remove()
	window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function buildMoveCleanupFilename(args: {
	label?: string
	bucket?: string
	prefix?: string
	template: string
	maxLen: number
}): string {
	const stamp = new Date().toISOString().replace(/[:]/g, '-')
	const template = (args.template || MOVE_CLEANUP_FILENAME_TEMPLATE).trim()
	const maxLen = normalizeMaxFilenameLength(args.maxLen)

	const prefixToken = args.prefix ? normalizePrefixToken(args.prefix) : ''
	const parts: Record<string, string> = {
		bucket: sanitizeForFilename(args.bucket ?? ''),
		prefix: sanitizeForFilename(prefixToken),
		label: sanitizeForFilename(args.label ?? ''),
		timestamp: sanitizeForFilename(stamp),
	}

	let name = applyFilenameTemplate(template, parts)
	if (!name.toLowerCase().endsWith('.txt')) {
		name = `${name}.txt`
	}

	if (!name.trim()) {
		name = `move-cleanup-${stamp}.txt`
	}

	return enforceFilenameLength(name, maxLen)
}

function sanitizeForFilename(value: string): string {
	return value
		.trim()
		.replace(/[\\/:*?"<>|]/g, '-')
		.replace(/\s+/g, '_')
		.replace(/-+/g, '-')
		.replace(/_+/g, '_')
		.replace(/[-_]+$/g, '')
}

function normalizePrefixLabel(prefix: string): string {
	const trimmed = prefix.trim().replace(/^\/+/, '').replace(/\/+$/, '')
	return trimmed || '(root)'
}

function normalizePrefixToken(prefix: string): string {
	const normalized = normalizePrefixLabel(prefix)
	return normalized === '(root)' ? 'root' : normalized
}

function normalizeMaxFilenameLength(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return MOVE_CLEANUP_FILENAME_MAX_LEN
	return Math.max(40, Math.min(200, Math.floor(value)))
}

function applyFilenameTemplate(template: string, parts: Record<string, string>): string {
	let out = template
	for (const [key, value] of Object.entries(parts)) {
		out = out.replaceAll(`{${key}}`, value)
	}
	out = out.replace(/\{[^}]+\}/g, '')
	out = out.replace(/\s+/g, '_')
	out = out.replace(/-+/g, '-')
	out = out.replace(/_+/g, '_')
	out = out.replace(/[-_]+$/g, '')
	out = out.replace(/^[-_]+/g, '')
	return out
}

function enforceFilenameLength(filename: string, maxLen: number): string {
	if (filename.length <= maxLen) return filename
	const extMatch = filename.match(/(\.[^.]+)$/)
	const ext = extMatch ? extMatch[1] : ''
	const base = ext ? filename.slice(0, -ext.length) : filename
	const allowed = Math.max(1, maxLen - ext.length)
	const trimmed = base.slice(0, allowed).replace(/[-_]+$/g, '')
	return `${trimmed}${ext}`
}

function showMoveCleanupReport(args: {
	title: string
	result: RemoveEntriesResult
	label?: string
	kind?: 'info' | 'warning'
	bucket?: string
	prefix?: string
	filenameTemplate: string
	filenameMaxLen: number
}) {
	const { title, result, label, kind, bucket, prefix, filenameTemplate, filenameMaxLen } = args
	const modal = kind === 'info' ? Modal.info : Modal.warning
	const sections: ReactNode[] = []
	const maxItems = 10
	const reportText = buildMoveCleanupReportText(result, label ?? '', bucket, prefix)
	const reportFilename = buildMoveCleanupFilename({
		label,
		bucket,
		prefix,
		template: filenameTemplate,
		maxLen: filenameMaxLen,
	})

	const pushSection = (sectionTitle: string, items: string[]) => {
		if (items.length === 0) return
		const sample = items.slice(0, maxItems)
		sections.push(
			<Space key={sectionTitle} orientation="vertical" size={4}>
				<Typography.Text strong>
					{sectionTitle} ({items.length})
				</Typography.Text>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
					{sample.map((item) => (
						<Typography.Text key={`${sectionTitle}_${item}`} code>
							{item}
						</Typography.Text>
					))}
					{items.length > maxItems ? (
						<Typography.Text type="secondary">+{items.length - maxItems} more</Typography.Text>
					) : null}
				</div>
			</Space>,
		)
	}

	pushSection('Removed files', result.removed)
	pushSection('Failed to remove', result.failed)
	pushSection('Skipped', result.skipped)
	pushSection('Removed empty folders', result.removedDirs)

	modal({
		title,
		content: (
			<Space orientation="vertical" size="middle">
				<Typography.Text type="secondary">{formatMoveCleanupSummary(result, label ?? '')}</Typography.Text>
				<Button size="small" onClick={() => downloadTextFile(reportFilename, reportText)}>
					Download report
				</Button>
				{sections}
			</Space>
		),
		width: 720,
	})
}

// formatErr lives in ../lib/errors
