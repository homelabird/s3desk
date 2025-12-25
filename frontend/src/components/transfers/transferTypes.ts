export type TransfersTab = 'downloads' | 'uploads'

export type DownloadTaskStatus = 'queued' | 'waiting' | 'running' | 'succeeded' | 'failed' | 'canceled'
export type UploadTaskStatus = 'queued' | 'staging' | 'commit' | 'waiting_job' | 'cleanup' | 'succeeded' | 'failed' | 'canceled'

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

export type ObjectDeviceDownloadTask = DownloadTaskBase & {
	kind: 'object_device'
	bucket: string
	key: string
	targetDirHandle: FileSystemDirectoryHandle
	targetPath: string
	targetLabel?: string
}

export type JobArtifactDownloadTask = DownloadTaskBase & {
	kind: 'job_artifact'
	jobId: string
}

export type DownloadTask = ObjectDownloadTask | ObjectDeviceDownloadTask | JobArtifactDownloadTask

export type UploadTask = {
	id: string
	profileId: string
	bucket: string
	prefix: string
	fileCount: number
	status: UploadTaskStatus
	moveAfterUpload?: boolean
	moveSourceLabel?: string
	cleanupFailed?: boolean
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
