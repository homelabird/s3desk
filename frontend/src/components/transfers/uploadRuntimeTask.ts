import type { QueryClient } from '@tanstack/react-query'
import type { MutableRefObject } from 'react'

import { RequestAbortedError, type APIClientShape, type UploadFileItem } from '../../api/client'
import type { JobProgress, JobStatus } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { TransferEstimator } from '../../lib/transfer'
import type { UploadTask } from './transferTypes'
import { maybeReportNetworkError } from './transferDownloadUtils'
import type { TransfersRuntimeNotifications, UploadCapabilityByProfileId } from './transfersTypes'
import type { UploadTuning } from './useTransfersUploadPreferences'
import { commitUploadAndTrackJob } from './uploadRuntimeCommit'
import {
	buildResumeFilesByPath,
	planResumeChunkSettings,
	planUploadMode,
	type UploadRuntimeMode,
} from './uploadRuntimePlanning'
import { resolveExistingResumeChunks } from './uploadRuntimeResume'
import { createUploadSessionWithFallback } from './uploadRuntimeSession'
import { executeUploadAttempt } from './uploadRuntimeAttempt'

function getRetryFileHandleStateForFailure(message: string): UploadTask['retryFileHandleState'] {
	if (/missing files|select the same|file size does not match|interrupted by refresh/i.test(message)) {
		return 'selection_required'
	}
	return 'remembered'
}

type RunUploadTaskArgs = {
	api: APIClientShape
	apiToken: string
	queryClient: QueryClient
	notifications: TransfersRuntimeNotifications
	taskId: string
	task: UploadTask
	items: UploadFileItem[]
	uploadCapabilityByProfileId?: UploadCapabilityByProfileId
	uploadDirectStream?: boolean
	uploadChunkFileConcurrency: number
	uploadResumeConversionEnabled: boolean
	pickUploadTuning: (totalBytes: number, maxFileBytes: number | null) => UploadTuning
	uploadAbortByTaskIdRef: MutableRefObject<Record<string, () => void>>
	uploadEstimatorByTaskIdRef: MutableRefObject<Record<string, TransferEstimator>>
	uploadItemsByTaskIdRef: MutableRefObject<Record<string, UploadFileItem[]>>
	updateUploadTask: (taskId: string, updater: (task: UploadTask) => UploadTask) => void
	handleUploadJobUpdate: (
		taskId: string,
		job: { status?: JobStatus; progress?: JobProgress | null; error?: string | null },
	) => Promise<void>
}

export async function runUploadTask(args: RunUploadTaskArgs): Promise<void> {
	const { task, taskId, items } = args
  const estimator = new TransferEstimator({ totalBytes: task.totalBytes })
	args.uploadEstimatorByTaskIdRef.current[taskId] = estimator
	args.updateUploadTask(taskId, (current) => ({
		...current,
		status: 'staging',
		startedAtMs: estimator.getStartedAtMs(),
		finishedAtMs: undefined,
		loadedBytes: 0,
		speedBps: 0,
		etaSeconds: 0,
		error: undefined,
		jobId: undefined,
		retryFileHandleState: 'remembered',
		uploadFallbackFrom: undefined,
		uploadFallbackReason: undefined,
	}))
	const failBeforeUpload = (message: string) => {
		args.updateUploadTask(taskId, (current) => ({
			...current,
			status: 'failed',
			finishedAtMs: Date.now(),
			error: message,
			retryFileHandleState: getRetryFileHandleStateForFailure(message),
		}))
		args.notifications.error(message)
	}

	let committed = false
	let uploadId = ''
	let existingChunksByPath: Record<string, number[]> | undefined
	try {
		const maxFileBytes = items.length > 0 ? Math.max(...items.map((entry) => entry.file?.size ?? 0)) : task.totalBytes
		const tuning = args.pickUploadTuning(task.totalBytes, Number.isFinite(maxFileBytes) ? maxFileBytes : null)
		const uploadCapability = args.uploadCapabilityByProfileId?.[task.profileId]
		const uploadModePlan = planUploadMode({
			uploadCapability,
			uploadDirectStream: args.uploadDirectStream,
		})
		const { canUsePresigned, canUseDirectMultipart, fallbackMode, preferredMode } = uploadModePlan

		const allowResume = task.uploadMode !== 'presigned'
		const resumeFilesByPath = buildResumeFilesByPath({ task, items, allowResume })

		const resumeChunkSettings = planResumeChunkSettings({
			resumeFilesByPath,
			uploadResumeConversionEnabled: args.uploadResumeConversionEnabled,
		})
		if (!resumeChunkSettings.ok) {
			failBeforeUpload(resumeChunkSettings.error)
			return
		}
		const { resumeChunkSizeBytes, allowPerFileChunkSize } = resumeChunkSettings

		if (allowResume && task.uploadId && resumeFilesByPath.size > 0) {
			const resumeChunks = await resolveExistingResumeChunks({
				api: args.api,
				profileId: task.profileId,
				uploadId: task.uploadId,
				items,
				resumeFilesByPath,
			})
			if (!resumeChunks.ok) {
				failBeforeUpload(resumeChunks.error)
				return
			}
			if (resumeChunks.available) {
				uploadId = resumeChunks.uploadId
				existingChunksByPath = resumeChunks.existingChunksByPath
			}
		}

		let sessionMode: UploadRuntimeMode = task.uploadMode ?? preferredMode
		if (!uploadId) {
			const session = await createUploadSessionWithFallback({
				api: args.api,
				task,
				preferredMode,
				fallbackMode,
				canUsePresigned,
				onFallback: ({ from, to, reason }) => {
					args.updateUploadTask(taskId, (current) => ({
						...current,
						uploadFallbackFrom: from,
						uploadFallbackReason: reason,
					}))
					if (from === 'presigned') {
						args.notifications.info(`Presigned uploads are not supported here. Falling back to ${to} uploads.`)
					}
				},
			})
			uploadId = session.uploadId
			sessionMode = session.mode
			if (session.maxBytes && task.totalBytes > session.maxBytes) {
				throw new Error(`selected files exceed maxBytes (${task.totalBytes} > ${session.maxBytes})`)
			}
		}

		const runUploadAttempt = (
			attemptMode: UploadRuntimeMode,
			attemptUploadId: string,
			attemptExistingChunksByPath = existingChunksByPath,
		) =>
			executeUploadAttempt({
				api: args.api,
				taskId,
				task,
				uploadId: attemptUploadId,
				mode: attemptMode,
				items,
				tuning,
				resumeFilesByPath,
				resumeChunkSizeBytes,
				allowPerFileChunkSize,
				directMultipartUpload: canUseDirectMultipart,
				existingChunksByPath: attemptExistingChunksByPath,
				uploadChunkFileConcurrency: args.uploadChunkFileConcurrency,
				uploadAbortByTaskIdRef: args.uploadAbortByTaskIdRef,
				uploadEstimatorByTaskIdRef: args.uploadEstimatorByTaskIdRef,
				updateUploadTask: args.updateUploadTask,
			})

		const result = await runUploadAttempt(sessionMode, uploadId, existingChunksByPath)
		if (result.skipped > 0) {
			args.notifications.warning(`Skipped ${result.skipped} file(s) with invalid paths.`)
		}

		args.updateUploadTask(taskId, (current) => ({
			...current,
			status: 'commit',
			loadedBytes: current.totalBytes,
			speedBps: 0,
			etaSeconds: 0,
		}))

		await commitUploadAndTrackJob({
			api: args.api,
			apiToken: args.apiToken,
			queryClient: args.queryClient,
			notifications: args.notifications,
			taskId,
			task,
			uploadId,
			items,
			uploadItemsByTaskIdRef: args.uploadItemsByTaskIdRef,
			updateUploadTask: args.updateUploadTask,
			handleUploadJobUpdate: args.handleUploadJobUpdate,
			onCommitted: () => {
				committed = true
			},
		})
	} catch (error) {
		if (error instanceof RequestAbortedError) {
			args.updateUploadTask(taskId, (current) => ({
				...current,
				status: 'canceled',
				finishedAtMs: Date.now(),
				retryFileHandleState: 'remembered',
			}))
			args.notifications.info('Upload canceled')
			return
		}
		maybeReportNetworkError(error)
		const message = formatErr(error)
		args.updateUploadTask(taskId, (current) => ({
			...current,
			status: 'failed',
			finishedAtMs: Date.now(),
			error: message,
			retryFileHandleState: getRetryFileHandleStateForFailure(message),
		}))
		args.notifications.error(message)
	} finally {
		delete args.uploadAbortByTaskIdRef.current[taskId]
		delete args.uploadEstimatorByTaskIdRef.current[taskId]
		if (!committed && uploadId) {
			await args.api.uploads.deleteUpload(task.profileId, uploadId).catch(() => {})
		}
	}
}
