import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Space, Typography, message } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import {
	APIClient,
	APIError,
	RequestAbortedError,
	type UploadCommitRequest,
	type UploadFileItem,
} from '../api/client'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { useTransfers } from './useTransfers'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { TransferEstimator } from '../lib/transfer'
import { withJobQueueRetry } from '../lib/jobQueue'
import { MOVE_CLEANUP_FILENAME_MAX_LEN, MOVE_CLEANUP_FILENAME_TEMPLATE } from '../lib/moveCleanupDefaults'
import type {
	DownloadTask,
	TransfersTab,
	UploadTask,
} from './transfers/transferTypes'
import { maybeReportNetworkError, randomId } from './transfers/transferDownloadUtils'
import { formatMoveCleanupSummary, showMoveCleanupReport } from './transfers/moveCleanupReport'
import { TransfersProviderView } from './transfers/TransfersProviderView'
import { useTransfersDrawerProps } from './transfers/useTransfersDrawerProps'
import { useTransfersDownloadQueue } from './transfers/useTransfersDownloadQueue'
import { useTransfersPersistence } from './transfers/useTransfersPersistence'
import { useTransfersTaskActions } from './transfers/useTransfersTaskActions'
import { useTransfersUploadJobEvents } from './transfers/useTransfersUploadJobEvents'
import { useTransfersUploadJobLifecycle } from './transfers/useTransfersUploadJobLifecycle'
import { uploadPresignedFilesWithProgress } from './transfers/presignedUpload'
import {
	normalizeRelPath,
	normalizeUploadPath,
	resolveUploadItemPath,
	resolveUploadItemPathNormalized,
} from './transfers/uploadPaths'

type UploadMovePlan = {
	rootHandle: FileSystemDirectoryHandle
	relPaths: string[]
	label?: string
	cleanupEmptyDirs?: boolean
}

const promptForFiles = (args: { multiple: boolean; directory: boolean }): Promise<File[] | null> =>
	new Promise((resolve) => {
		const input = document.createElement('input')
		input.type = 'file'
		input.multiple = args.multiple
		if (args.directory) {
			;(input as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory = true
		}
		input.style.display = 'none'
		const cleanup = () => {
			input.remove()
		}
		input.addEventListener('change', () => {
			const files = input.files ? Array.from(input.files) : []
			cleanup()
			resolve(files.length ? files : null)
		})
		document.body.appendChild(input)
		input.click()
	})

const buildUploadItems = (files: File[]): UploadFileItem[] =>
	files.map((file) => {
		const fileWithPath = file as File & { webkitRelativePath?: string; relativePath?: string }
		const relPathRaw = (fileWithPath.webkitRelativePath ?? fileWithPath.relativePath ?? '').trim()
		return { file, relPath: relPathRaw || file.name }
	})

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

type UploadCapabilityByProfileId = Record<string, { presignedUpload: boolean; directUpload: boolean }>

export function TransfersProvider(props: {
	apiToken: string
	uploadDirectStream?: boolean
	uploadCapabilityByProfileId?: UploadCapabilityByProfileId
	children: ReactNode
}) {
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])

	const [isOpen, setIsOpen] = useState(false)
	const [tab, setTab] = useLocalStorageState<TransfersTab>('transfersTab', 'downloads')

	const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([])
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
	const [downloadLinkProxyEnabled] = useLocalStorageState<boolean>('downloadLinkProxyEnabled', false)

	useTransfersPersistence({
		downloadTasks,
		uploadTasks,
		setDownloadTasks,
		setUploadTasks,
	})

	useEffect(() => {
		uploadTasksRef.current = uploadTasks
	}, [uploadTasks])

	const downloadConcurrency = 2
	const uploadConcurrency = 1
	const [uploadAutoTuneEnabled] = useLocalStorageState<boolean>('uploadAutoTuneEnabled', true)
	const [uploadBatchConcurrencySetting] = useLocalStorageState<number>('uploadBatchConcurrency', 16)
	const [uploadBatchBytesMiBSetting] = useLocalStorageState<number>('uploadBatchBytesMiB', 64)
	const [uploadChunkSizeMiBSetting] = useLocalStorageState<number>('uploadChunkSizeMiB', 128)
	const [uploadChunkConcurrencySetting] = useLocalStorageState<number>('uploadChunkConcurrency', 8)
	const [uploadChunkThresholdMiBSetting] = useLocalStorageState<number>('uploadChunkThresholdMiB', 256)
	const [uploadChunkFileConcurrencySetting] = useLocalStorageState<number>('uploadChunkFileConcurrency', 2)
	const [uploadResumeConversionEnabled] = useLocalStorageState<boolean>('uploadResumeConversionEnabled', false)
	const uploadBatchConcurrency = Math.min(
		32,
		Math.max(1, Number.isFinite(uploadBatchConcurrencySetting) ? uploadBatchConcurrencySetting : 16),
	)
	const uploadBatchBytesMiB = Math.min(256, Math.max(8, Number.isFinite(uploadBatchBytesMiBSetting) ? uploadBatchBytesMiBSetting : 64))
	const uploadChunkSizeMiB = Math.min(512, Math.max(16, Number.isFinite(uploadChunkSizeMiBSetting) ? uploadChunkSizeMiBSetting : 128))
	const uploadChunkConcurrency = Math.min(
		16,
		Math.max(1, Number.isFinite(uploadChunkConcurrencySetting) ? uploadChunkConcurrencySetting : 8),
	)
	const uploadChunkThresholdMiB = Math.min(
		2048,
		Math.max(64, Number.isFinite(uploadChunkThresholdMiBSetting) ? uploadChunkThresholdMiBSetting : 256),
	)
	const uploadChunkFileConcurrency = Math.min(
		8,
		Math.max(1, Number.isFinite(uploadChunkFileConcurrencySetting) ? uploadChunkFileConcurrencySetting : 2),
	)
	const uploadBatchBytes = uploadBatchBytesMiB * 1024 * 1024
	const uploadChunkSizeBytes = uploadChunkSizeMiB * 1024 * 1024
	const uploadChunkThresholdBytes = uploadChunkThresholdMiB * 1024 * 1024

	const pickUploadTuning = useCallback(
		(totalBytes: number, maxFileBytes: number | null) => {
			if (!uploadAutoTuneEnabled) {
				return {
					batchConcurrency: uploadBatchConcurrency,
					batchBytes: uploadBatchBytes,
					chunkSizeBytes: uploadChunkSizeBytes,
					chunkConcurrency: uploadChunkConcurrency,
					chunkThresholdBytes: uploadChunkThresholdBytes,
				}
			}

			const size = Math.max(totalBytes, maxFileBytes ?? 0)
			const mib = size / (1024 * 1024)

			if (mib <= 256) {
				return {
					batchConcurrency: 8,
					batchBytes: 32 * 1024 * 1024,
					chunkSizeBytes: 64 * 1024 * 1024,
					chunkConcurrency: 4,
					chunkThresholdBytes: 128 * 1024 * 1024,
				}
			}
			if (mib <= 2048) {
				return {
					batchConcurrency: 16,
					batchBytes: 64 * 1024 * 1024,
					chunkSizeBytes: 128 * 1024 * 1024,
					chunkConcurrency: 8,
					chunkThresholdBytes: 256 * 1024 * 1024,
				}
			}
			if (mib <= 8192) {
				return {
					batchConcurrency: 24,
					batchBytes: 96 * 1024 * 1024,
					chunkSizeBytes: 256 * 1024 * 1024,
					chunkConcurrency: 12,
					chunkThresholdBytes: 512 * 1024 * 1024,
				}
			}
			return {
				batchConcurrency: 32,
				batchBytes: 128 * 1024 * 1024,
				chunkSizeBytes: 256 * 1024 * 1024,
				chunkConcurrency: 16,
				chunkThresholdBytes: 512 * 1024 * 1024,
			}
		},
		[
			uploadAutoTuneEnabled,
			uploadBatchConcurrency,
			uploadBatchBytes,
			uploadChunkSizeBytes,
			uploadChunkConcurrency,
			uploadChunkThresholdBytes,
		],
	)

	const openTransfers = useCallback(
		(nextTab?: TransfersTab) => {
			if (nextTab) setTab(nextTab)
			setIsOpen(true)
		},
		[setTab],
	)

	const closeTransfers = useCallback(() => setIsOpen(false), [])

	const {
		updateDownloadTask,
		cancelDownloadTask,
		retryDownloadTask,
		removeDownloadTask,
		clearCompletedDownloads,
		updateUploadTask,
		cancelUploadTask,
		removeUploadTask,
		clearCompletedUploads,
		clearAllTransfers,
	} = useTransfersTaskActions({
		setDownloadTasks,
		setUploadTasks,
		downloadAbortByTaskIdRef,
		downloadEstimatorByTaskIdRef,
		uploadAbortByTaskIdRef,
		uploadEstimatorByTaskIdRef,
		uploadItemsByTaskIdRef,
		uploadMoveByTaskIdRef,
	})

	const { handleUploadJobUpdate } = useTransfersUploadJobLifecycle({
		uploadTasksRef,
		uploadMoveByTaskIdRef,
		moveCleanupFilenameTemplate,
		moveCleanupFilenameMaxLen,
		updateUploadTask,
		formatMoveCleanupSummary,
		showMoveCleanupReport,
	})

	const retryUploadTask = useCallback(
		async (taskId: string) => {
			const current = uploadTasksRef.current.find((t) => t.id === taskId)
			if (!current) return

			const movePlan = uploadMoveByTaskIdRef.current[taskId]
			if (current.cleanupFailed && current.moveAfterUpload && current.jobId && movePlan) {
				updateUploadTask(taskId, (t) => ({
					...t,
					status: 'waiting_job',
					finishedAtMs: undefined,
					error: undefined,
					cleanupFailed: false,
				}))
				return
			}

			let items = uploadItemsByTaskIdRef.current[taskId]
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
						message.error(`Missing ${missing.length} file(s). Select the same files or folder to resume.`)
						return
					}
					items = matched
				} else {
					items = selectedItems
				}

				const totalBytes = items.reduce((sum, item) => sum + (item.file?.size ?? 0), 0)
				if (current.resumeFileSize && items.length === 1 && items[0]?.file?.size !== current.resumeFileSize) {
					message.error('Selected file size does not match the previous upload.')
					return
				}
				uploadItemsByTaskIdRef.current[taskId] = items
				updateUploadTask(taskId, (t) => ({
					...t,
					fileCount: items.length,
					totalBytes,
					filePaths: items.map((item) => normalizeRelPath(item.relPath ?? item.file.name)).filter(Boolean),
					resumeFileSize: items.length === 1 ? items[0]?.file?.size ?? 0 : undefined,
				}))
			}

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
				cleanupFailed: false,
			}))
		},
		[updateUploadTask],
	)

	const { queueDownloadObject, queueDownloadObjectsToDevice, queueDownloadJobArtifact } = useTransfersDownloadQueue({
		api,
		downloadLinkProxyEnabled,
		downloadConcurrency,
		downloadTasks,
		setDownloadTasks,
		downloadAbortByTaskIdRef,
		downloadEstimatorByTaskIdRef,
		updateDownloadTask,
		openTransfers,
	})

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
			let existingChunksByPath: Record<string, number[]> | undefined
			try {
				const maxFileBytes =
					items.length > 0 ? Math.max(...items.map((entry) => entry.file?.size ?? 0)) : current.totalBytes
				const tuning = pickUploadTuning(current.totalBytes, Number.isFinite(maxFileBytes) ? maxFileBytes : null)

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
					allowPerFileChunkSize = uploadResumeConversionEnabled
					const distinctSizes = new Set(Array.from(resumeFilesByPath.values()).map((v) => v.chunkSizeBytes))
					if (distinctSizes.size > 1) {
						if (!uploadResumeConversionEnabled) {
							message.error('Resume requires consistent chunk size across files. Enable conversion mode or re-add files.')
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
							message.error('Selected file size does not match the previous upload.')
							return
						}
						try {
							const chunkState = await api.getUploadChunks(current.profileId, current.uploadId, {
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
					const uploadCapability = props.uploadCapabilityByProfileId?.[current.profileId]
					const canUsePresigned = uploadCapability ? uploadCapability.presignedUpload : true
					const canUseDirect = uploadCapability ? uploadCapability.directUpload : !!props.uploadDirectStream
					const directModePreferred = !!props.uploadDirectStream && canUseDirect
					const fallbackMode: 'direct' | 'staging' = directModePreferred ? 'direct' : 'staging'
					const preferredMode: 'presigned' | 'direct' | 'staging' = canUsePresigned ? 'presigned' : fallbackMode
					let session: { uploadId: string; mode: 'staging' | 'direct' | 'presigned'; maxBytes?: number | null }
					try {
						session = await api.createUpload(current.profileId, {
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
							session = await api.createUpload(current.profileId, {
								bucket: current.bucket,
								prefix: current.prefix ?? '',
								mode: fallbackMode,
							})
							message.info(`Presigned uploads are not supported here. Falling back to ${fallbackMode} uploads.`)
						} else if (
							preferredMode === 'direct' &&
							err instanceof APIError &&
							(err.code === 'not_supported' || err.code === 'invalid_request')
						) {
							session = await api.createUpload(current.profileId, {
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

				updateUploadTask(taskId, (t) => ({
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
								api,
								profileId: current.profileId,
								uploadId,
								items,
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
								singleConcurrency: tuning.batchConcurrency,
								multipartFileConcurrency: uploadChunkFileConcurrency,
								partConcurrency: tuning.chunkConcurrency,
								chunkThresholdBytes,
								chunkSizeBytes,
							})
						: api.uploadFilesWithProgress(current.profileId, uploadId, items, {
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
								concurrency: tuning.batchConcurrency,
								maxBatchBytes: tuning.batchBytes,
								maxBatchItems: 50,
								chunkSizeBytes,
								chunkConcurrency: tuning.chunkConcurrency,
								chunkThresholdBytes,
								existingChunksByPath,
								chunkSizeBytesByPath: allowPerFileChunkSize ? chunkSizeByPath : undefined,
								chunkFileConcurrency: uploadChunkFileConcurrency,
							})
				uploadAbortByTaskIdRef.current[taskId] = handle.abort
				const result = await handle.promise
				delete uploadAbortByTaskIdRef.current[taskId]
				if (result.skipped > 0) {
					message.warning(`Skipped ${result.skipped} file(s) with invalid paths.`)
				}

				updateUploadTask(taskId, (t) => ({
					...t,
					status: 'commit',
					loadedBytes: t.totalBytes,
					speedBps: 0,
					etaSeconds: 0,
				}))

				const commitReq = buildUploadCommitRequest(current, items)
				const resp = await withJobQueueRetry(() => api.commitUpload(current.profileId, uploadId, commitReq))
				committed = true
				delete uploadItemsByTaskIdRef.current[taskId]
				updateUploadTask(taskId, (t) => ({
					...t,
					status: 'waiting_job',
					finishedAtMs: undefined,
					jobId: resp.jobId,
					cleanupFailed: false,
					loadedBytes: 0,
					speedBps: 0,
					etaSeconds: 0,
				}))

				if (resp.jobId) {
					void api
						.getJob(current.profileId, resp.jobId)
						.then((job) => handleUploadJobUpdate(taskId, job))
						.catch((err) => {
							maybeReportNetworkError(err)
							updateUploadTask(taskId, (prev) => ({ ...prev, error: formatErr(err) }))
						})
				}

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
				maybeReportNetworkError(err)
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
				[
					api,
					handleUploadJobUpdate,
					navigate,
					pickUploadTuning,
					props.uploadCapabilityByProfileId,
					props.uploadDirectStream,
					queryClient,
					updateUploadTask,
				uploadChunkFileConcurrency,
				uploadResumeConversionEnabled,
			],
	)

	useEffect(() => {
		const running = uploadTasks.filter((t) => t.status === 'staging' || t.status === 'commit').length
		const capacity = uploadConcurrency - running
		if (capacity <= 0) return
		const toStart = uploadTasks.filter((t) => t.status === 'queued').slice(0, capacity)
		for (const t of toStart) void startUploadTask(t.id)
	}, [startUploadTask, uploadConcurrency, uploadTasks])

	const hasPendingUploadJobs = uploadTasks.some((t) => t.status === 'waiting_job')
		useTransfersUploadJobEvents({
			api,
			apiToken: props.apiToken,
			hasPendingUploadJobs,
			uploadTasksRef,
			handleUploadJobUpdate,
			updateUploadTask,
		})

		const queueUploadFiles = useCallback(
			(args: { profileId: string; bucket: string; prefix: string; files: File[]; label?: string; moveSource?: UploadMovePlan }) => {
				const files = args.files.filter((f) => !!f)
			if (files.length === 0) return

			const items: UploadFileItem[] = buildUploadItems(files)
			const totalBytes = items.reduce((sum, i) => sum + (i.file.size ?? 0), 0)
			const filePaths = items.map((item) => normalizeRelPath(item.relPath ?? item.file.name)).filter(Boolean)

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
				filePaths,
				resumeFileSize: items.length === 1 ? items[0]?.file?.size ?? 0 : undefined,
			}

			setUploadTasks((prev) => [task, ...prev])
			openTransfers('uploads')
		},
		[openTransfers],
	)

	const drawerProps = useTransfersDrawerProps({
		open: isOpen,
		onClose: closeTransfers,
		tab,
		onTabChange: (nextTab) => setTab(nextTab),
		downloadTasks,
		uploadTasks,
		onClearCompletedDownloads: clearCompletedDownloads,
		onClearCompletedUploads: clearCompletedUploads,
		onClearAll: clearAllTransfers,
		onCancelDownload: cancelDownloadTask,
		onRetryDownload: retryDownloadTask,
		onRemoveDownload: removeDownloadTask,
		onCancelUpload: cancelUploadTask,
		onRetryUpload: retryUploadTask,
		onRemoveUpload: removeUploadTask,
		onOpenJobs: () => navigate('/jobs'),
	})

	const ctx = useMemo<TransfersContextValue>(
		() => ({
			isOpen,
			tab,
			activeDownloadCount: drawerProps.activeDownloadCount,
			activeUploadCount: drawerProps.activeUploadCount,
			activeTransferCount: drawerProps.activeTransferCount,
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
			closeTransfers,
			downloadTasks,
			drawerProps.activeDownloadCount,
			drawerProps.activeTransferCount,
			drawerProps.activeUploadCount,
			isOpen,
			openTransfers,
			queueDownloadJobArtifact,
			queueDownloadObject,
			queueDownloadObjectsToDevice,
			queueUploadFiles,
			tab,
			uploadTasks,
		],
	)

	return (
		<TransfersProviderView ctx={ctx} drawerProps={drawerProps}>
			{props.children}
		</TransfersProviderView>
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

const maxUploadCommitItems = 200

type UploadCommitNormalizedItem = {
	path: string
	size: number
}

function deriveUploadRoot(paths: string[]): { rootKind?: 'file' | 'folder' | 'collection'; rootName?: string } {
	if (paths.length === 0) return {}
	if (paths.length === 1) {
		const parts = paths[0].split('/').filter(Boolean)
		if (parts.length === 1) return { rootKind: 'file', rootName: parts[0] }
		return { rootKind: 'folder', rootName: parts[0] }
	}
	const roots = Array.from(new Set(paths.map((p) => p.split('/')[0]).filter(Boolean)))
	if (roots.length === 1) {
		return { rootKind: 'folder', rootName: roots[0] }
	}
	return { rootKind: 'collection' }
}

function buildUploadCommitRequest(task: UploadTask, items: UploadFileItem[]): UploadCommitRequest | undefined {
	const normalizedItems: UploadCommitNormalizedItem[] = []
	for (const item of items) {
		const fileWithPath = item.file as File & { webkitRelativePath?: string; relativePath?: string }
		const rawPath = (item.relPath ?? fileWithPath.webkitRelativePath ?? fileWithPath.relativePath ?? item.file.name).trim()
		const path = normalizeUploadPath(rawPath)
		if (!path) continue
		const size = Number.isFinite(item.file.size) ? item.file.size : 0
		normalizedItems.push({ path, size })
	}
	if (normalizedItems.length === 0) return undefined

	const totalFiles = normalizedItems.length
	const totalBytes = normalizedItems.reduce((sum, item) => sum + item.size, 0)
	const root = deriveUploadRoot(normalizedItems.map((item) => item.path))
	const sample = normalizedItems.slice(0, maxUploadCommitItems).map((item) => ({ path: item.path, size: item.size }))
	const itemsTruncated = normalizedItems.length > maxUploadCommitItems

	const label = task.label?.trim()
	return {
		label: label || undefined,
		rootName: root.rootName,
		rootKind: root.rootKind,
		totalFiles,
		totalBytes,
		items: sample,
		itemsTruncated: itemsTruncated || undefined,
	}
}

// formatErr lives in ../lib/errors
