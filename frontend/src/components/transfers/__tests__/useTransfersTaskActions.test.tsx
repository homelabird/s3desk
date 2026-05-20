import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { DownloadTask, UploadTask } from '../transferTypes'
import { useTransfersTaskActions } from '../useTransfersTaskActions'

function buildDownloadTask(id: string, status: DownloadTask['status']): DownloadTask {
	return {
		id,
		profileId: 'profile-1',
		kind: 'object',
		label: `download-${id}`,
		status,
		createdAtMs: 1,
		loadedBytes: status === 'succeeded' ? 100 : 10,
		totalBytes: 100,
		speedBps: 0,
		etaSeconds: 0,
		bucket: 'bucket-a',
		key: `file-${id}`,
	}
}

function buildUploadTask(id: string, status: UploadTask['status']): UploadTask {
	return {
		id,
		profileId: 'profile-1',
		bucket: 'bucket-a',
		prefix: 'folder/',
		fileCount: 1,
		status,
		createdAtMs: 1,
		loadedBytes: status === 'succeeded' ? 100 : 10,
		totalBytes: 100,
		speedBps: 0,
		etaSeconds: 0,
		label: `upload-${id}`,
	}
}

describe('useTransfersTaskActions', () => {
	it('updates download tasks and handles cancel/retry/clear', () => {
		const downloadAbort = vi.fn()
		const downloadAbortByTaskIdRef = { current: { d1: downloadAbort } }
		const downloadEstimatorByTaskIdRef = { current: { d1: {} } }
		const uploadAbortByTaskIdRef = { current: {} }
		const uploadEstimatorByTaskIdRef = { current: {} }
		const uploadItemsByTaskIdRef = { current: {} }

		const { result } = renderHook(() => {
			const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([
				buildDownloadTask('d1', 'running'),
				buildDownloadTask('d2', 'succeeded'),
			])
			const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([])
			const actions = useTransfersTaskActions({
				setDownloadTasks,
				setUploadTasks,
				downloadAbortByTaskIdRef,
				downloadEstimatorByTaskIdRef,
				uploadAbortByTaskIdRef,
				uploadEstimatorByTaskIdRef,
				uploadItemsByTaskIdRef,
			})
			return { downloadTasks, uploadTasks, ...actions }
		})

		act(() => {
			result.current.cancelDownloadTask('d1')
		})
		expect(downloadAbort).toHaveBeenCalledTimes(1)
		expect(result.current.downloadTasks.find((t) => t.id === 'd1')?.status).toBe('canceled')

		act(() => {
			result.current.retryDownloadTask('d1')
		})
		const retried = result.current.downloadTasks.find((t) => t.id === 'd1')
		expect(retried?.status).toBe('queued')
		expect(retried?.loadedBytes).toBe(0)

		act(() => {
			result.current.clearCompletedDownloads()
		})
		expect(result.current.downloadTasks.some((t) => t.status === 'succeeded')).toBe(false)
	})

	it('removes upload task and clears refs', () => {
		const uploadAbort = vi.fn()
		const downloadAbortByTaskIdRef = { current: {} }
		const downloadEstimatorByTaskIdRef = { current: {} }
		const uploadAbortByTaskIdRef = { current: { u1: uploadAbort } }
		const uploadEstimatorByTaskIdRef = { current: { u1: {} } }
		const uploadItemsByTaskIdRef = { current: { u1: {} } }

		const { result } = renderHook(() => {
			const [, setDownloadTasks] = useState<DownloadTask[]>([])
			const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([
				buildUploadTask('u1', 'failed'),
				buildUploadTask('u2', 'succeeded'),
			])
			const actions = useTransfersTaskActions({
				setDownloadTasks,
				setUploadTasks,
				downloadAbortByTaskIdRef,
				downloadEstimatorByTaskIdRef,
				uploadAbortByTaskIdRef,
				uploadEstimatorByTaskIdRef,
				uploadItemsByTaskIdRef,
			})
			return { uploadTasks, ...actions }
		})

		act(() => {
			result.current.removeUploadTask('u1')
		})

		expect(uploadAbort).toHaveBeenCalledTimes(1)
		expect(result.current.uploadTasks.some((t) => t.id === 'u1')).toBe(false)
		expect(uploadAbortByTaskIdRef.current['u1']).toBeUndefined()
		expect(uploadEstimatorByTaskIdRef.current['u1']).toBeUndefined()
		expect(uploadItemsByTaskIdRef.current['u1']).toBeUndefined()
	})

	it('clears all transfers without aborting or removing uploads that are committing', () => {
		const downloadAbort = vi.fn()
		const uploadAbort = vi.fn()
		const commitAbort = vi.fn()
		const downloadAbortByTaskIdRef = { current: { d1: downloadAbort } }
		const downloadEstimatorByTaskIdRef = { current: { d1: {} } }
		const uploadAbortByTaskIdRef = { current: { u1: uploadAbort, u2: commitAbort } }
		const uploadEstimatorByTaskIdRef = { current: { u1: {}, u2: {} } }
		const uploadItemsByTaskIdRef = { current: { u1: {}, u2: {} } }

		const { result } = renderHook(() => {
			const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([buildDownloadTask('d1', 'running')])
			const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([
				buildUploadTask('u1', 'queued'),
				buildUploadTask('u2', 'commit'),
			])
			const actions = useTransfersTaskActions({
				setDownloadTasks,
				setUploadTasks,
				downloadAbortByTaskIdRef,
				downloadEstimatorByTaskIdRef,
				uploadAbortByTaskIdRef,
				uploadEstimatorByTaskIdRef,
				uploadItemsByTaskIdRef,
			})
			return { downloadTasks, uploadTasks, ...actions }
		})

		act(() => {
			result.current.clearAllTransfers()
		})

		expect(downloadAbort).toHaveBeenCalledTimes(1)
		expect(uploadAbort).toHaveBeenCalledTimes(1)
		expect(commitAbort).not.toHaveBeenCalled()
		expect(result.current.downloadTasks).toEqual([])
		expect(result.current.uploadTasks.map((task) => task.id)).toEqual(['u2'])
		expect(uploadAbortByTaskIdRef.current['u1']).toBeUndefined()
		expect(uploadAbortByTaskIdRef.current['u2']).toBe(commitAbort)
		expect(uploadEstimatorByTaskIdRef.current['u2']).toBeDefined()
		expect(uploadItemsByTaskIdRef.current['u2']).toBeDefined()
	})
})
