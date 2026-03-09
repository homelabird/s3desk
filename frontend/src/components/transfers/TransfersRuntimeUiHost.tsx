import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { TransfersDrawerHost } from './TransfersDrawerHost'
import type { TransfersRuntimeUiActions, TransfersRuntimeUiState } from './useTransfersRuntimeController'
import { useTransfersDrawerProps } from './useTransfersDrawerProps'

type TransfersRuntimeUiHostProps = {
	uiState: TransfersRuntimeUiState
	uiActions: TransfersRuntimeUiActions
}

export function TransfersRuntimeUiHost({ uiState, uiActions }: TransfersRuntimeUiHostProps) {
	const navigate = useNavigate()
	const handleOpenJobs = useCallback(() => {
		navigate('/jobs')
	}, [navigate])

	const drawerProps = useTransfersDrawerProps({
		open: uiState.isOpen,
		onClose: uiActions.closeTransfers,
		tab: uiState.tab,
		onTabChange: uiActions.setTab,
		downloadTasks: uiState.downloadTasks,
		uploadTasks: uiState.uploadTasks,
		onClearCompletedDownloads: uiActions.clearCompletedDownloads,
		onClearCompletedUploads: uiActions.clearCompletedUploads,
		onClearAll: uiActions.clearAllTransfers,
		onCancelDownload: uiActions.cancelDownloadTask,
		onRetryDownload: uiActions.retryDownloadTask,
		onRemoveDownload: uiActions.removeDownloadTask,
		onCancelUpload: uiActions.cancelUploadTask,
		onRetryUpload: uiActions.retryUploadTask,
		onRemoveUpload: uiActions.removeUploadTask,
		onOpenJobs: handleOpenJobs,
	})

	return <TransfersDrawerHost {...drawerProps} />
}
