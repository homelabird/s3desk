import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RequestAbortedError, type UploadFileItem } from '../../../api/client'
import type { TransferEstimator } from '../../../lib/transfer'
import type { UploadTask } from '../transferTypes'
import { runUploadTask } from '../uploadRuntimeTask'

type UpdateUploadTaskMock = {
	mock: {
		calls: Array<[string, (task: UploadTask) => UploadTask]>
	}
} & ((taskId: string, updater: (task: UploadTask) => UploadTask) => void)

const {
	commitUploadAndTrackJobMock,
	createUploadSessionWithFallbackMock,
	executeUploadAttemptMock,
	maybeReportNetworkErrorMock,
	resolveExistingResumeChunksMock,
	runUploadAttemptWithNetworkFallbackMock,
} = vi.hoisted(() => ({
	commitUploadAndTrackJobMock: vi.fn(),
	createUploadSessionWithFallbackMock: vi.fn(),
	executeUploadAttemptMock: vi.fn(),
	maybeReportNetworkErrorMock: vi.fn(),
	resolveExistingResumeChunksMock: vi.fn(),
	runUploadAttemptWithNetworkFallbackMock: vi.fn(),
}))

vi.mock('../uploadRuntimeSession', async () => {
	const actual = await vi.importActual<typeof import('../uploadRuntimeSession')>('../uploadRuntimeSession')
	return {
		...actual,
		createUploadSessionWithFallback: (...args: unknown[]) => createUploadSessionWithFallbackMock(...args),
	}
})

vi.mock('../uploadRuntimeAttempt', () => ({
	executeUploadAttempt: (...args: unknown[]) => executeUploadAttemptMock(...args),
}))

vi.mock('../uploadRuntimeFallback', () => ({
	runUploadAttemptWithNetworkFallback: (...args: unknown[]) => runUploadAttemptWithNetworkFallbackMock(...args),
}))

vi.mock('../uploadRuntimeResume', () => ({
	resolveExistingResumeChunks: (...args: unknown[]) => resolveExistingResumeChunksMock(...args),
}))

vi.mock('../uploadRuntimeCommit', () => ({
	commitUploadAndTrackJob: (...args: unknown[]) => commitUploadAndTrackJobMock(...args),
}))

vi.mock('../transferDownloadUtils', async () => {
	const actual = await vi.importActual<typeof import('../transferDownloadUtils')>('../transferDownloadUtils')
	return {
		...actual,
		maybeReportNetworkError: (...args: unknown[]) => maybeReportNetworkErrorMock(...args),
	}
})

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

function createUploadItem(name = 'clip.mp4', size = 128): UploadFileItem {
	return {
		file: new File(['x'.repeat(size)], name),
		relPath: name,
	}
}

function createRunArgs(overrides: Partial<Parameters<typeof runUploadTask>[0]> = {}) {
	const task = overrides.task ?? createUploadTask()
	const items = overrides.items ?? [createUploadItem()]
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	})
	const deleteUpload = vi.fn().mockResolvedValue(undefined)

	return {
		api: {
			uploads: { deleteUpload },
		} as never,
		apiToken: 'token-a',
		queryClient,
		notifications: {
			error: vi.fn(),
			info: vi.fn(),
			warning: vi.fn(),
			uploadCommitted: vi.fn(),
		},
		taskId: task.id,
		task,
		items,
		uploadCapabilityByProfileId: {
			[task.profileId]: { presignedUpload: false, directUpload: false },
		},
		uploadDirectStream: false,
		uploadChunkFileConcurrency: 2,
		uploadResumeConversionEnabled: false,
		pickUploadTuning: vi.fn(() => ({
			batchConcurrency: 3,
			batchBytes: 1024,
			chunkSizeBytes: 64,
			chunkConcurrency: 2,
			chunkThresholdBytes: 128,
		})),
		uploadAbortByTaskIdRef: { current: { [task.id]: vi.fn() } },
		uploadEstimatorByTaskIdRef: { current: {} as Record<string, TransferEstimator> },
		uploadItemsByTaskIdRef: { current: { [task.id]: items } },
		updateUploadTask: vi.fn(),
		handleUploadJobUpdate: vi.fn(async () => {}),
		...overrides,
	}
}

describe('runUploadTask', () => {
	beforeEach(() => {
		commitUploadAndTrackJobMock.mockReset()
		createUploadSessionWithFallbackMock.mockReset()
		executeUploadAttemptMock.mockReset()
		maybeReportNetworkErrorMock.mockReset()
		resolveExistingResumeChunksMock.mockReset()
		runUploadAttemptWithNetworkFallbackMock.mockReset()

		createUploadSessionWithFallbackMock.mockResolvedValue({
			uploadId: 'session-1',
			mode: 'staging',
			maxBytes: null,
		})
		runUploadAttemptWithNetworkFallbackMock.mockImplementation(async (args) => {
			return args.runUploadAttempt(args.sessionMode, args.uploadId)
		})
		executeUploadAttemptMock.mockResolvedValue({ skipped: 0 })
		resolveExistingResumeChunksMock.mockResolvedValue({ ok: true, available: false })
		commitUploadAndTrackJobMock.mockImplementation(async (args) => {
			args.onCommitted()
		})
	})

	it('runs session, attempt, skipped warning, and commit orchestration', async () => {
		executeUploadAttemptMock.mockResolvedValue({ skipped: 2 })
		const args = createRunArgs()

		await runUploadTask(args)

		const updateUploadTaskMock = args.updateUploadTask as UpdateUploadTaskMock
		expect(args.updateUploadTask).toHaveBeenCalledWith(args.task.id, expect.any(Function))
		expect(updateUploadTaskMock.mock.calls[0][1](args.task)).toMatchObject({
			status: 'staging',
			loadedBytes: 0,
			error: undefined,
			uploadFallbackFrom: undefined,
		})
		expect(createUploadSessionWithFallbackMock).toHaveBeenCalledWith(expect.objectContaining({
			task: args.task,
			preferredMode: 'staging',
			fallbackMode: 'staging',
			canUsePresigned: false,
		}))
		expect(runUploadAttemptWithNetworkFallbackMock).toHaveBeenCalledWith(expect.objectContaining({
			uploadId: 'session-1',
			sessionMode: 'staging',
			fallbackMode: 'staging',
			task: args.task,
		}))
		expect(executeUploadAttemptMock).toHaveBeenCalledWith(expect.objectContaining({
			taskId: args.task.id,
			task: args.task,
			uploadId: 'session-1',
			mode: 'staging',
			items: args.items,
			resumeChunkSizeBytes: 0,
			allowPerFileChunkSize: false,
		}))
		expect(args.notifications.warning).toHaveBeenCalledWith('Skipped 2 file(s) with invalid paths.')
		expect(commitUploadAndTrackJobMock).toHaveBeenCalledWith(expect.objectContaining({
			taskId: args.task.id,
			task: args.task,
			uploadId: 'session-1',
			items: args.items,
		}))
		expect(args.api.uploads.deleteUpload).not.toHaveBeenCalled()
		expect(args.uploadAbortByTaskIdRef.current[args.task.id]).toBeUndefined()
		expect(args.uploadEstimatorByTaskIdRef.current[args.task.id]).toBeUndefined()
	})

	it('stops before session creation when resume chunk settings are invalid', async () => {
		const items = [createUploadItem('a.bin', 10), createUploadItem('b.bin', 10)]
		const args = createRunArgs({
			task: createUploadTask({
				totalBytes: 20,
				resumeFiles: [
					{ path: 'a.bin', size: 10, chunkSizeBytes: 4 },
					{ path: 'b.bin', size: 10, chunkSizeBytes: 8 },
				],
			}),
			items,
		})

		await runUploadTask(args)

		expect(args.notifications.error).toHaveBeenCalledWith(
			'Resume requires consistent chunk size across files. Enable conversion mode or re-add files.',
		)
		expect(createUploadSessionWithFallbackMock).not.toHaveBeenCalled()
		expect(executeUploadAttemptMock).not.toHaveBeenCalled()
		expect(commitUploadAndTrackJobMock).not.toHaveBeenCalled()
		expect(args.uploadEstimatorByTaskIdRef.current[args.task.id]).toBeUndefined()
	})

	it('reuses existing resumable chunks without creating a new upload session', async () => {
		const task = createUploadTask({
			uploadId: 'resume-session-1',
			resumeFiles: [{ path: 'clip.mp4', size: 128, chunkSizeBytes: 32 }],
			resumeFileSize: undefined,
			resumeChunkSizeBytes: undefined,
		})
		const existingChunksByPath = { 'clip.mp4': [0, 2] }
		resolveExistingResumeChunksMock.mockResolvedValue({
			ok: true,
			available: true,
			uploadId: 'resume-session-1',
			existingChunksByPath,
		})
		const args = createRunArgs({ task })

		await runUploadTask(args)

		expect(resolveExistingResumeChunksMock).toHaveBeenCalledWith(expect.objectContaining({
			api: args.api,
			profileId: 'profile-1',
			uploadId: 'resume-session-1',
			items: args.items,
		}))
		expect(createUploadSessionWithFallbackMock).not.toHaveBeenCalled()
		expect(runUploadAttemptWithNetworkFallbackMock).toHaveBeenCalledWith(expect.objectContaining({
			uploadId: 'resume-session-1',
			sessionMode: 'staging',
		}))
		expect(executeUploadAttemptMock).toHaveBeenCalledWith(expect.objectContaining({
			uploadId: 'resume-session-1',
			existingChunksByPath,
			resumeChunkSizeBytes: 32,
			allowPerFileChunkSize: false,
		}))
		expect(commitUploadAndTrackJobMock).toHaveBeenCalledWith(expect.objectContaining({
			uploadId: 'resume-session-1',
		}))
		expect(args.api.uploads.deleteUpload).not.toHaveBeenCalled()
	})

	it('stops before session creation when resumable chunk lookup fails validation', async () => {
		const task = createUploadTask({
			uploadId: 'resume-session-1',
			resumeFiles: [{ path: 'clip.mp4', size: 128, chunkSizeBytes: 32 }],
		})
		resolveExistingResumeChunksMock.mockResolvedValue({
			ok: false,
			error: 'Selected file size does not match the previous upload.',
		})
		const args = createRunArgs({ task })

		await runUploadTask(args)

		expect(args.notifications.error).toHaveBeenCalledWith('Selected file size does not match the previous upload.')
		expect(createUploadSessionWithFallbackMock).not.toHaveBeenCalled()
		expect(executeUploadAttemptMock).not.toHaveBeenCalled()
		expect(commitUploadAndTrackJobMock).not.toHaveBeenCalled()
		expect(args.api.uploads.deleteUpload).not.toHaveBeenCalled()
		expect(args.uploadEstimatorByTaskIdRef.current[args.task.id]).toBeUndefined()
	})

	it('records provider unsupported fallback state before continuing with fallback session mode', async () => {
		createUploadSessionWithFallbackMock.mockImplementation(async (sessionArgs) => {
			sessionArgs.onFallback({ from: 'presigned', to: 'direct', reason: 'provider_unsupported' })
			return { uploadId: 'direct-session-1', mode: 'direct', maxBytes: null }
		})
		const args = createRunArgs({
			uploadCapabilityByProfileId: {
				'profile-1': { presignedUpload: true, directUpload: true },
			},
			uploadDirectStream: true,
		})

		await runUploadTask(args)

		const updateUploadTaskMock = args.updateUploadTask as UpdateUploadTaskMock
		const fallbackUpdate = updateUploadTaskMock.mock.calls
			.map(([, updater]) => updater(args.task))
			.find((next) => next.uploadFallbackFrom === 'presigned')
		expect(createUploadSessionWithFallbackMock).toHaveBeenCalledWith(expect.objectContaining({
			preferredMode: 'presigned',
			fallbackMode: 'direct',
			canUsePresigned: true,
		}))
		expect(fallbackUpdate).toMatchObject({
			uploadFallbackFrom: 'presigned',
			uploadFallbackReason: 'provider_unsupported',
		})
		expect(args.notifications.info).toHaveBeenCalledWith('Presigned uploads are not supported here. Falling back to direct uploads.')
		expect(executeUploadAttemptMock).toHaveBeenCalledWith(expect.objectContaining({
			uploadId: 'direct-session-1',
			mode: 'direct',
		}))
	})

	it('marks session maxBytes violations as failed and deletes the unfinished session', async () => {
		createUploadSessionWithFallbackMock.mockResolvedValue({
			uploadId: 'limited-session-1',
			mode: 'staging',
			maxBytes: 64,
		})
		const args = createRunArgs()

		await runUploadTask(args)

		const updateUploadTaskMock = args.updateUploadTask as UpdateUploadTaskMock
		const failedUpdate = updateUploadTaskMock.mock.calls
			.map(([, updater]) => updater(args.task))
			.find((next) => next.status === 'failed')
		expect(executeUploadAttemptMock).not.toHaveBeenCalled()
		expect(commitUploadAndTrackJobMock).not.toHaveBeenCalled()
		expect(failedUpdate).toMatchObject({
			status: 'failed',
			error: 'selected files exceed maxBytes (128 > 64)',
		})
		expect(maybeReportNetworkErrorMock).toHaveBeenCalledWith(expect.any(Error))
		expect(args.notifications.error).toHaveBeenCalledWith('selected files exceed maxBytes (128 > 64)')
		expect(args.api.uploads.deleteUpload).toHaveBeenCalledWith('profile-1', 'limited-session-1')
		expect(args.uploadEstimatorByTaskIdRef.current[args.task.id]).toBeUndefined()
	})

	it('marks aborted attempts as canceled and reclaims unfinished sessions', async () => {
		executeUploadAttemptMock.mockRejectedValue(new RequestAbortedError())
		const args = createRunArgs()

		await runUploadTask(args)

		const updateUploadTaskMock = args.updateUploadTask as UpdateUploadTaskMock
		const canceledUpdate = updateUploadTaskMock.mock.calls
			.map(([, updater]) => updater(args.task))
			.find((task) => task.status === 'canceled')
		expect(canceledUpdate).toMatchObject({ status: 'canceled' })
		expect(args.notifications.info).toHaveBeenCalledWith('Upload canceled')
		expect(args.notifications.error).not.toHaveBeenCalled()
		expect(maybeReportNetworkErrorMock).not.toHaveBeenCalled()
		expect(args.api.uploads.deleteUpload).toHaveBeenCalledWith('profile-1', 'session-1')
		expect(args.uploadAbortByTaskIdRef.current[args.task.id]).toBeUndefined()
		expect(args.uploadEstimatorByTaskIdRef.current[args.task.id]).toBeUndefined()
	})
})
