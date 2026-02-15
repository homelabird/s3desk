import { message } from 'antd'
import { useCallback } from 'react'
import type { MutableRefObject } from 'react'

import type { JobProgress, JobStatus } from '../../api/types'
import { type RemoveEntriesResult, removeEntriesFromDirectoryHandle } from '../../lib/deviceFs'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { maybeReportNetworkError } from './transferDownloadUtils'
import type { UploadTask } from './transferTypes'

type UploadMovePlan = {
	rootHandle: FileSystemDirectoryHandle
	relPaths: string[]
	label?: string
	cleanupEmptyDirs?: boolean
}

type MoveCleanupReportArgs = {
	title: string
	label?: string
	bucket?: string
	prefix?: string
	filenameTemplate: string
	filenameMaxLen: number
	result: RemoveEntriesResult
	kind?: 'warning' | 'info'
}

type UseTransfersUploadJobLifecycleArgs = {
	uploadTasksRef: MutableRefObject<UploadTask[]>
	uploadMoveByTaskIdRef: MutableRefObject<Record<string, UploadMovePlan>>
	moveCleanupFilenameTemplate: string
	moveCleanupFilenameMaxLen: number
	updateUploadTask: (taskId: string, updater: (task: UploadTask) => UploadTask) => void
	formatMoveCleanupSummary: (result: RemoveEntriesResult, label: string) => string
	showMoveCleanupReport: (args: MoveCleanupReportArgs) => void
}

export function useTransfersUploadJobLifecycle({
	uploadTasksRef,
	uploadMoveByTaskIdRef,
	moveCleanupFilenameTemplate,
	moveCleanupFilenameMaxLen,
	updateUploadTask,
	formatMoveCleanupSummary,
	showMoveCleanupReport,
}: UseTransfersUploadJobLifecycleArgs) {
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
		async (taskId: string, status: 'succeeded' | 'failed' | 'canceled', error?: string | null) => {
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
		},
		[
			formatMoveCleanupSummary,
			moveCleanupFilenameMaxLen,
			moveCleanupFilenameTemplate,
			showMoveCleanupReport,
			updateUploadTask,
			uploadMoveByTaskIdRef,
			uploadTasksRef,
		],
	)

	const handleUploadJobUpdate = useCallback(
		async (
			taskId: string,
			job: { status?: JobStatus; progress?: JobProgress | null; error?: string | null },
		) => {
			const current = uploadTasksRef.current.find((t) => t.id === taskId)
			if (!current || current.status !== 'waiting_job') return
			if (job.progress) {
				updateUploadTaskProgressFromJob(taskId, job.progress)
			}
			if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'canceled') {
				await finalizeUploadJob(taskId, job.status, job.error ?? null)
			}
		},
		[finalizeUploadJob, updateUploadTaskProgressFromJob, uploadTasksRef],
	)

	return {
		updateUploadTaskProgressFromJob,
		finalizeUploadJob,
		handleUploadJobUpdate,
	}
}
