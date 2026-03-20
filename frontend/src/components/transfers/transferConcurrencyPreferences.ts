export const UPLOAD_TASK_CONCURRENCY_STORAGE_KEY = 'uploadTaskConcurrency'
export const DOWNLOAD_TASK_CONCURRENCY_STORAGE_KEY = 'downloadTaskConcurrency'

export const DEFAULT_UPLOAD_TASK_CONCURRENCY = 2
export const MIN_UPLOAD_TASK_CONCURRENCY = 1
export const MAX_UPLOAD_TASK_CONCURRENCY = 4

export const DEFAULT_DOWNLOAD_TASK_CONCURRENCY = 3
export const MIN_DOWNLOAD_TASK_CONCURRENCY = 1
export const MAX_DOWNLOAD_TASK_CONCURRENCY = 8

function clampTransferConcurrency(value: number, fallback: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return fallback
	return Math.min(max, Math.max(min, Math.trunc(value)))
}

export function sanitizeUploadTaskConcurrency(value: number): number {
	return clampTransferConcurrency(
		value,
		DEFAULT_UPLOAD_TASK_CONCURRENCY,
		MIN_UPLOAD_TASK_CONCURRENCY,
		MAX_UPLOAD_TASK_CONCURRENCY,
	)
}

export function sanitizeDownloadTaskConcurrency(value: number): number {
	return clampTransferConcurrency(
		value,
		DEFAULT_DOWNLOAD_TASK_CONCURRENCY,
		MIN_DOWNLOAD_TASK_CONCURRENCY,
		MAX_DOWNLOAD_TASK_CONCURRENCY,
	)
}
