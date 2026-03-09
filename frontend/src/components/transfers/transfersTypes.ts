import type { DownloadTask, TransfersTab, UploadTask } from './transferTypes'

export type UploadMovePlan = {
	rootHandle: FileSystemDirectoryHandle
	relPaths: string[]
	label?: string
	cleanupEmptyDirs?: boolean
}

export type QueueDownloadObjectArgs = {
	profileId: string
	bucket: string
	key: string
	expectedBytes?: number
	label?: string
	filenameHint?: string
}

export type QueueDownloadObjectsToDeviceArgs = {
	profileId: string
	bucket: string
	items: { key: string; size?: number }[]
	targetDirHandle: FileSystemDirectoryHandle
	targetLabel?: string
	prefix?: string
}

export type QueueDownloadJobArtifactArgs = {
	profileId: string
	jobId: string
	label?: string
	filenameHint?: string
	waitForJob?: boolean
}

export type QueueUploadFilesArgs = {
	profileId: string
	bucket: string
	prefix: string
	files: File[]
	label?: string
	moveSource?: UploadMovePlan
}

export type TransfersContextValue = {
	isOpen: boolean
	tab: TransfersTab
	activeDownloadCount: number
	activeUploadCount: number
	activeTransferCount: number
	downloadTasks: DownloadTask[]
	uploadTasks: UploadTask[]
	openTransfers: (tab?: TransfersTab) => void
	closeTransfers: () => void
	queueDownloadObject: (args: QueueDownloadObjectArgs) => void
	queueDownloadObjectsToDevice: (args: QueueDownloadObjectsToDeviceArgs) => void
	queueDownloadJobArtifact: (args: QueueDownloadJobArtifactArgs) => void
	queueUploadFiles: (args: QueueUploadFilesArgs) => void
}

export type TransfersRuntimeApi = Pick<
	TransfersContextValue,
	'openTransfers' | 'closeTransfers' | 'queueDownloadObject' | 'queueDownloadObjectsToDevice' | 'queueDownloadJobArtifact' | 'queueUploadFiles'
>

export type TransfersRuntimeSnapshot = Pick<
	TransfersContextValue,
	'isOpen' | 'tab' | 'activeDownloadCount' | 'activeUploadCount' | 'activeTransferCount' | 'downloadTasks' | 'uploadTasks'
>

export type UploadCapabilityByProfileId = Record<string, { presignedUpload: boolean; directUpload: boolean }>

export type TransfersRuntimeNotifications = {
	info: (content: string) => void
	warning: (content: string) => void
	error: (content: string) => void
	uploadCommitted: (jobId?: string) => void
}
