import { getThumbnailRequestConcurrency, readStoredObjectsCostMode } from './objectsCostMode'

import { RequestAbortedError } from '../api/client'

type TransferHandle<T> = {
	promise: Promise<T>
	abort: () => void
}

type PendingTask<T> = {
	started: boolean
	canceled: boolean
	abortCurrent: () => void
	start: () => TransferHandle<T>
	resolve: (value: T) => void
	reject: (reason?: unknown) => void
}

const pendingQueue: PendingTask<unknown>[] = []
let inFlight = 0
let concurrencyLimit = getThumbnailRequestConcurrency(readStoredObjectsCostMode())

function pumpThumbnailQueue() {
	while (inFlight < concurrencyLimit && pendingQueue.length > 0) {
		const task = pendingQueue.shift()
		if (!task || task.canceled) continue
		task.started = true
		inFlight += 1
		const handle = task.start()
		task.abortCurrent = handle.abort
		handle.promise.then(task.resolve, task.reject).finally(() => {
			inFlight = Math.max(0, inFlight - 1)
			pumpThumbnailQueue()
		})
	}
}

export function scheduleThumbnailRequest<T>(start: () => TransferHandle<T>): TransferHandle<T> {
	concurrencyLimit = getThumbnailRequestConcurrency(readStoredObjectsCostMode())
	let taskRef: PendingTask<T> | null = null

	const promise = new Promise<T>((resolve, reject) => {
		taskRef = {
			started: false,
			canceled: false,
			abortCurrent: () => {},
			start,
			resolve,
			reject,
		}
		pendingQueue.push(taskRef as PendingTask<unknown>)
		pumpThumbnailQueue()
	})

	return {
		promise,
		abort: () => {
			if (!taskRef) return
			if (taskRef.started) {
				taskRef.abortCurrent()
				return
			}
			taskRef.canceled = true
			taskRef.reject(new RequestAbortedError('thumbnail request aborted'))
		},
	}
}
