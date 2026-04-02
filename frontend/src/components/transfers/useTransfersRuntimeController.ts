import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
	APIClient,
	type UploadFileItem,
} from '../../api/client'
import { serverScopedStorageKey } from '../../lib/profileScopedStorage'
import { TransferEstimator } from '../../lib/transfer'
import { useLocalStorageState } from '../../lib/useLocalStorageState'
import type { DownloadTask, TransfersTab, UploadTask } from './transferTypes'
import type {
	TransfersContextValue,
	TransfersRuntimeNotifications,
	TransfersRuntimeSnapshot,
	UploadCapabilityByProfileId,
} from './transfersTypes'
import { useTransfersDownloadQueue } from './useTransfersDownloadQueue'
import { useTransfersUploadPreferences } from './useTransfersUploadPreferences'
import { useTransfersUploadRuntime } from './useTransfersUploadRuntime'
import { getActiveDownloadCount, getActiveUploadCount } from './transfersTaskSummary'
import { useTransfersPersistence } from './useTransfersPersistence'
import { useTransfersTaskActions } from './useTransfersTaskActions'
import { useTransfersUploadJobLifecycle } from './useTransfersUploadJobLifecycle'
import { revokeObjectURLSafe } from './uploadPreview'

type UseTransfersRuntimeControllerArgs = {
	apiToken: string
	uploadDirectStream?: boolean
	uploadCapabilityByProfileId?: UploadCapabilityByProfileId
	notifications: TransfersRuntimeNotifications
}

export type TransfersRuntimeUiState = {
	isOpen: boolean
	tab: TransfersTab
	downloadTasks: DownloadTask[]
	uploadTasks: UploadTask[]
}

export type TransfersRuntimeUiActions = {
	setTab: (tab: TransfersTab) => void
	closeTransfers: () => void
	clearCompletedDownloads: () => void
	clearCompletedUploads: () => void
	clearAllTransfers: () => void
	cancelDownloadTask: (taskId: string) => void
	retryDownloadTask: (taskId: string) => void
	removeDownloadTask: (taskId: string) => void
	cancelUploadTask: (taskId: string) => void
	retryUploadTask: (taskId: string) => void
	removeUploadTask: (taskId: string) => void
}

export type TransfersRuntimeController = {
	ctx: TransfersContextValue
	snapshot: TransfersRuntimeSnapshot
	uiState: TransfersRuntimeUiState
	uiActions: TransfersRuntimeUiActions
}

export function useTransfersRuntimeController(args: UseTransfersRuntimeControllerArgs): TransfersRuntimeController {
	const queryClient = useQueryClient()
	const api = useMemo(() => new APIClient({ apiToken: args.apiToken }), [args.apiToken])
	const transfersTabStorageKey = useMemo(() => serverScopedStorageKey('transfers', args.apiToken, 'tab'), [args.apiToken])

	const [isOpen, setIsOpen] = useState(false)
	const [tab, setTab] = useLocalStorageState<TransfersTab>(transfersTabStorageKey, 'downloads', {
		legacyLocalStorageKey: 'transfersTab',
	})

	const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([])
	const downloadAbortByTaskIdRef = useRef<Record<string, () => void>>({})
	const downloadEstimatorByTaskIdRef = useRef<Record<string, TransferEstimator>>({})

	const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([])
	const uploadTasksRef = useRef<UploadTask[]>([])
	const uploadAbortByTaskIdRef = useRef<Record<string, () => void>>({})
	const uploadEstimatorByTaskIdRef = useRef<Record<string, TransferEstimator>>({})
	const uploadItemsByTaskIdRef = useRef<Record<string, UploadFileItem[]>>({})
	const uploadPreviewUrlByTaskIdRef = useRef<Record<string, string>>({})

	const {
		downloadLinkProxyEnabled,
		downloadTaskConcurrency,
		uploadChunkFileConcurrency,
		uploadTaskConcurrency,
		uploadResumeConversionEnabled,
		pickUploadTuning,
	} = useTransfersUploadPreferences()

	useTransfersPersistence({
		downloadTasks,
		uploadTasks,
		setDownloadTasks,
		setUploadTasks,
	})

	useEffect(() => {
		uploadTasksRef.current = uploadTasks
	}, [uploadTasks])

	useEffect(() => {
		const nextPreviewUrls: Record<string, string> = {}
		for (const task of uploadTasks) {
			if (!task.preview?.url) continue
			nextPreviewUrls[task.id] = task.preview.url
		}
		for (const [taskId, url] of Object.entries(uploadPreviewUrlByTaskIdRef.current)) {
			if (nextPreviewUrls[taskId] === url) continue
			revokeObjectURLSafe(url)
		}
		uploadPreviewUrlByTaskIdRef.current = nextPreviewUrls
	}, [uploadTasks])

	useEffect(
		() => () => {
			for (const url of Object.values(uploadPreviewUrlByTaskIdRef.current)) {
				revokeObjectURLSafe(url)
			}
			uploadPreviewUrlByTaskIdRef.current = {}
		},
		[],
	)

	const openTransfers = useCallback((nextTab?: TransfersTab) => {
		if (nextTab) setTab(nextTab)
		setIsOpen(true)
	}, [setTab])

	const closeTransfers = useCallback(() => setIsOpen(false), [])

	const {
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
		clearAllTransfers,
	} = useTransfersTaskActions({
		setDownloadTasks,
		setUploadTasks,
		downloadAbortByTaskIdRef,
		downloadEstimatorByTaskIdRef,
		uploadAbortByTaskIdRef,
		uploadEstimatorByTaskIdRef,
		uploadItemsByTaskIdRef,
	})

	useEffect(
		() => () => {
			abortAllTransfers()
		},
		[abortAllTransfers],
	)

	const { handleUploadJobUpdate } = useTransfersUploadJobLifecycle({
		apiToken: args.apiToken,
		queryClient,
		uploadTasksRef,
		updateUploadTask,
	})

	const { queueDownloadObject, queueDownloadObjectsToDevice, queueDownloadJobArtifact } = useTransfersDownloadQueue({
		api,
		downloadLinkProxyEnabled,
		downloadConcurrency: downloadTaskConcurrency,
		downloadTasks,
		setDownloadTasks,
		downloadAbortByTaskIdRef,
		downloadEstimatorByTaskIdRef,
		updateDownloadTask,
		openTransfers,
	})

	const { retryUploadTask, queueUploadFiles } = useTransfersUploadRuntime({
		api,
		apiToken: args.apiToken,
		queryClient,
		notifications: args.notifications,
		uploadCapabilityByProfileId: args.uploadCapabilityByProfileId,
		uploadDirectStream: args.uploadDirectStream,
		uploadChunkFileConcurrency,
		uploadTaskConcurrency,
		uploadResumeConversionEnabled,
		pickUploadTuning,
		uploadTasks,
		setUploadTasks,
		updateUploadTask,
		handleUploadJobUpdate,
		uploadTasksRef,
		uploadAbortByTaskIdRef,
		uploadEstimatorByTaskIdRef,
		uploadItemsByTaskIdRef,
		uploadPreviewUrlByTaskIdRef,
		openTransfers,
	})

	const activeDownloadCount = useMemo(() => getActiveDownloadCount(downloadTasks), [downloadTasks])
	const activeUploadCount = useMemo(() => getActiveUploadCount(uploadTasks), [uploadTasks])
	const activeTransferCount = activeDownloadCount + activeUploadCount

	const snapshot = useMemo<TransfersRuntimeSnapshot>(
		() => ({
			isOpen,
			tab,
			activeDownloadCount,
			activeUploadCount,
			activeTransferCount,
			downloadTasks,
			uploadTasks,
		}),
		[activeDownloadCount, activeTransferCount, activeUploadCount, downloadTasks, isOpen, tab, uploadTasks],
	)

	const ctx = useMemo<TransfersContextValue>(
		() => ({
			...snapshot,
			openTransfers,
			closeTransfers,
			queueDownloadObject,
			queueDownloadObjectsToDevice,
			queueDownloadJobArtifact,
			queueUploadFiles,
		}),
		[closeTransfers, openTransfers, queueDownloadJobArtifact, queueDownloadObject, queueDownloadObjectsToDevice, queueUploadFiles, snapshot],
	)

	const uiState = useMemo<TransfersRuntimeUiState>(
		() => ({
			isOpen,
			tab,
			downloadTasks,
			uploadTasks,
		}),
		[downloadTasks, isOpen, tab, uploadTasks],
	)

	const uiActions = useMemo<TransfersRuntimeUiActions>(
		() => ({
			setTab,
			closeTransfers,
			clearCompletedDownloads,
			clearCompletedUploads,
			clearAllTransfers,
			cancelDownloadTask,
			retryDownloadTask,
			removeDownloadTask,
			cancelUploadTask,
			retryUploadTask,
			removeUploadTask,
		}),
		[
			cancelDownloadTask,
			cancelUploadTask,
			clearAllTransfers,
			clearCompletedDownloads,
			clearCompletedUploads,
			closeTransfers,
			removeDownloadTask,
			removeUploadTask,
			retryDownloadTask,
			retryUploadTask,
			setTab,
		],
	)

	return { ctx, snapshot, uiState, uiActions }
}
