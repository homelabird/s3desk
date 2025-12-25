import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Space, Typography, message } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { APIClient, APIError, RequestAbortedError, type UploadFileItem } from '../api/client'
import { TransfersContext, useTransfers } from './useTransfers'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { TransferEstimator } from '../lib/transfer'
import { withJobQueueRetry } from '../lib/jobQueue'
import { TransfersDrawer } from './transfers/TransfersDrawer'
import type {
	DownloadTask,
	JobArtifactDownloadTask,
	ObjectDownloadTask,
	TransfersTab,
	UploadTask,
} from './transfers/transferTypes'

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
	queueDownloadJobArtifact: (args: {
		profileId: string
		jobId: string
		label?: string
		filenameHint?: string
		waitForJob?: boolean
	}) => void
	queueUploadFiles: (args: { profileId: string; bucket: string; prefix: string; files: File[]; label?: string }) => void
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

	useEffect(() => {
		downloadTasksRef.current = downloadTasks
	}, [downloadTasks])
	useEffect(() => {
		uploadTasksRef.current = uploadTasks
	}, [uploadTasks])

	const activeDownloadCount = downloadTasks.filter((t) => t.status === 'queued' || t.status === 'waiting' || t.status === 'running').length
	const hasCompletedDownloads = downloadTasks.some((t) => t.status === 'succeeded')
	const activeUploadCount = uploadTasks.filter((t) => t.status === 'queued' || t.status === 'staging' || t.status === 'commit').length
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
		setUploadTasks((prev) => prev.filter((t) => t.id !== taskId))
	}, [])

	const clearCompletedUploads = useCallback(() => {
		setUploadTasks((prev) => {
			for (const t of prev) {
				if (t.status !== 'succeeded') continue
				delete uploadAbortByTaskIdRef.current[t.id]
				delete uploadEstimatorByTaskIdRef.current[t.id]
				delete uploadItemsByTaskIdRef.current[t.id]
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
				updateUploadTask(taskId, (t) => ({
					...t,
					status: 'succeeded',
					finishedAtMs: Date.now(),
					jobId: resp.jobId,
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
			(args: { profileId: string; bucket: string; prefix: string; files: File[]; label?: string }) => {
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
			const task: UploadTask = {
				id: taskId,
				profileId: args.profileId,
				bucket: args.bucket,
				prefix: args.prefix,
				fileCount: items.length,
				status: 'queued',
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
	if (counts.succeeded) parts.push(`Done ${counts.succeeded}`)
	if (counts.failed) parts.push(`Failed ${counts.failed}`)
	if (counts.canceled) parts.push(`Canceled ${counts.canceled}`)
	return parts.join(' · ')
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
