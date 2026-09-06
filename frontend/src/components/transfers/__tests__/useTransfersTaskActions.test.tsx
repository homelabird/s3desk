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

	it('clears finished transfers while preserving every active phase and its resources', () => {
		const downloadStatuses: DownloadTask['status'][] = ['queued', 'waiting', 'running', 'succeeded', 'failed', 'canceled']
		const uploadStatuses: UploadTask['status'][] = ['queued', 'staging', 'commit', 'waiting_job', 'succeeded', 'failed', 'canceled']
		const abort = vi.fn()
		const downloadAbortByTaskIdRef = { current: Object.fromEntries(downloadStatuses.map((status) => [status, abort])) }
		const downloadEstimatorByTaskIdRef = { current: Object.fromEntries(downloadStatuses.map((status) => [status, {}])) }
		const uploadAbortByTaskIdRef = { current: Object.fromEntries(uploadStatuses.map((status) => [status, abort])) }
		const uploadEstimatorByTaskIdRef = { current: Object.fromEntries(uploadStatuses.map((status) => [status, {}])) }
		const uploadItemsByTaskIdRef = { current: Object.fromEntries(uploadStatuses.map((status) => [status, {}])) }
		const { result } = renderHook(() => {
			const [downloadTasks, setDownloadTasks] = useState(downloadStatuses.map((status) => buildDownloadTask(status, status)))
			const [uploadTasks, setUploadTasks] = useState(uploadStatuses.map((status) => buildUploadTask(status, status)))
			const actions = useTransfersTaskActions({ setDownloadTasks, setUploadTasks, downloadAbortByTaskIdRef,
				downloadEstimatorByTaskIdRef, uploadAbortByTaskIdRef, uploadEstimatorByTaskIdRef, uploadItemsByTaskIdRef })
			return { downloadTasks, uploadTasks, ...actions }
		})
		act(() => {
			for (const status of ['queued', 'waiting', 'running']) result.current.removeDownloadTask(status)
			for (const status of ['queued', 'staging', 'commit', 'waiting_job']) result.current.removeUploadTask(status)
			result.current.clearFinishedTransfers()
		})
		expect(abort).not.toHaveBeenCalled()
		expect(result.current.downloadTasks.map((task) => task.status)).toEqual(['queued', 'waiting', 'running'])
		expect(result.current.uploadTasks.map((task) => task.status)).toEqual(['queued', 'staging', 'commit', 'waiting_job'])
		for (const ref of [downloadAbortByTaskIdRef, downloadEstimatorByTaskIdRef]) {
			expect(Object.keys(ref.current)).toEqual(['queued', 'waiting', 'running'])
		}
		for (const ref of [uploadAbortByTaskIdRef, uploadEstimatorByTaskIdRef, uploadItemsByTaskIdRef]) {
			expect(Object.keys(ref.current)).toEqual(['queued', 'staging', 'commit', 'waiting_job'])
		}
	})
})
