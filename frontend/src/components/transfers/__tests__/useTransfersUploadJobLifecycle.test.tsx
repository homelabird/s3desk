import { act, renderHook } from '@testing-library/react'
import type { QueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UploadTask } from '../transferTypes'
import { useTransfersUploadJobLifecycle } from '../useTransfersUploadJobLifecycle'

function buildUploadTask(): UploadTask {
	return {
		id: 'upload-1',
		profileId: 'profile-1',
		bucket: 'bucket-a',
		prefix: 'folder/',
		fileCount: 1,
		status: 'waiting_job',
		createdAtMs: 1,
		loadedBytes: 10,
		totalBytes: 100,
		speedBps: 50,
		etaSeconds: 2,
		jobId: 'job-1',
		label: 'Upload: alpha.txt',
	}
}

describe('useTransfersUploadJobLifecycle', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('invalidates objects queries and publishes a refresh event when an upload job succeeds', async () => {
		const invalidateQueries = vi.fn().mockResolvedValue(undefined)
		const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

		const { result } = renderHook(() => {
			const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([buildUploadTask()])
			const uploadTasksRef = useRef(uploadTasks)
			uploadTasksRef.current = uploadTasks

			const updateUploadTask = (taskId: string, updater: (task: UploadTask) => UploadTask) => {
				setUploadTasks((prev) => prev.map((task) => (task.id === taskId ? updater(task) : task)))
			}

			const lifecycle = useTransfersUploadJobLifecycle({
				queryClient: { invalidateQueries } as unknown as QueryClient,
				uploadTasksRef,
				updateUploadTask,
			})

			return {
				uploadTasks,
				...lifecycle,
			}
		})

		await act(async () => {
			await result.current.handleUploadJobUpdate('upload-1', {
				status: 'succeeded',
				progress: {
					bytesDone: 100,
					bytesTotal: 100,
					speedBps: 0,
					etaSeconds: 0,
				},
			})
		})

		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['objects', 'profile-1', 'bucket-a'] })
		expect(result.current.uploadTasks[0]).toMatchObject({
			status: 'succeeded',
			loadedBytes: 100,
			speedBps: 0,
			etaSeconds: 0,
		})
		expect(dispatchSpy).toHaveBeenCalledTimes(1)

		const refreshEvent = dispatchSpy.mock.calls[0]?.[0]
		expect(refreshEvent).toBeInstanceOf(CustomEvent)
		expect((refreshEvent as CustomEvent).type).toBe('s3desk:objects-refresh')
		expect((refreshEvent as CustomEvent<{ profileId: string; bucket: string; prefix: string; source: string }>).detail).toEqual({
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'folder/',
			source: 'upload',
		})
	})
})
