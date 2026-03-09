import type { QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { MutableRefObject } from 'react'

import type { JobProgress, JobStatus } from '../../api/types'
import { publishObjectsRefresh } from '../../pages/objects/objectsRefreshEvents'
import type { UploadTask } from './transferTypes'

type UseTransfersUploadJobLifecycleArgs = {
	queryClient: QueryClient
	uploadTasksRef: MutableRefObject<UploadTask[]>
	updateUploadTask: (taskId: string, updater: (task: UploadTask) => UploadTask) => void
}

export function useTransfersUploadJobLifecycle({
	queryClient,
	uploadTasksRef,
	updateUploadTask,
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
				void queryClient.invalidateQueries({ queryKey: ['objects', current.profileId, current.bucket] })
				publishObjectsRefresh({
					profileId: current.profileId,
					bucket: current.bucket,
					prefix: current.prefix,
					source: 'upload',
				})
				updateUploadTask(taskId, (prev) => ({
					...prev,
					status: 'succeeded',
					finishedAtMs: Date.now(),
					error: undefined,
					speedBps: 0,
					etaSeconds: 0,
					loadedBytes: prev.totalBytes,
				}))
				return
			}

			if (status === 'failed') {
				updateUploadTask(taskId, (prev) => ({
					...prev,
					status: 'failed',
					finishedAtMs: Date.now(),
					error: error ?? 'upload job failed',
					speedBps: 0,
					etaSeconds: 0,
				}))
				return
			}

			updateUploadTask(taskId, (prev) => ({
				...prev,
				status: 'canceled',
				finishedAtMs: Date.now(),
				error: error ?? prev.error,
				speedBps: 0,
				etaSeconds: 0,
			}))
		},
		[queryClient, updateUploadTask, uploadTasksRef],
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
