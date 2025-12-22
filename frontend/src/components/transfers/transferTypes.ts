export type TransfersTab = 'downloads' | 'uploads'

export type DownloadTaskStatus = 'queued' | 'waiting' | 'running' | 'succeeded' | 'failed' | 'canceled'
export type UploadTaskStatus = 'queued' | 'staging' | 'commit' | 'succeeded' | 'failed' | 'canceled'

export type DownloadTaskBase = {
	id: string
	profileId: string
	label: string
	status: DownloadTaskStatus
	createdAtMs: number
	startedAtMs?: number
	finishedAtMs?: number
	loadedBytes: number
	totalBytes?: number
	speedBps: number
	etaSeconds: number
	error?: string
	filenameHint?: string
}

export type ObjectDownloadTask = DownloadTaskBase & {
	kind: 'object'
	bucket: string
	key: string
}

export type JobArtifactDownloadTask = DownloadTaskBase & {
	kind: 'job_artifact'
	jobId: string
}

export type DownloadTask = ObjectDownloadTask | JobArtifactDownloadTask

export type UploadTask = {
	id: string
	profileId: string
	bucket: string
	prefix: string
	fileCount: number
	status: UploadTaskStatus
	createdAtMs: number
	startedAtMs?: number
	finishedAtMs?: number
	loadedBytes: number
	totalBytes: number
	speedBps: number
	etaSeconds: number
	jobId?: string
	error?: string
	label: string
}
