import type { TransfersContextValue } from '../components/Transfers'

export const transfersStub: TransfersContextValue = {
	isOpen: false,
	tab: 'downloads',
	activeDownloadCount: 0,
	activeUploadCount: 0,
	activeTransferCount: 0,
	downloadTasks: [] as TransfersContextValue['downloadTasks'],
	uploadTasks: [] as TransfersContextValue['uploadTasks'],
	openTransfers: () => {},
	closeTransfers: () => {},
	queueDownloadObject: () => {},
	queueDownloadObjectsToDevice: () => {},
	queueDownloadJobArtifact: () => {},
	queueUploadFiles: () => {},
} as const
