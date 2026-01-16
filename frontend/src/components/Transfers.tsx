import { type ReactNode, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Modal, Space, Typography, message } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { APIClient, APIError, RequestAbortedError, RequestTimeoutError, type UploadCommitRequest, type UploadFileItem } from '../api/client'
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

type UploadMovePlan = {
	rootHandle: FileSystemDirectoryHandle
	relPaths: string[]
	label?: string
	cleanupEmptyDirs?: boolean
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

export function TransfersProvider(props: { apiToken: string; children: ReactNode }) {
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
	const uploadBatchConcurrency = 4
	const uploadBatchBytes = 64 * 1024 * 1024

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
		(taskId: string) => {
			updateUploadTask(taskId, (t) => {
				const movePlan = uploadMoveByTaskIdRef.current[taskId]
				if (t.cleanupFailed && t.moveAfterUpload && t.jobId && movePlan) {
					return {
						...t,
						status: 'waiting_job',
						finishedAtMs: undefined,
						error: undefined,
						cleanupFailed: false,
					}
				}
				return {
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
				}
			})
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
					const res = await api.downloadObjectStream({
						profileId: current.profileId,
						bucket: current.bucket,
						key: current.key,
						signal: controller.signal,
					})
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
					const presigned = await api.getObjectDownloadURL({
						profileId: current.profileId,
						bucket: current.bucket,
						key: current.key,
						proxy: downloadLinkProxyEnabled,
					})
					const latest = downloadTasksRef.current.find((t) => t.id === taskId)
					if (!latest || latest.status !== 'running') {
						return
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

					const resp = await handle.promise
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
			try {
				const session = await api.createUpload(current.profileId, { bucket: current.bucket, prefix: current.prefix })
				uploadId = session.uploadId
				if (session.maxBytes && current.totalBytes > session.maxBytes) {
					throw new Error(`selected files exceed maxBytes (${current.totalBytes} > ${session.maxBytes})`)
				}

				const handle = api.uploadFilesWithProgress(current.profileId, uploadId, items, {
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
					concurrency: uploadBatchConcurrency,
					maxBatchBytes: uploadBatchBytes,
					maxBatchItems: 50,
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
		[api, navigate, queryClient, updateUploadTask, uploadBatchBytes, uploadBatchConcurrency],
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

			const items: UploadFileItem[] = files.map((file) => {
				const fileWithPath = file as File & { webkitRelativePath?: string; relativePath?: string }
				const relPath = (fileWithPath.webkitRelativePath ?? fileWithPath.relativePath ?? '').trim()
				return { file, relPath: relPath || file.name }
			})
			const totalBytes = items.reduce((sum, i) => sum + (i.file.size ?? 0), 0)

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
	const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
	const base = `${proto}//${window.location.host}/api/v1/ws`
	const qs = new URLSearchParams()
	if (apiToken) qs.set('apiToken', apiToken)
	qs.set('includeLogs', 'false')
	const q = qs.toString()
	return q ? `${base}?${q}` : base
}

function buildSSEURL(apiToken: string): string {
	const base = `${window.location.protocol}//${window.location.host}/api/v1/events`
	const qs = new URLSearchParams()
	if (apiToken) qs.set('apiToken', apiToken)
	qs.set('includeLogs', 'false')
	const q = qs.toString()
	return q ? `${base}?${q}` : base
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
			<Space key={sectionTitle} direction="vertical" size={4}>
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
			<Space direction="vertical" size="middle">
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

function randomId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
	return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function defaultFilenameFromKey(key: string): string {
	const base = key.split('/').filter(Boolean).pop()
	return base || 'download'
}

function filenameFromContentDisposition(header: string | null): string | null {
	if (!header) return null

	const star = /filename\*=([^']*)''([^;]+)/i.exec(header)
	if (star) {
		const encoded = star[2]
		try {
			return decodeURIComponent(encoded)
		} catch {
			return encoded
		}
	}

	const plain = /filename="?([^";]+)"?/i.exec(header)
	if (plain) return plain[1]
	return null
}

function normalizePrefixForDevice(prefix?: string): string {
	if (!prefix) return ''
	const trimmed = prefix.trim().replace(/\\/g, '/')
	if (!trimmed) return ''
	return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function normalizeDevicePath(value: string): string {
	const cleaned = value.replace(/\\/g, '/').replace(/^\/+/, '')
	const parts = cleaned.split('/').filter(Boolean).filter((part) => part !== '.' && part !== '..')
	return parts.join('/')
}

type DownloadHandle = {
	promise: Promise<{ blob: Blob; contentDisposition: string | null; contentType: string | null }>
	abort: () => void
}

function downloadURLWithProgress(
	url: string,
	opts: { onProgress?: (progress: { loadedBytes: number; totalBytes?: number }) => void } = {},
): DownloadHandle {
	const xhr = new XMLHttpRequest()
	xhr.open('GET', url)
	xhr.responseType = 'blob'

	xhr.onprogress = (e) => {
		if (!opts.onProgress) return
		opts.onProgress({
			loadedBytes: e.loaded,
			totalBytes: e.lengthComputable ? e.total : undefined,
		})
	}

	const promise = new Promise<{ blob: Blob; contentDisposition: string | null; contentType: string | null }>(
		(resolve, reject) => {
			xhr.onload = async () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					clearNetworkStatus()
					resolve({
						blob: xhr.response,
						contentDisposition: xhr.getResponseHeader('content-disposition'),
						contentType: xhr.getResponseHeader('content-type'),
					})
					return
				}

				const bodyText = await blobToTextSafe(xhr.response)
				const fallback =
					xhr.status === 0
						? 'Download failed (network/CORS). Enable server proxy in Settings if needed.'
						: `Download failed (HTTP ${xhr.status})`
				reject(new Error(bodyText ? `${fallback}: ${bodyText}` : fallback))
			}
			xhr.onerror = () => {
				reject(new Error('Network error (possible CORS). Enable server proxy in Settings if needed.'))
			}
			xhr.onabort = () => reject(new RequestAbortedError())
		},
	)

	xhr.send()
	return { promise, abort: () => xhr.abort() }
}

async function blobToTextSafe(blob: Blob | null): Promise<string | null> {
	if (!blob) return null
	try {
		return await blob.text()
	} catch {
		return null
	}
}

function saveBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.rel = 'noopener'
	a.style.display = 'none'
	document.body.appendChild(a)
	a.click()
	a.remove()
	setTimeout(() => URL.revokeObjectURL(url), 0)
}

function maybeReportNetworkError(err: unknown) {
	if (err instanceof RequestAbortedError) return
	if (err instanceof RequestTimeoutError) {
		publishNetworkStatus({ kind: 'unstable', message: 'Request timed out. Check your connection.' })
		return
	}
	if (err instanceof APIError) {
		if (err.status >= 500 || err.status === 0) {
			publishNetworkStatus({ kind: 'unstable', message: `Server error (HTTP ${err.status}).` })
		}
		return
	}
	if (err instanceof TypeError) {
		publishNetworkStatus({ kind: 'unstable', message: 'Network error. Check your connection.' })
		return
	}
	if (err instanceof Error && /network|failed to fetch|load failed/i.test(err.message)) {
		publishNetworkStatus({ kind: 'unstable', message: 'Network error. Check your connection.' })
	}
}

// formatErr lives in ../lib/errors
