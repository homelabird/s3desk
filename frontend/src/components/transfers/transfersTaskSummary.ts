import type { DownloadTask, UploadTask } from './transferTypes'

export function getActiveDownloadCount(downloadTasks: DownloadTask[]): number {
	return downloadTasks.filter((task) => task.status === 'queued' || task.status === 'waiting' || task.status === 'running').length
}

export function getActiveUploadCount(uploadTasks: UploadTask[]): number {
	return uploadTasks.filter(
		(task) =>
			task.status === 'queued' ||
			task.status === 'staging' ||
			task.status === 'commit' ||
			task.status === 'waiting_job',
	).length
}
