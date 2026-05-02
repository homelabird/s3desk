import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { queryKeys } from '../../../api/queryKeys'
import type { UploadTask } from '../transferTypes'
import { commitUploadAndTrackJob } from '../uploadRuntimeCommit'

function uploadTask(overrides: Partial<UploadTask> = {}): UploadTask {
	return {
		id: 'upload-1',
		profileId: 'profile-1',
		bucket: 'bucket-a',
		prefix: 'docs/',
		fileCount: 1,
		status: 'commit',
		createdAtMs: 1,
		loadedBytes: 128,
		totalBytes: 128,
		speedBps: 0,
		etaSeconds: 0,
		label: 'Upload',
		...overrides,
	}
}

function uploadItem() {
	return {
		file: new File(['hello'], 'report.txt'),
		relPath: 'report.txt',
	}
}

describe('commitUploadAndTrackJob', () => {
	it('commits upload, moves task to job waiting state, schedules job refresh, and invalidates jobs', async () => {
		const item = uploadItem()
		const task = uploadTask()
		const commitUpload = vi.fn().mockResolvedValue({ jobId: 'job-1' })
		const getJob = vi.fn().mockResolvedValue({ status: 'running', progress: null, error: null })
		const invalidateQueries = vi.fn().mockResolvedValue(undefined)
		const queryClient = new QueryClient()
		queryClient.invalidateQueries = invalidateQueries
		const notifications = {
			error: vi.fn(),
			info: vi.fn(),
			warning: vi.fn(),
			uploadCommitted: vi.fn(),
		}
		const uploadItemsByTaskIdRef = {
			current: {
				'upload-1': [item],
			},
		}
		const updateUploadTask = vi.fn()
		const handleUploadJobUpdate = vi.fn().mockResolvedValue(undefined)
		const onCommitted = vi.fn()

		await commitUploadAndTrackJob({
			api: {
				uploads: { commitUpload },
				jobs: { getJob },
			} as never,
			apiToken: 'token-a',
			queryClient,
			notifications,
			taskId: 'upload-1',
			task,
			uploadId: 'session-1',
			items: [item],
			uploadItemsByTaskIdRef,
			updateUploadTask,
			handleUploadJobUpdate,
			onCommitted,
		})
		await Promise.resolve()

		expect(commitUpload).toHaveBeenCalledWith('profile-1', 'session-1', {
			label: 'Upload',
			rootKind: 'file',
			rootName: 'report.txt',
			totalFiles: 1,
			totalBytes: item.file.size,
			items: [{ path: 'report.txt', size: item.file.size }],
		})
		expect(onCommitted).toHaveBeenCalledTimes(1)
		expect(uploadItemsByTaskIdRef.current['upload-1']).toBeUndefined()
		expect(updateUploadTask).toHaveBeenCalledWith('upload-1', expect.any(Function))
		const nextTask = updateUploadTask.mock.calls[0][1](task)
		expect(nextTask).toMatchObject({
			status: 'waiting_job',
			jobId: 'job-1',
			loadedBytes: 0,
			speedBps: 0,
			etaSeconds: 0,
		})
		expect(getJob).toHaveBeenCalledWith('profile-1', 'job-1')
		expect(handleUploadJobUpdate).toHaveBeenCalledWith('upload-1', {
			status: 'running',
			progress: null,
			error: null,
		})
		expect(notifications.uploadCommitted).toHaveBeenCalledWith('job-1')
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.jobs.scope('profile-1', 'token-a'),
			exact: false,
		})
	})
})
