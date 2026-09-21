import type { PendingUploadCommit } from './uploadCommitRecovery'
export type TransfersTab = 'downloads' | 'uploads'

export type DownloadTaskStatus = 'queued' | 'waiting' | 'running' | 'ready' | 'handed_off' | 'succeeded' | 'failed' | 'canceled'
export type UploadTaskStatus = 'queued' | 'staging' | 'commit' | 'waiting_job' | 'succeeded' | 'failed' | 'canceled'

export function isTransferFinished(status: DownloadTaskStatus | UploadTaskStatus): boolean {
	return status === 'handed_off' || status === 'succeeded' || status === 'failed' || status === 'canceled'
}

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
	/** In-memory only; never serialize signed bearer URLs. */
	nativeDownloadUrl?: string
	nativeDownloadExpiresAtMs?: number
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

export type UploadTaskPreview = {
	kind: 'video_frame'
	source: 'local'
	url: string
	label: string
	width: number
	height: number
}

export type UploadPreparation = {
	phase: 'fingerprinting' | 'verifying'
	fileName: string
	fileIndex: number
	fileCount: number
	loadedBytes: number
	totalBytes: number
}

export type UploadTask = {
	pendingCommit?: PendingUploadCommit
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
	filePaths?: string[]
	uploadId?: string
	uploadMode?: 'staging' | 'direct' | 'presigned'
	uploadFallbackFrom?: 'direct' | 'presigned'
	uploadFallbackReason?: 'provider_unsupported' | 'network_path_failed'
	retryFileHandleState?: 'remembered' | 'selection_required'
	resumeChunkSizeBytes?: number
	resumeFileSize?: number
	resumeFiles?: Array<{ path: string; size: number; chunkSizeBytes: number; fingerprint?: string }>
	preview?: UploadTaskPreview
	/** Local read progress, not uploaded bytes; never restored as live progress. */
	preparation?: UploadPreparation
}
