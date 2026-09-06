import { useCallback } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import { isTransferFinished, type DownloadTask, type UploadTask } from './transferTypes'

type UseTransfersTaskActionsParams = {
	setDownloadTasks: Dispatch<SetStateAction<DownloadTask[]>>
	setUploadTasks: Dispatch<SetStateAction<UploadTask[]>>
	downloadAbortByTaskIdRef: MutableRefObject<Record<string, () => void>>
	downloadEstimatorByTaskIdRef: MutableRefObject<Record<string, unknown>>
	uploadAbortByTaskIdRef: MutableRefObject<Record<string, () => void>>
	uploadEstimatorByTaskIdRef: MutableRefObject<Record<string, unknown>>
	uploadItemsByTaskIdRef: MutableRefObject<Record<string, unknown>>
}

export function useTransfersTaskActions({
	setDownloadTasks,
	setUploadTasks,
	downloadAbortByTaskIdRef,
	downloadEstimatorByTaskIdRef,
	uploadAbortByTaskIdRef,
	uploadEstimatorByTaskIdRef,
	uploadItemsByTaskIdRef,
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
			setDownloadTasks((prev) => {
				if (!prev.some((task) => task.id === taskId && isTransferFinished(task.status))) return prev
				downloadAbortByTaskIdRef.current[taskId]?.()
				delete downloadAbortByTaskIdRef.current[taskId]
				delete downloadEstimatorByTaskIdRef.current[taskId]
				return prev.filter((task) => task.id !== taskId)
			})
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
			setUploadTasks((prev) => {
				if (!prev.some((task) => task.id === taskId && isTransferFinished(task.status))) return prev
				uploadAbortByTaskIdRef.current[taskId]?.()
				delete uploadAbortByTaskIdRef.current[taskId]
				delete uploadEstimatorByTaskIdRef.current[taskId]
				delete uploadItemsByTaskIdRef.current[taskId]
				return prev.filter((task) => task.id !== taskId)
			})
		},
		[uploadAbortByTaskIdRef, uploadEstimatorByTaskIdRef, uploadItemsByTaskIdRef, setUploadTasks],
	)

	const clearCompletedUploads = useCallback(() => {
		setUploadTasks((prev) => {
			for (const t of prev) {
				if (t.status !== 'succeeded') continue
				delete uploadAbortByTaskIdRef.current[t.id]
				delete uploadEstimatorByTaskIdRef.current[t.id]
				delete uploadItemsByTaskIdRef.current[t.id]
			}
			return prev.filter((t) => t.status !== 'succeeded')
		})
	}, [setUploadTasks, uploadAbortByTaskIdRef, uploadEstimatorByTaskIdRef, uploadItemsByTaskIdRef])

	const abortAllTransfers = useCallback(() => {
		for (const abort of Object.values(downloadAbortByTaskIdRef.current)) abort()
		for (const abort of Object.values(uploadAbortByTaskIdRef.current)) abort()
		downloadAbortByTaskIdRef.current = {}
		downloadEstimatorByTaskIdRef.current = {}
		uploadAbortByTaskIdRef.current = {}
		uploadEstimatorByTaskIdRef.current = {}
		uploadItemsByTaskIdRef.current = {}
	}, [
		downloadAbortByTaskIdRef,
		downloadEstimatorByTaskIdRef,
		uploadAbortByTaskIdRef,
		uploadEstimatorByTaskIdRef,
		uploadItemsByTaskIdRef,
	])

	const clearFinishedTransfers = useCallback(() => {
		setDownloadTasks((prev) => {
			for (const task of prev) {
				if (!isTransferFinished(task.status)) continue
				delete downloadAbortByTaskIdRef.current[task.id]
				delete downloadEstimatorByTaskIdRef.current[task.id]
			}
			return prev.filter((task) => !isTransferFinished(task.status))
		})
		setUploadTasks((prev) => {
			for (const task of prev) {
				if (!isTransferFinished(task.status)) continue
				delete uploadAbortByTaskIdRef.current[task.id]
				delete uploadEstimatorByTaskIdRef.current[task.id]
				delete uploadItemsByTaskIdRef.current[task.id]
			}
			return prev.filter((task) => !isTransferFinished(task.status))
		})
	}, [downloadAbortByTaskIdRef, downloadEstimatorByTaskIdRef, setDownloadTasks, setUploadTasks,
		uploadAbortByTaskIdRef, uploadEstimatorByTaskIdRef, uploadItemsByTaskIdRef])

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
		abortAllTransfers,
		clearFinishedTransfers,
	}
}
