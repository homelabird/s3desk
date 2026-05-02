import type { APIClientShape, UploadFileItem, UploadFilesResult } from '../../api/client'
import type { TransferEstimator } from '../../lib/transfer'
import type { UploadTask } from './transferTypes'
import {
	buildResumeTrackingPlan,
	type ResumeFileInfo,
	type UploadRuntimeMode,
} from './uploadRuntimePlanning'

type UploadAttemptTuning = {
	batchConcurrency: number
	batchBytes: number
	chunkSizeBytes: number
	chunkConcurrency: number
	chunkThresholdBytes: number
}

type ExecuteUploadAttemptArgs = {
	api: APIClientShape
	taskId: string
	task: UploadTask
	uploadId: string
	mode: UploadRuntimeMode
	items: UploadFileItem[]
	tuning: UploadAttemptTuning
	resumeFilesByPath: Map<string, ResumeFileInfo>
	resumeChunkSizeBytes: number
	allowPerFileChunkSize: boolean
	existingChunksByPath?: Record<string, number[]>
	uploadChunkFileConcurrency: number
	uploadAbortByTaskIdRef: { current: Record<string, () => void> }
	uploadEstimatorByTaskIdRef: { current: Record<string, TransferEstimator> }
	updateUploadTask: (taskId: string, updater: (task: UploadTask) => UploadTask) => void
}

export async function executeUploadAttempt(args: ExecuteUploadAttemptArgs): Promise<UploadFilesResult> {
	const chunkSizeBytes =
		args.resumeChunkSizeBytes > 0 && !args.allowPerFileChunkSize
			? args.resumeChunkSizeBytes
			: args.tuning.chunkSizeBytes
	const chunkThresholdBytes = args.tuning.chunkThresholdBytes
	const { shouldTrackResume, resumeFilesNext, chunkSizeByPath } = buildResumeTrackingPlan({
		items: args.items,
		attemptMode: args.mode,
		resumeFilesByPath: args.resumeFilesByPath,
		chunkThresholdBytes,
		chunkSizeBytes,
	})

	args.updateUploadTask(args.taskId, (task) => ({
		...task,
		uploadId: args.uploadId,
		uploadMode: args.mode,
		resumeChunkSizeBytes: shouldTrackResume && args.items.length === 1 ? chunkSizeBytes : undefined,
		resumeFileSize: args.items.length === 1 ? args.items[0]?.file?.size ?? 0 : undefined,
		resumeFiles: resumeFilesNext,
	}))

	const handleProgress = (progress: { loadedBytes: number; totalBytes?: number }) => {
		const estimator = args.uploadEstimatorByTaskIdRef.current[args.taskId]
		if (!estimator) return
		const stats = estimator.update(progress.loadedBytes, progress.totalBytes)
		args.updateUploadTask(args.taskId, (task) => ({
			...task,
			loadedBytes: stats.loadedBytes,
			totalBytes: stats.totalBytes ?? task.totalBytes,
			speedBps: stats.speedBps,
			etaSeconds: stats.etaSeconds,
		}))
	}

	const handle =
		args.mode === 'presigned'
			? (await import('./presignedUpload')).uploadPresignedFilesWithProgress({
					api: args.api,
					profileId: args.task.profileId,
					uploadId: args.uploadId,
					items: args.items,
					onProgress: handleProgress,
					singleConcurrency: args.tuning.batchConcurrency,
					multipartFileConcurrency: args.uploadChunkFileConcurrency,
					partConcurrency: args.tuning.chunkConcurrency,
					chunkThresholdBytes,
					chunkSizeBytes,
				})
			: args.api.uploads.uploadFilesWithProgress(args.task.profileId, args.uploadId, args.items, {
					onProgress: handleProgress,
					concurrency: args.tuning.batchConcurrency,
					maxBatchBytes: args.tuning.batchBytes,
					maxBatchItems: 50,
					chunkSizeBytes,
					chunkConcurrency: args.tuning.chunkConcurrency,
					chunkThresholdBytes,
					existingChunksByPath: args.existingChunksByPath,
					chunkSizeBytesByPath: args.allowPerFileChunkSize ? chunkSizeByPath : undefined,
					chunkFileConcurrency: args.uploadChunkFileConcurrency,
				})

	args.uploadAbortByTaskIdRef.current[args.taskId] = handle.abort
	try {
		return await handle.promise
	} finally {
		delete args.uploadAbortByTaskIdRef.current[args.taskId]
	}
}
