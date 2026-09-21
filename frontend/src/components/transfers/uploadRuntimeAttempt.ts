import { createUploadPreparationReporter } from './uploadPreparation'
import { fingerprintUploadFile } from './uploadFileIdentity'
import { planPresignedMultipart } from './presignedMultipartPlan'
import { normalizeRelPath, normalizeUploadPath, resolveUploadItemPath } from './uploadPaths'
import { RequestAbortedError, type APIClientShape, type UploadFileItem, type UploadFilesResult } from '../../api/client'
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
	directMultipartUpload: boolean
	existingChunksByPath?: Record<string, number[]>
	uploadChunkFileConcurrency: number
	signal: AbortSignal
	uploadEstimatorByTaskIdRef: { current: Record<string, TransferEstimator> }
	onResumableSession?: () => void
	updateUploadTask: (taskId: string, updater: (task: UploadTask) => UploadTask) => void
}

export async function executeUploadAttempt(args: ExecuteUploadAttemptArgs): Promise<UploadFilesResult> {
	const forceMultipartForm = args.mode === 'direct' && !args.directMultipartUpload
	const chunkSizeBytes =
		args.resumeChunkSizeBytes > 0 && !args.allowPerFileChunkSize
			? args.resumeChunkSizeBytes
			: args.tuning.chunkSizeBytes
	const chunkThresholdBytes = forceMultipartForm ? Number.POSITIVE_INFINITY : args.tuning.chunkThresholdBytes
	const estimator = args.uploadEstimatorByTaskIdRef.current[args.taskId]
	const preparation = createUploadPreparationReporter({
		taskId: args.taskId, phase: 'fingerprinting', signal: args.signal,
		isCurrent: () => args.uploadEstimatorByTaskIdRef.current[args.taskId] === estimator,
		updateTask: args.updateUploadTask,
	})
	const fingerprintsByPath = new Map<string, string>()
	const seenPaths = new Set<string>()
	for (const item of args.items) {
		const path = normalizeUploadPath(resolveUploadItemPath(item))
		if (!path) continue
		if (seenPaths.has(path)) throw new Error('Duplicate upload paths are not safe to resume. Rename the duplicate files.')
		seenPaths.add(path)
	}
	const fingerprintItems = args.items.filter((item) => {
		const knownResume = args.resumeFilesByPath.has(normalizeRelPath(resolveUploadItemPath(item)))
		return knownResume || (item.file.size >= chunkThresholdBytes &&
			(args.mode !== 'presigned' || !!planPresignedMultipart({ fileSize: item.file.size, partSizeBytes: chunkSizeBytes, thresholdBytes: chunkThresholdBytes })))
	})
	try {
		for (const [index, item] of fingerprintItems.entries()) {
			const fingerprint = await fingerprintUploadFile(item.file, args.signal, (progress) => preparation.report({
				...progress, fileName: resolveUploadItemPath(item), fileIndex: index + 1, fileCount: fingerprintItems.length,
			}))
			if (fingerprint) fingerprintsByPath.set(normalizeRelPath(resolveUploadItemPath(item)), fingerprint)
		}
	} finally { preparation.clear() }

	const { shouldTrackResume, resumeFilesNext, chunkSizeByPath } = buildResumeTrackingPlan({
		items: args.items,
		attemptMode: args.mode,
		resumeFilesByPath: args.resumeFilesByPath,
		chunkThresholdBytes,
		chunkSizeBytes,
		fingerprintsByPath,
	})

	const hasVerifiedResume = resumeFilesNext?.some((file) => !!file.fingerprint) ?? false
	if (hasVerifiedResume) args.onResumableSession?.()
	args.updateUploadTask(args.taskId, (task) => ({
		...task,
		uploadId: args.uploadId,
		uploadMode: args.mode,
		resumeChunkSizeBytes: shouldTrackResume && args.items.length === 1 ? resumeFilesNext?.[0]?.chunkSizeBytes : undefined,
		resumeFileSize: args.items.length === 1 ? args.items[0]?.file?.size ?? 0 : undefined,
		resumeFiles: resumeFilesNext,
	}))

	const handleProgress = (progress: { loadedBytes: number; totalBytes?: number }) => {
		if (args.signal.aborted || !estimator || args.uploadEstimatorByTaskIdRef.current[args.taskId] !== estimator) return
		const stats = estimator.update(progress.loadedBytes, progress.totalBytes)
		args.updateUploadTask(args.taskId, (task) => ({
			...task,
			loadedBytes: stats.loadedBytes,
			totalBytes: stats.totalBytes ?? task.totalBytes,
			speedBps: stats.speedBps,
			etaSeconds: stats.etaSeconds,
		}))
	}

	let handle: { promise: Promise<UploadFilesResult>; abort: () => void }
	if (args.mode === 'presigned') {
		const presignedUpload = await import('./presignedUpload')
		if (args.signal.aborted) throw new RequestAbortedError()
		handle = presignedUpload.uploadPresignedFilesWithProgress({
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
			existingChunksByPath: args.existingChunksByPath,
			chunkSizeBytesByPath: chunkSizeByPath,
			preserveSessionOnFailure: hasVerifiedResume,
			networkRetries: 4,
		})
	} else {
		if (args.signal.aborted) throw new RequestAbortedError()
		handle = args.api.uploads.uploadFilesWithProgress(args.task.profileId, args.uploadId, args.items, {
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
			forceMultipartForm,
		})
	}

	const abort = () => handle.abort()
	args.signal.addEventListener('abort', abort, { once: true })
	try {
		if (args.signal.aborted) {
			handle.abort()
			throw new RequestAbortedError()
		}
		const result = await handle.promise
		if (args.signal.aborted) throw new RequestAbortedError()
		return result
	} catch (error) {
		if (args.signal.aborted) throw new RequestAbortedError()
		throw error
	} finally {
		args.signal.removeEventListener('abort', abort)
	}
}
