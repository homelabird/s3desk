import { message } from 'antd'
import { useCallback, useEffect, useRef } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import type { APIClient } from '../../api/client'
import { RequestAbortedError } from '../../api/client'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { TransferEstimator } from '../../lib/transfer'
import { getDevicePickerSupport } from '../../lib/deviceFs'
import type { DownloadTask, JobArtifactDownloadTask, ObjectDownloadTask, TransfersTab } from './transferTypes'
import {
	defaultFilenameFromKey,
	downloadURLWithProgress,
	filenameFromContentDisposition,
	maybeReportNetworkError,
	randomId,
	saveBlob,
	shouldFallbackToProxy,
} from './transferDownloadUtils'
import { downloadObjectToDevice } from './downloadObjectToDevice'
import { planObjectDeviceDownloadTasks } from './deviceDownloadPlan'

type UseTransfersDownloadQueueParams = {
	api: APIClient
	downloadLinkProxyEnabled: boolean
	downloadConcurrency: number
	downloadTasks: DownloadTask[]
	setDownloadTasks: Dispatch<SetStateAction<DownloadTask[]>>
	downloadAbortByTaskIdRef: MutableRefObject<Record<string, () => void>>
	downloadEstimatorByTaskIdRef: MutableRefObject<Record<string, TransferEstimator>>
	updateDownloadTask: (taskId: string, updater: (task: DownloadTask) => DownloadTask) => void
	openTransfers: (tab?: TransfersTab) => void
}

export function useTransfersDownloadQueue({
	api,
	downloadLinkProxyEnabled,
	downloadConcurrency,
	downloadTasks,
	setDownloadTasks,
	downloadAbortByTaskIdRef,
	downloadEstimatorByTaskIdRef,
	updateDownloadTask,
	openTransfers,
}: UseTransfersDownloadQueueParams) {
	const downloadTasksRef = useRef<DownloadTask[]>([])
	useEffect(() => {
		downloadTasksRef.current = downloadTasks
	}, [downloadTasks])

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
					await downloadObjectToDevice({
						api,
						task: current,
						downloadLinkProxyEnabled,
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
		[api, downloadEstimatorByTaskIdRef, downloadAbortByTaskIdRef, downloadLinkProxyEnabled, updateDownloadTask],
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
		[openTransfers, setDownloadTasks],
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

			const tasks = planObjectDeviceDownloadTasks({
				profileId: args.profileId,
				bucket: args.bucket,
				items: args.items,
				targetDirHandle: args.targetDirHandle,
				targetLabel: args.targetLabel,
				prefix: args.prefix,
			})
			if (tasks.length === 0) {
				message.info('No objects to download')
				return
			}

			setDownloadTasks((prev) => [...tasks, ...prev])
			openTransfers('downloads')
		},
		[openTransfers, setDownloadTasks],
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
		[openTransfers, setDownloadTasks],
	)

	return {
		queueDownloadObject,
		queueDownloadObjectsToDevice,
		queueDownloadJobArtifact,
	}
}

