import type { QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import type { APIClientShape, UploadFileItem } from '../../api/client'
import type { TransferEstimator } from '../../lib/transfer'
import type { UploadTask } from './transferTypes'
import { randomId } from './transferDownloadUtils'
import type {
	QueueUploadFilesArgs,
	TransfersRuntimeNotifications,
	UploadCapabilityByProfileId,
} from './transfersTypes'
import { useTransfersUploadJobEvents } from './useTransfersUploadJobEvents'
import { buildQueuedUpload } from './transfersQueuedUpload'
import type { UploadTuning } from './useTransfersUploadPreferences'
import type { JobProgress, JobStatus } from '../../api/types'
import { resolveRetryUploadItems } from './uploadRuntimeRetry'
import { queueLocalUploadPreview } from './uploadRuntimePreview'
import { runUploadTask } from './uploadRuntimeTask'

type UseTransfersUploadRuntimeArgs = {
	api: APIClientShape
	apiToken: string
	queryClient: QueryClient
	notifications: TransfersRuntimeNotifications
	uploadCapabilityByProfileId?: UploadCapabilityByProfileId
	uploadDirectStream?: boolean
	uploadChunkFileConcurrency: number
	uploadTaskConcurrency: number
	uploadResumeConversionEnabled: boolean
	pickUploadTuning: (totalBytes: number, maxFileBytes: number | null) => UploadTuning
	uploadTasks: UploadTask[]
	setUploadTasks: Dispatch<SetStateAction<UploadTask[]>>
	updateUploadTask: (taskId: string, updater: (task: UploadTask) => UploadTask) => void
	handleUploadJobUpdate: (taskId: string, job: { status?: JobStatus; progress?: JobProgress | null; error?: string | null }) => Promise<void>
	uploadTasksRef: MutableRefObject<UploadTask[]>
	uploadAbortByTaskIdRef: MutableRefObject<Record<string, () => void>>
	uploadEstimatorByTaskIdRef: MutableRefObject<Record<string, TransferEstimator>>
	uploadItemsByTaskIdRef: MutableRefObject<Record<string, UploadFileItem[]>>
	uploadPreviewUrlByTaskIdRef: MutableRefObject<Record<string, string>>
	openTransfers: (tab?: 'downloads' | 'uploads') => void
}

function getUploadItems(
	ref: MutableRefObject<Record<string, UploadFileItem[]>>,
	taskId: string,
): UploadFileItem[] | undefined {
	return ref.current[taskId]
}

function setUploadItems(ref: MutableRefObject<Record<string, UploadFileItem[]>>, taskId: string, items: UploadFileItem[]) {
	ref.current[taskId] = items
}

export function useTransfersUploadRuntime(args: UseTransfersUploadRuntimeArgs) {
	const retryUploadTask = useCallback(
		async (taskId: string) => {
			const current = args.uploadTasksRef.current.find((t) => t.id === taskId)
			if (!current) return

			let items = getUploadItems(args.uploadItemsByTaskIdRef, taskId)
			if (!items || items.length === 0) {
				const retrySelection = await resolveRetryUploadItems({ task: current })
				if (!retrySelection.ok) {
					if ('error' in retrySelection) args.notifications.error(retrySelection.error)
					return
				}
				const selectedItems = retrySelection.selection.items
				items = selectedItems
				setUploadItems(args.uploadItemsByTaskIdRef, taskId, selectedItems)
				args.updateUploadTask(taskId, (t) => ({
					...t,
					fileCount: selectedItems.length,
					totalBytes: retrySelection.selection.totalBytes,
					filePaths: retrySelection.selection.filePaths,
					resumeFileSize: retrySelection.selection.resumeFileSize,
				}))
			}

			args.updateUploadTask(taskId, (t) => ({
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
		[args],
	)

	const startUploadTask = useCallback(
		async (taskId: string) => {
			const current = args.uploadTasksRef.current.find((t) => t.id === taskId)
			if (!current || current.status !== 'queued') return

			const items = getUploadItems(args.uploadItemsByTaskIdRef, taskId)
			if (!items || items.length === 0) {
				args.updateUploadTask(taskId, (t) => ({ ...t, status: 'failed', finishedAtMs: Date.now(), error: 'missing files (remove and re-add)' }))
				return
			}

			await runUploadTask({
				api: args.api,
				apiToken: args.apiToken,
				queryClient: args.queryClient,
				notifications: args.notifications,
				taskId,
				task: current,
				items,
				uploadCapabilityByProfileId: args.uploadCapabilityByProfileId,
				uploadDirectStream: args.uploadDirectStream,
				uploadChunkFileConcurrency: args.uploadChunkFileConcurrency,
				uploadResumeConversionEnabled: args.uploadResumeConversionEnabled,
				pickUploadTuning: args.pickUploadTuning,
				uploadAbortByTaskIdRef: args.uploadAbortByTaskIdRef,
				uploadEstimatorByTaskIdRef: args.uploadEstimatorByTaskIdRef,
				uploadItemsByTaskIdRef: args.uploadItemsByTaskIdRef,
				updateUploadTask: args.updateUploadTask,
				handleUploadJobUpdate: args.handleUploadJobUpdate,
			})
		},
		[args],
	)

	useEffect(() => {
		const running = args.uploadTasks.filter((t) => t.status === 'staging' || t.status === 'commit').length
		const capacity = args.uploadTaskConcurrency - running
		if (capacity <= 0) return
		const toStart = args.uploadTasks.filter((t) => t.status === 'queued').slice(0, capacity)
		for (const task of toStart) void startUploadTask(task.id)
	}, [args.uploadTaskConcurrency, args.uploadTasks, startUploadTask])

	const hasPendingUploadJobs = args.uploadTasks.some((t) => t.status === 'waiting_job')
	useTransfersUploadJobEvents({
		api: args.api,
		apiToken: args.apiToken,
		hasPendingUploadJobs,
		uploadTasksRef: args.uploadTasksRef,
		handleUploadJobUpdate: args.handleUploadJobUpdate,
		updateUploadTask: args.updateUploadTask,
	})

	const queueUploadFiles = useCallback(
		(queueArgs: QueueUploadFilesArgs) => {
			const taskId = randomId()
			const queuedUpload = buildQueuedUpload({ taskId, queueArgs })
			if (!queuedUpload) return

			const { items, task } = queuedUpload
			setUploadItems(args.uploadItemsByTaskIdRef, taskId, items)

			args.setUploadTasks((prev) => [task, ...prev])
			args.openTransfers('uploads')

			void queueLocalUploadPreview({
				items,
				taskId,
				uploadTasksRef: args.uploadTasksRef,
				uploadPreviewUrlByTaskIdRef: args.uploadPreviewUrlByTaskIdRef,
				updateUploadTask: args.updateUploadTask,
			})
		},
		[args],
	)

	return {
		retryUploadTask,
		queueUploadFiles,
	}
}
