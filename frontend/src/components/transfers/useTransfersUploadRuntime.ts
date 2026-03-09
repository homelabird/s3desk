import type { QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import {
	APIClient,
	APIError,
	RequestAbortedError,
	type UploadFileItem,
} from '../../api/client'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { withJobQueueRetry } from '../../lib/jobQueue'
import { TransferEstimator } from '../../lib/transfer'
import type { UploadTask } from './transferTypes'
import { maybeReportNetworkError, randomId } from './transferDownloadUtils'
import { uploadPresignedFilesWithProgress } from './presignedUpload'
import type {
	QueueUploadFilesArgs,
	TransfersRuntimeNotifications,
	UploadCapabilityByProfileId,
} from './transfersTypes'
import { useTransfersUploadJobEvents } from './useTransfersUploadJobEvents'
import {
	normalizeRelPath,
	resolveUploadItemPath,
	resolveUploadItemPathNormalized,
} from './uploadPaths'
import { createLocalVideoUploadPreview, isVideoUploadFile, revokeObjectURLSafe } from './uploadPreview'
import { buildUploadCommitRequest, buildUploadItems, promptForFiles } from './transfersUploadUtils'
import { buildQueuedUpload } from './transfersQueuedUpload'
import type { UploadTuning } from './useTransfersUploadPreferences'
import type { JobProgress, JobStatus } from '../../api/types'

type UseTransfersUploadRuntimeArgs = {
	api: APIClient
	apiToken: string
	queryClient: QueryClient
	notifications: TransfersRuntimeNotifications
	uploadCapabilityByProfileId?: UploadCapabilityByProfileId
	uploadDirectStream?: boolean
	uploadChunkFileConcurrency: number
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

const uploadConcurrency = 1

export function useTransfersUploadRuntime(args: UseTransfersUploadRuntimeArgs) {
	const retryUploadTask = useCallback(
		async (taskId: string) => {
			const current = args.uploadTasksRef.current.find((t) => t.id === taskId)
			if (!current) return

			let items = args.uploadItemsByTaskIdRef.current[taskId]
			if (!items || items.length === 0) {
				const resumeFiles = current.resumeFiles ?? []
				const expectedPaths = (resumeFiles.length > 0 ? resumeFiles.map((f) => f.path) : current.filePaths ?? [])
					.map(normalizeRelPath)
					.filter(Boolean)
				const expectDirectory = expectedPaths.some((p) => p.includes('/'))
				const selected = await promptForFiles({
					multiple: current.fileCount > 1 || expectDirectory,
					directory: expectDirectory,
				})
				if (!selected) return

				const selectedItems = buildUploadItems(selected)
				if (expectedPaths.length > 0) {
					const selectedByPath = new Map(
						selectedItems.map((item) => [normalizeRelPath(item.relPath ?? item.file.name), item]),
					)
					const matched: UploadFileItem[] = []
					const missing: string[] = []
					for (const path of expectedPaths) {
						const found = selectedByPath.get(path)
						if (!found) {
							missing.push(path)
							continue
						}
						if (resumeFiles.length > 0) {
							const resume = resumeFiles.find((f) => normalizeRelPath(f.path) === path)
							if (resume && found.file?.size !== resume.size) {
								missing.push(path)
								continue
							}
						}
						matched.push(found)
					}
					if (missing.length > 0) {
						args.notifications.error(`Missing ${missing.length} file(s). Select the same files or folder to resume.`)
						return
					}
					items = matched
				} else {
					items = selectedItems
				}

				const totalBytes = items.reduce((sum, item) => sum + (item.file?.size ?? 0), 0)
				if (current.resumeFileSize && items.length === 1 && items[0]?.file?.size !== current.resumeFileSize) {
					args.notifications.error('Selected file size does not match the previous upload.')
					return
				}
				args.uploadItemsByTaskIdRef.current[taskId] = items
				args.updateUploadTask(taskId, (t) => ({
					...t,
					fileCount: items.length,
					totalBytes,
					filePaths: items.map((item) => normalizeRelPath(item.relPath ?? item.file.name)).filter(Boolean),
					resumeFileSize: items.length === 1 ? items[0]?.file?.size ?? 0 : undefined,
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

			const items = args.uploadItemsByTaskIdRef.current[taskId]
			if (!items || items.length === 0) {
				args.updateUploadTask(taskId, (t) => ({ ...t, status: 'failed', finishedAtMs: Date.now(), error: 'missing files (remove and re-add)' }))
				return
			}

			const estimator = new TransferEstimator({ totalBytes: current.totalBytes })
			args.uploadEstimatorByTaskIdRef.current[taskId] = estimator
			args.updateUploadTask(taskId, (t) => ({
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
			let existingChunksByPath: Record<string, number[]> | undefined
			try {
				const maxFileBytes = items.length > 0 ? Math.max(...items.map((entry) => entry.file?.size ?? 0)) : current.totalBytes
				const tuning = args.pickUploadTuning(current.totalBytes, Number.isFinite(maxFileBytes) ? maxFileBytes : null)

				const allowResume = current.uploadMode !== 'presigned'
				const resumeFilesByPath = new Map<string, { size: number; chunkSizeBytes: number }>()
				if (allowResume) {
					if (current.resumeFiles && current.resumeFiles.length > 0) {
						for (const file of current.resumeFiles) {
							const pathKey = normalizeRelPath(file.path)
							if (!pathKey) continue
							resumeFilesByPath.set(pathKey, { size: file.size, chunkSizeBytes: file.chunkSizeBytes })
						}
					} else if (current.resumeChunkSizeBytes && current.resumeFileSize && items.length === 1) {
						const pathKey = resolveUploadItemPathNormalized(items[0])
						if (pathKey) {
							resumeFilesByPath.set(pathKey, {
								size: current.resumeFileSize,
								chunkSizeBytes: current.resumeChunkSizeBytes,
							})
						}
					}
				}

				let resumeChunkSizeBytes = 0
				let allowPerFileChunkSize = false
				if (allowResume && resumeFilesByPath.size > 0) {
					allowPerFileChunkSize = args.uploadResumeConversionEnabled
					const distinctSizes = new Set(Array.from(resumeFilesByPath.values()).map((v) => v.chunkSizeBytes))
					if (distinctSizes.size > 1) {
						if (!args.uploadResumeConversionEnabled) {
							args.notifications.error('Resume requires consistent chunk size across files. Enable conversion mode or re-add files.')
							return
						}
						allowPerFileChunkSize = true
					}
					resumeChunkSizeBytes = Array.from(distinctSizes)[0] ?? 0
				}

				if (allowResume && current.uploadId && resumeFilesByPath.size > 0) {
					const existing: Record<string, number[]> = {}
					let resumeAvailable = true
					for (const item of items) {
						const pathRaw = resolveUploadItemPath(item)
						const pathKey = normalizeRelPath(pathRaw)
						const resumeInfo = resumeFilesByPath.get(pathKey)
						if (!resumeInfo) continue
						if ((item.file?.size ?? 0) !== resumeInfo.size) {
							args.notifications.error('Selected file size does not match the previous upload.')
							return
						}
						try {
							const chunkState = await args.api.getUploadChunks(current.profileId, current.uploadId, {
								path: pathRaw,
								total: Math.max(1, Math.ceil(resumeInfo.size / resumeInfo.chunkSizeBytes)),
								chunkSize: resumeInfo.chunkSizeBytes,
								fileSize: resumeInfo.size,
							})
							existing[pathRaw] = chunkState.present
						} catch (err) {
							if (err instanceof APIError && err.status === 404) {
								resumeAvailable = false
								break
							}
							throw err
						}
					}
					if (resumeAvailable) {
						uploadId = current.uploadId
						existingChunksByPath = existing
					}
				}

				let sessionMode = current.uploadMode
				if (!uploadId) {
					const uploadCapability = args.uploadCapabilityByProfileId?.[current.profileId]
					const canUsePresigned = uploadCapability ? uploadCapability.presignedUpload : true
					const canUseDirect = uploadCapability ? uploadCapability.directUpload : !!args.uploadDirectStream
					const directModePreferred = !!args.uploadDirectStream && canUseDirect
					const fallbackMode: 'direct' | 'staging' = directModePreferred ? 'direct' : 'staging'
					const preferredMode: 'presigned' | 'direct' | 'staging' = canUsePresigned ? 'presigned' : fallbackMode
					let session: { uploadId: string; mode: 'staging' | 'direct' | 'presigned'; maxBytes?: number | null }
					try {
						session = await args.api.createUpload(current.profileId, {
							bucket: current.bucket,
							prefix: current.prefix ?? '',
							mode: preferredMode,
						})
					} catch (err) {
						if (
							canUsePresigned &&
							err instanceof APIError &&
							(err.code === 'not_supported' || err.code === 'invalid_request')
						) {
							session = await args.api.createUpload(current.profileId, {
								bucket: current.bucket,
								prefix: current.prefix ?? '',
								mode: fallbackMode,
							})
							args.notifications.info(`Presigned uploads are not supported here. Falling back to ${fallbackMode} uploads.`)
						} else if (
							preferredMode === 'direct' &&
							err instanceof APIError &&
							(err.code === 'not_supported' || err.code === 'invalid_request')
						) {
							session = await args.api.createUpload(current.profileId, {
								bucket: current.bucket,
								prefix: current.prefix ?? '',
								mode: 'staging',
							})
						} else {
							throw err
						}
					}
					uploadId = session.uploadId
					sessionMode = session.mode
					if (session.maxBytes && current.totalBytes > session.maxBytes) {
						throw new Error(`selected files exceed maxBytes (${current.totalBytes} > ${session.maxBytes})`)
					}
				}

				const chunkSizeBytes = resumeChunkSizeBytes > 0 && !allowPerFileChunkSize ? resumeChunkSizeBytes : tuning.chunkSizeBytes
				const chunkThresholdBytes = tuning.chunkThresholdBytes
				const shouldTrackResume = sessionMode !== 'presigned'
				const chunkSizeByPath: Record<string, number> = {}

				const resumeFilesNext = shouldTrackResume
					? items
							.filter((item) => {
								const pathKey = resolveUploadItemPathNormalized(item)
								if (resumeFilesByPath.has(pathKey)) return true
								return (item.file?.size ?? 0) >= chunkThresholdBytes
							})
							.map((item) => {
								const pathKey = resolveUploadItemPathNormalized(item)
								const pathRaw = resolveUploadItemPath(item)
								const resumeInfo = resumeFilesByPath.get(pathKey)
								const fileChunkSize = resumeInfo?.chunkSizeBytes ?? chunkSizeBytes
								if (pathRaw) {
									chunkSizeByPath[pathRaw] = fileChunkSize
								}
								return {
									path: pathKey,
									size: item.file?.size ?? 0,
									chunkSizeBytes: fileChunkSize,
								}
							})
					: undefined

				args.updateUploadTask(taskId, (t) => ({
					...t,
					uploadId,
					uploadMode: sessionMode,
					resumeChunkSizeBytes: shouldTrackResume && items.length === 1 ? chunkSizeBytes : undefined,
					resumeFileSize: items.length === 1 ? items[0]?.file?.size ?? 0 : undefined,
					resumeFiles: resumeFilesNext,
				}))

				const handle =
					sessionMode === 'presigned'
						? uploadPresignedFilesWithProgress({
								api: args.api,
								profileId: current.profileId,
								uploadId,
								items,
								onProgress: (p) => {
									const estimator = args.uploadEstimatorByTaskIdRef.current[taskId]
									if (!estimator) return
									const stats = estimator.update(p.loadedBytes, p.totalBytes)
									args.updateUploadTask(taskId, (t) => ({
										...t,
										loadedBytes: stats.loadedBytes,
										totalBytes: stats.totalBytes ?? t.totalBytes,
										speedBps: stats.speedBps,
										etaSeconds: stats.etaSeconds,
									}))
								},
								singleConcurrency: tuning.batchConcurrency,
								multipartFileConcurrency: args.uploadChunkFileConcurrency,
								partConcurrency: tuning.chunkConcurrency,
								chunkThresholdBytes,
								chunkSizeBytes,
							})
						: args.api.uploadFilesWithProgress(current.profileId, uploadId, items, {
								onProgress: (p) => {
									const estimator = args.uploadEstimatorByTaskIdRef.current[taskId]
									if (!estimator) return
									const stats = estimator.update(p.loadedBytes, p.totalBytes)
									args.updateUploadTask(taskId, (t) => ({
										...t,
										loadedBytes: stats.loadedBytes,
										totalBytes: stats.totalBytes ?? t.totalBytes,
										speedBps: stats.speedBps,
										etaSeconds: stats.etaSeconds,
									}))
								},
								concurrency: tuning.batchConcurrency,
								maxBatchBytes: tuning.batchBytes,
								maxBatchItems: 50,
								chunkSizeBytes,
								chunkConcurrency: tuning.chunkConcurrency,
								chunkThresholdBytes,
								existingChunksByPath,
								chunkSizeBytesByPath: allowPerFileChunkSize ? chunkSizeByPath : undefined,
								chunkFileConcurrency: args.uploadChunkFileConcurrency,
							})

				args.uploadAbortByTaskIdRef.current[taskId] = handle.abort
				const result = await handle.promise
				delete args.uploadAbortByTaskIdRef.current[taskId]
				if (result.skipped > 0) {
					args.notifications.warning(`Skipped ${result.skipped} file(s) with invalid paths.`)
				}

				args.updateUploadTask(taskId, (t) => ({
					...t,
					status: 'commit',
					loadedBytes: t.totalBytes,
					speedBps: 0,
					etaSeconds: 0,
				}))

				const commitReq = buildUploadCommitRequest(current, items)
				const resp = await withJobQueueRetry(() => args.api.commitUpload(current.profileId, uploadId, commitReq))
				committed = true
				delete args.uploadItemsByTaskIdRef.current[taskId]
				args.updateUploadTask(taskId, (t) => ({
					...t,
					status: 'waiting_job',
					finishedAtMs: undefined,
					jobId: resp.jobId,
					loadedBytes: 0,
					speedBps: 0,
					etaSeconds: 0,
				}))

				if (resp.jobId) {
					void args.api
						.getJob(current.profileId, resp.jobId)
						.then((job) => args.handleUploadJobUpdate(taskId, job))
						.catch((err) => {
							maybeReportNetworkError(err)
							args.updateUploadTask(taskId, (prev) => ({ ...prev, error: formatErr(err) }))
						})
				}

				args.notifications.uploadCommitted(resp.jobId)
				await args.queryClient.invalidateQueries({ queryKey: ['jobs'] })
			} catch (err) {
				if (err instanceof RequestAbortedError) {
					args.updateUploadTask(taskId, (t) => ({ ...t, status: 'canceled', finishedAtMs: Date.now() }))
					args.notifications.info('Upload canceled')
					return
				}
				maybeReportNetworkError(err)
				const msg = formatErr(err)
				args.updateUploadTask(taskId, (t) => ({ ...t, status: 'failed', finishedAtMs: Date.now(), error: msg }))
				args.notifications.error(msg)
			} finally {
				delete args.uploadAbortByTaskIdRef.current[taskId]
				delete args.uploadEstimatorByTaskIdRef.current[taskId]
				if (!committed && uploadId) {
					await args.api.deleteUpload(current.profileId, uploadId).catch(() => {})
				}
			}
		},
		[args],
	)

	useEffect(() => {
		const running = args.uploadTasks.filter((t) => t.status === 'staging' || t.status === 'commit').length
		const capacity = uploadConcurrency - running
		if (capacity <= 0) return
		const toStart = args.uploadTasks.filter((t) => t.status === 'queued').slice(0, capacity)
		for (const task of toStart) void startUploadTask(task.id)
	}, [args.uploadTasks, startUploadTask])

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
			args.uploadItemsByTaskIdRef.current[taskId] = items

			args.setUploadTasks((prev) => [task, ...prev])
			args.openTransfers('uploads')

			const previewItem = items.find((item) => isVideoUploadFile(item.file))
			if (!previewItem) return

			void createLocalVideoUploadPreview(previewItem.file, { label: resolveUploadItemPath(previewItem) }).then((preview) => {
				if (!preview) return
				if (!args.uploadTasksRef.current.some((entry) => entry.id === taskId)) {
					revokeObjectURLSafe(preview.url)
					return
				}
				args.uploadPreviewUrlByTaskIdRef.current[taskId] = preview.url
				args.updateUploadTask(taskId, (current) => ({ ...current, preview }))
			})
		},
		[args],
	)

	return {
		retryUploadTask,
		queueUploadFiles,
	}
}
