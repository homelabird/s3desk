import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Modal, Space, Typography, message } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { APIClient, APIError, RequestAbortedError, type UploadFileItem } from '../api/client'
import { TransfersContext, useTransfers } from './useTransfers'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { TransferEstimator } from '../lib/transfer'
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
import { TransfersDrawer } from './transfers/TransfersDrawer'
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
			const movePlan = uploadMoveByTaskIdRef.current[taskId]
			updateUploadTask(taskId, (t) => {
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
					const msg = formatErr(err)
					updateDownloadTask(taskId, (t) => ({ ...t, status: 'failed', finishedAtMs: Date.now(), error: msg }))
					message.error(msg)
				} finally {
					delete downloadAbortByTaskIdRef.current[taskId]
					delete downloadEstimatorByTaskIdRef.current[taskId]
				}
				return
			}

			const handle =
				current.kind === 'object'
					? api.downloadObject(
							{ profileId: current.profileId, bucket: current.bucket, key: current.key },
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
					: api.downloadJobArtifact(
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
				const fallbackName =
					current.kind === 'object'
						? defaultFilenameFromKey(current.key)
						: current.filenameHint?.trim() || `job-${current.jobId}.zip`
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
				const msg = formatErr(err)
				updateDownloadTask(taskId, (t) => ({ ...t, status: 'failed', finishedAtMs: Date.now(), error: msg }))
				message.error(msg)
			} finally {
				delete downloadAbortByTaskIdRef.current[taskId]
				delete downloadEstimatorByTaskIdRef.current[taskId]
			}
		},
		[api, updateDownloadTask],
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
				})
				uploadAbortByTaskIdRef.current[taskId] = handle.abort
				await handle.promise
				delete uploadAbortByTaskIdRef.current[taskId]

				updateUploadTask(taskId, (t) => ({
					...t,
					status: 'commit',
					loadedBytes: t.totalBytes,
					speedBps: 0,
					etaSeconds: 0,
				}))

				const resp = await withJobQueueRetry(() => api.commitUpload(current.profileId, uploadId))
				committed = true
				delete uploadItemsByTaskIdRef.current[taskId]
				const movePlan = uploadMoveByTaskIdRef.current[taskId]
				const shouldMove = current.moveAfterUpload && !!movePlan
				updateUploadTask(taskId, (t) => ({
					...t,
					status: shouldMove ? 'waiting_job' : 'succeeded',
					finishedAtMs: shouldMove ? undefined : Date.now(),
					jobId: resp.jobId,
					cleanupFailed: false,
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
		[api, navigate, queryClient, updateUploadTask],
	)

	useEffect(() => {
		const running = uploadTasks.filter((t) => t.status === 'staging' || t.status === 'commit').length
		const capacity = uploadConcurrency - running
		if (capacity <= 0) return
		const toStart = uploadTasks.filter((t) => t.status === 'queued').slice(0, capacity)
		for (const t of toStart) void startUploadTask(t.id)
	}, [startUploadTask, uploadConcurrency, uploadTasks])

	const hasPendingMoveUploads = uploadTasks.some((t) => t.status === 'waiting_job')
	useEffect(() => {
		if (!hasPendingMoveUploads) return

		let stopped = false
		const tick = async () => {
			const waiting = uploadTasksRef.current.filter(
				(t) => t.status === 'waiting_job' && t.moveAfterUpload && !!t.jobId,
			)
			for (const task of waiting) {
				if (stopped) return
				try {
					const job = await api.getJob(task.profileId, task.jobId as string)
					if (stopped) return
					if (job.status === 'succeeded') {
						const movePlan = uploadMoveByTaskIdRef.current[task.id]
						updateUploadTask(task.id, (prev) => ({
							...prev,
							status: 'cleanup',
							error: undefined,
							cleanupFailed: false,
						}))
						if (!movePlan) {
							updateUploadTask(task.id, (prev) => ({
								...prev,
								status: 'succeeded',
								finishedAtMs: Date.now(),
							}))
							continue
						}
						try {
							const result = await removeEntriesFromDirectoryHandle({
								root: movePlan.rootHandle,
								relPaths: movePlan.relPaths,
								cleanupEmptyDirs: movePlan.cleanupEmptyDirs,
							})
							const summary = formatMoveCleanupSummary(result, movePlan.label ?? '')
							if (result.failed.length > 0) {
								updateUploadTask(task.id, (prev) => ({
									...prev,
									status: 'failed',
									finishedAtMs: Date.now(),
									error: summary,
									cleanupFailed: true,
								}))
								showMoveCleanupReport({
									title: 'Move completed with errors',
									label: movePlan.label,
									bucket: task.bucket,
									prefix: task.prefix,
									filenameTemplate: moveCleanupFilenameTemplate,
									filenameMaxLen: moveCleanupFilenameMaxLen,
									result,
								})
							} else {
								updateUploadTask(task.id, (prev) => ({
									...prev,
									status: 'succeeded',
									finishedAtMs: Date.now(),
								}))
								const label = movePlan.label ? ` from ${movePlan.label}` : ''
								message.success(`Moved ${result.removed.length} item(s)${label}`)
								if (result.skipped.length > 0 || result.removedDirs.length > 0) {
									showMoveCleanupReport({
										title: 'Move completed with notes',
										label: movePlan.label,
										bucket: task.bucket,
										prefix: task.prefix,
										filenameTemplate: moveCleanupFilenameTemplate,
										filenameMaxLen: moveCleanupFilenameMaxLen,
										result,
										kind: 'info',
									})
								}
								delete uploadMoveByTaskIdRef.current[task.id]
							}
						} catch (err) {
							const msg = formatErr(err)
							updateUploadTask(task.id, (prev) => ({
								...prev,
								status: 'failed',
								finishedAtMs: Date.now(),
								error: msg,
								cleanupFailed: true,
							}))
							message.error(msg)
						}
						continue
					}
					if (job.status === 'failed') {
						updateUploadTask(task.id, (prev) => ({
							...prev,
							status: 'failed',
							finishedAtMs: Date.now(),
							error: job.error ?? 'upload job failed',
						}))
						delete uploadMoveByTaskIdRef.current[task.id]
						continue
					}
					if (job.status === 'canceled') {
						updateUploadTask(task.id, (prev) => ({
							...prev,
							status: 'canceled',
							finishedAtMs: Date.now(),
							error: job.error ?? prev.error,
						}))
						delete uploadMoveByTaskIdRef.current[task.id]
					}
				} catch (err) {
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
	}, [api, hasPendingMoveUploads, updateUploadTask])

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
	if (counts.waitingJob) parts.push(`Waiting ${counts.waitingJob}`)
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

function formatErr(err: unknown): string {
	if (err instanceof APIError) return `${err.code}: ${err.message}`
	if (err instanceof Error) return err.message
	return 'unknown error'
}
