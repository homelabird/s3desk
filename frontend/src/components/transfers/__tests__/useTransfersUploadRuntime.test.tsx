import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useEffect, useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { queryKeys } from '../../../api/queryKeys'
import type { UploadTask } from '../transferTypes'
import { useTransfersUploadRuntime } from '../useTransfersUploadRuntime'

const {
	buildQueuedUploadMock,
	createLocalVideoUploadPreviewMock,
	isVideoUploadFileMock,
	maybeReportNetworkErrorMock,
	randomIdMock,
	revokeObjectURLSafeMock,
	useTransfersUploadJobEventsMock,
	withJobQueueRetryMock,
} = vi.hoisted(() => ({
	buildQueuedUploadMock: vi.fn(),
	createLocalVideoUploadPreviewMock: vi.fn(),
	isVideoUploadFileMock: vi.fn(),
	maybeReportNetworkErrorMock: vi.fn(),
	randomIdMock: vi.fn(),
	revokeObjectURLSafeMock: vi.fn(),
	useTransfersUploadJobEventsMock: vi.fn(),
	withJobQueueRetryMock: vi.fn(),
}))

vi.mock('../../lib/jobQueue', () => ({
	withJobQueueRetry: (run: () => Promise<unknown>) => withJobQueueRetryMock(run),
}))

vi.mock('../transferDownloadUtils', async () => {
	const actual = await vi.importActual<typeof import('../transferDownloadUtils')>('../transferDownloadUtils')
	return {
		...actual,
		randomId: () => randomIdMock(),
		maybeReportNetworkError: (...args: unknown[]) => maybeReportNetworkErrorMock(...args),
	}
})

vi.mock('../transfersQueuedUpload', () => ({
	buildQueuedUpload: (...args: unknown[]) => buildQueuedUploadMock(...args),
}))

vi.mock('../uploadPreview', async () => {
	const actual = await vi.importActual<typeof import('../uploadPreview')>('../uploadPreview')
	return {
		...actual,
		createLocalVideoUploadPreview: (...args: unknown[]) => createLocalVideoUploadPreviewMock(...args),
		isVideoUploadFile: (...args: unknown[]) => isVideoUploadFileMock(...args),
		revokeObjectURLSafe: (...args: unknown[]) => revokeObjectURLSafeMock(...args),
	}
})

vi.mock('../useTransfersUploadJobEvents', () => ({
	useTransfersUploadJobEvents: (args: unknown) => useTransfersUploadJobEventsMock(args),
}))

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

function createUploadTask(overrides: Partial<UploadTask> = {}): UploadTask {
	return {
		id: 'upload-1',
		profileId: 'profile-1',
		bucket: 'bucket-a',
		prefix: 'docs/',
		fileCount: 1,
		status: 'queued',
		createdAtMs: 1,
		loadedBytes: 0,
		totalBytes: 128,
		speedBps: 0,
		etaSeconds: 0,
		label: 'Upload: clip.mp4',
		filePaths: ['clip.mp4'],
		resumeFileSize: 128,
		...overrides,
	}
}

function createUploadItem(name = 'clip.mp4', size = 128, type = 'video/mp4') {
	return {
		file: new File(['x'.repeat(size)], name, { type }),
		relPath: name,
	}
}

function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	})
}

describe('useTransfersUploadRuntime', () => {
	beforeEach(() => {
		buildQueuedUploadMock.mockReset()
		createLocalVideoUploadPreviewMock.mockReset()
		isVideoUploadFileMock.mockReset()
		maybeReportNetworkErrorMock.mockReset()
		randomIdMock.mockReset()
		revokeObjectURLSafeMock.mockReset()
		useTransfersUploadJobEventsMock.mockReset()
		withJobQueueRetryMock.mockImplementation(async (run) => await run())
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('reclaims generated preview URLs when the queued task disappears before preview generation completes', async () => {
		const previewRequest = deferred<{
			kind: 'video_frame'
			source: 'local'
			url: string
			label: string
			width: number
			height: number
		} | null>()
		const item = createUploadItem()
		const queuedTask = createUploadTask({ id: 'upload-preview' })

		randomIdMock.mockReturnValue('upload-preview')
		buildQueuedUploadMock.mockReturnValue({
			items: [item],
			task: queuedTask,
		})
		isVideoUploadFileMock.mockReturnValue(true)
		createLocalVideoUploadPreviewMock.mockReturnValue(previewRequest.promise)

		const openTransfers = vi.fn()
		const notifications = {
			error: vi.fn(),
			info: vi.fn(),
			warning: vi.fn(),
			uploadCommitted: vi.fn(),
		}
		const queryClient = createQueryClient()

		const { result } = renderHook(() => {
			const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([])
			const uploadTasksRef = useRef<UploadTask[]>([])
			const uploadAbortByTaskIdRef = useRef<Record<string, () => void>>({})
			const uploadEstimatorByTaskIdRef = useRef({})
			const uploadItemsByTaskIdRef = useRef<Record<string, ReturnType<typeof createUploadItem>[]>>({})
			const uploadPreviewUrlByTaskIdRef = useRef<Record<string, string>>({})

			useEffect(() => {
				uploadTasksRef.current = uploadTasks
			}, [uploadTasks])

			const updateUploadTask = (taskId: string, updater: (task: UploadTask) => UploadTask) => {
				setUploadTasks((prev) => prev.map((task) => (task.id === taskId ? updater(task) : task)))
			}

			return {
				uploadTasks,
				setUploadTasks,
				uploadItemsByTaskIdRef,
				uploadPreviewUrlByTaskIdRef,
				...useTransfersUploadRuntime({
					api: {
						uploads: {},
						jobs: {},
					} as never,
					apiToken: 'token-a',
					queryClient,
					notifications,
					uploadCapabilityByProfileId: {
						'profile-1': { presignedUpload: false, directUpload: false },
					},
					uploadDirectStream: false,
					uploadChunkFileConcurrency: 2,
					uploadTaskConcurrency: 0,
					uploadResumeConversionEnabled: false,
					pickUploadTuning: () => ({
						batchConcurrency: 4,
						batchBytes: 32 * 1024 * 1024,
						chunkSizeBytes: 64 * 1024 * 1024,
						chunkConcurrency: 4,
						chunkThresholdBytes: 128 * 1024 * 1024,
					}),
					uploadTasks,
					setUploadTasks,
					updateUploadTask,
					handleUploadJobUpdate: vi.fn(async () => {}),
					uploadTasksRef,
					uploadAbortByTaskIdRef,
					uploadEstimatorByTaskIdRef,
					uploadItemsByTaskIdRef,
					uploadPreviewUrlByTaskIdRef,
					openTransfers,
				}),
			}
		})

		act(() => {
			result.current.queueUploadFiles({
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'docs/',
				files: [item.file],
			})
		})

		await waitFor(() => expect(result.current.uploadTasks).toHaveLength(1))
		expect(openTransfers).toHaveBeenCalledWith('uploads')
		expect(result.current.uploadItemsByTaskIdRef.current['upload-preview']).toEqual([item])

		act(() => {
			result.current.setUploadTasks([])
		})

		await act(async () => {
			previewRequest.resolve({
				kind: 'video_frame',
				source: 'local',
				url: 'blob:stale-preview',
				label: 'docs/clip.mp4',
				width: 240,
				height: 135,
			})
			await Promise.resolve()
		})

		expect(revokeObjectURLSafeMock).toHaveBeenCalledWith('blob:stale-preview')
		expect(result.current.uploadPreviewUrlByTaskIdRef.current).toEqual({})
	})

	it('starts queued uploads, commits them, and invalidates scoped jobs queries', async () => {
		const invalidateQueries = vi.fn().mockResolvedValue(undefined)
		const commitUpload = vi.fn().mockResolvedValue({ jobId: 'job-1' })
		const createUpload = vi.fn().mockResolvedValue({ uploadId: 'upload-1', mode: 'staging', maxBytes: null })
		const uploadFilesWithProgress = vi.fn().mockReturnValue({
			abort: vi.fn(),
			promise: Promise.resolve({ skipped: 0 }),
		})
		const getJob = vi.fn().mockResolvedValue({ status: 'running', progress: null, error: null })
		const handleUploadJobUpdate = vi.fn().mockResolvedValue(undefined)
		const notifications = {
			error: vi.fn(),
			info: vi.fn(),
			warning: vi.fn(),
			uploadCommitted: vi.fn(),
		}
		const queryClient = createQueryClient()
		queryClient.invalidateQueries = invalidateQueries

		const item = createUploadItem('archive.zip', 256, 'application/zip')

		const { result } = renderHook(() => {
			const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([
				createUploadTask({
					id: 'upload-commit',
					label: 'Upload: archive.zip',
					totalBytes: item.file.size,
					filePaths: ['archive.zip'],
					resumeFileSize: item.file.size,
				}),
			])
			const uploadTasksRef = useRef<UploadTask[]>(uploadTasks)
			const uploadAbortByTaskIdRef = useRef<Record<string, () => void>>({})
			const uploadEstimatorByTaskIdRef = useRef({})
			const uploadItemsByTaskIdRef = useRef<Record<string, ReturnType<typeof createUploadItem>[]>>({
				'upload-commit': [item],
			})
			const uploadPreviewUrlByTaskIdRef = useRef<Record<string, string>>({})

			useEffect(() => {
				uploadTasksRef.current = uploadTasks
			}, [uploadTasks])

			const updateUploadTask = (taskId: string, updater: (task: UploadTask) => UploadTask) => {
				setUploadTasks((prev) => prev.map((task) => (task.id === taskId ? updater(task) : task)))
			}

			return {
				uploadTasks,
				uploadItemsByTaskIdRef,
				...useTransfersUploadRuntime({
					api: {
						uploads: {
							createUpload,
							uploadFilesWithProgress,
							commitUpload,
							deleteUpload: vi.fn().mockResolvedValue(undefined),
						},
						jobs: {
							getJob,
						},
					} as never,
					apiToken: 'token-a',
					queryClient,
					notifications,
					uploadCapabilityByProfileId: {
						'profile-1': { presignedUpload: false, directUpload: false },
					},
					uploadDirectStream: false,
					uploadChunkFileConcurrency: 2,
					uploadTaskConcurrency: 1,
					uploadResumeConversionEnabled: false,
					pickUploadTuning: () => ({
						batchConcurrency: 4,
						batchBytes: 32 * 1024 * 1024,
						chunkSizeBytes: 64 * 1024 * 1024,
						chunkConcurrency: 4,
						chunkThresholdBytes: 128 * 1024 * 1024,
					}),
					uploadTasks,
					setUploadTasks,
					updateUploadTask,
					handleUploadJobUpdate,
					uploadTasksRef,
					uploadAbortByTaskIdRef,
					uploadEstimatorByTaskIdRef,
					uploadItemsByTaskIdRef,
					uploadPreviewUrlByTaskIdRef,
					openTransfers: vi.fn(),
				}),
			}
		})

		await waitFor(() => expect(createUpload).toHaveBeenCalledWith('profile-1', {
			bucket: 'bucket-a',
			prefix: 'docs/',
			mode: 'staging',
		}))
		await waitFor(() => expect(uploadFilesWithProgress).toHaveBeenCalledTimes(1))
		await waitFor(() => expect(commitUpload).toHaveBeenCalledTimes(1))
		await waitFor(() => expect(handleUploadJobUpdate).toHaveBeenCalledWith('upload-commit', {
			status: 'running',
			progress: null,
			error: null,
		}))
		await waitFor(() =>
			expect(invalidateQueries).toHaveBeenCalledWith({
				queryKey: queryKeys.jobs.scope('profile-1', 'token-a'),
				exact: false,
			}),
		)

		expect(notifications.uploadCommitted).toHaveBeenCalledWith('job-1')
		expect(result.current.uploadTasks[0]).toMatchObject({
			id: 'upload-commit',
			status: 'waiting_job',
			jobId: 'job-1',
			uploadId: 'upload-1',
			uploadMode: 'staging',
		})
		expect(result.current.uploadItemsByTaskIdRef.current['upload-commit']).toBeUndefined()
	})
})
