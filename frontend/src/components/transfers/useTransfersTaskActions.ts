import { useCallback } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import type { DownloadTask, UploadTask } from './transferTypes'

type UseTransfersTaskActionsParams = {
	setDownloadTasks: Dispatch<SetStateAction<DownloadTask[]>>
	setUploadTasks: Dispatch<SetStateAction<UploadTask[]>>
	downloadAbortByTaskIdRef: MutableRefObject<Record<string, () => void>>
	downloadEstimatorByTaskIdRef: MutableRefObject<Record<string, unknown>>
	uploadAbortByTaskIdRef: MutableRefObject<Record<string, () => void>>
	uploadEstimatorByTaskIdRef: MutableRefObject<Record<string, unknown>>
	uploadItemsByTaskIdRef: MutableRefObject<Record<string, unknown>>
	uploadMoveByTaskIdRef: MutableRefObject<Record<string, unknown>>
}

export function useTransfersTaskActions({
	setDownloadTasks,
	setUploadTasks,
	downloadAbortByTaskIdRef,
	downloadEstimatorByTaskIdRef,
	uploadAbortByTaskIdRef,
	uploadEstimatorByTaskIdRef,
	uploadItemsByTaskIdRef,
	uploadMoveByTaskIdRef,
}: UseTransfersTaskActionsParams) {
	const updateDownloadTask = useCallback((taskId: string, updater: (task: DownloadTask) => DownloadTask) => {
		setDownloadTasks((prev) => prev.map((t) => (t.id === taskId ? updater(t) : t)))
	}, [setDownloadTasks])

	const cancelDownloadTask = useCallback(
		(taskId: string) => {
			const abort = downloadAbortByTaskIdRef.current[taskId]
			if (abort) abort()
			updateDownloadTask(taskId, (t) => ({ ...t, status: 'canceled', finishedAtMs: Date.now() }))
		},
		[downloadAbortByTaskIdRef, updateDownloadTask],
	)

	const retryDownloadTask = useCallback(
		(taskId: string) => {
			updateDownloadTask(taskId, (t) => ({
				...t,
				status: 'queued',
				startedAtMs: undefined,
				finishedAtMs: undefined,
				loadedBytes: 0,
				speedBps: 0,
				etaSeconds: 0,
				error: undefined,
			}))
		},
		[updateDownloadTask],
	)

	const removeDownloadTask = useCallback(
		(taskId: string) => {
			const abort = downloadAbortByTaskIdRef.current[taskId]
			if (abort) abort()
			delete downloadAbortByTaskIdRef.current[taskId]
			delete downloadEstimatorByTaskIdRef.current[taskId]
			setDownloadTasks((prev) => prev.filter((t) => t.id !== taskId))
		},
		[downloadAbortByTaskIdRef, downloadEstimatorByTaskIdRef, setDownloadTasks],
	)

	const clearCompletedDownloads = useCallback(() => {
		setDownloadTasks((prev) => prev.filter((t) => t.status !== 'succeeded'))
	}, [setDownloadTasks])

	const updateUploadTask = useCallback((taskId: string, updater: (task: UploadTask) => UploadTask) => {
		setUploadTasks((prev) => prev.map((t) => (t.id === taskId ? updater(t) : t)))
	}, [setUploadTasks])

	const cancelUploadTask = useCallback(
		(taskId: string) => {
			const abort = uploadAbortByTaskIdRef.current[taskId]
			if (abort) abort()
			updateUploadTask(taskId, (t) => {
				if (t.status === 'succeeded') return t
				return { ...t, status: 'canceled', finishedAtMs: Date.now() }
			})
		},
		[updateUploadTask, uploadAbortByTaskIdRef],
	)

	const removeUploadTask = useCallback(
		(taskId: string) => {
			const abort = uploadAbortByTaskIdRef.current[taskId]
			if (abort) abort()
			delete uploadAbortByTaskIdRef.current[taskId]
			delete uploadEstimatorByTaskIdRef.current[taskId]
			delete uploadItemsByTaskIdRef.current[taskId]
			delete uploadMoveByTaskIdRef.current[taskId]
			setUploadTasks((prev) => prev.filter((t) => t.id !== taskId))
		},
		[
			setUploadTasks,
			uploadAbortByTaskIdRef,
			uploadEstimatorByTaskIdRef,
			uploadItemsByTaskIdRef,
			uploadMoveByTaskIdRef,
		],
	)

	const clearCompletedUploads = useCallback(() => {
		setUploadTasks((prev) => {
			for (const t of prev) {
				if (t.status !== 'succeeded') continue
				delete uploadAbortByTaskIdRef.current[t.id]
				delete uploadEstimatorByTaskIdRef.current[t.id]
				delete uploadItemsByTaskIdRef.current[t.id]
				delete uploadMoveByTaskIdRef.current[t.id]
			}
			return prev.filter((t) => t.status !== 'succeeded')
		})
	}, [setUploadTasks, uploadAbortByTaskIdRef, uploadEstimatorByTaskIdRef, uploadItemsByTaskIdRef, uploadMoveByTaskIdRef])

	const clearAllTransfers = useCallback(() => {
		for (const abort of Object.values(downloadAbortByTaskIdRef.current)) abort()
		for (const abort of Object.values(uploadAbortByTaskIdRef.current)) abort()
		downloadAbortByTaskIdRef.current = {}
		downloadEstimatorByTaskIdRef.current = {}
		uploadAbortByTaskIdRef.current = {}
		uploadEstimatorByTaskIdRef.current = {}
		uploadItemsByTaskIdRef.current = {}
		uploadMoveByTaskIdRef.current = {}
		setDownloadTasks([])
		setUploadTasks([])
	}, [
		downloadAbortByTaskIdRef,
		downloadEstimatorByTaskIdRef,
		setDownloadTasks,
		setUploadTasks,
		uploadAbortByTaskIdRef,
		uploadEstimatorByTaskIdRef,
		uploadItemsByTaskIdRef,
		uploadMoveByTaskIdRef,
	])

	return {
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
	}
}
