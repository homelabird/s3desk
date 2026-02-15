import { useMemo } from 'react'

import type { DownloadTask, TransfersTab, UploadTask } from './transferTypes'
import type { TransfersDrawerProps } from './TransfersDrawer'

type UseTransfersDrawerPropsParams = {
	open: boolean
	onClose: () => void
	tab: TransfersTab
	onTabChange: (tab: TransfersTab) => void
	downloadTasks: DownloadTask[]
	uploadTasks: UploadTask[]
	onClearCompletedDownloads: () => void
	onClearCompletedUploads: () => void
	onClearAll: () => void
	onCancelDownload: (taskId: string) => void
	onRetryDownload: (taskId: string) => void
	onRemoveDownload: (taskId: string) => void
	onCancelUpload: (taskId: string) => void
	onRetryUpload: (taskId: string) => void
	onRemoveUpload: (taskId: string) => void
	onOpenJobs: () => void
}

export function useTransfersDrawerProps(params: UseTransfersDrawerPropsParams): TransfersDrawerProps {
	const {
		open,
		onClose,
		tab,
		onTabChange,
		downloadTasks,
		uploadTasks,
		onClearCompletedDownloads,
		onClearCompletedUploads,
		onClearAll,
		onCancelDownload,
		onRetryDownload,
		onRemoveDownload,
		onCancelUpload,
		onRetryUpload,
		onRemoveUpload,
		onOpenJobs,
	} = params

	const activeDownloadCount = useMemo(
		() => downloadTasks.filter((t) => t.status === 'queued' || t.status === 'waiting' || t.status === 'running').length,
		[downloadTasks],
	)
	const hasCompletedDownloads = useMemo(() => downloadTasks.some((t) => t.status === 'succeeded'), [downloadTasks])
	const activeUploadCount = useMemo(
		() =>
			uploadTasks.filter(
				(t) => t.status === 'queued' || t.status === 'staging' || t.status === 'commit' || t.status === 'waiting_job' || t.status === 'cleanup',
			).length,
		[uploadTasks],
	)
	const hasCompletedUploads = useMemo(() => uploadTasks.some((t) => t.status === 'succeeded'), [uploadTasks])
	const activeTransferCount = useMemo(() => activeDownloadCount + activeUploadCount, [activeDownloadCount, activeUploadCount])

	const downloadSummaryText = useMemo(() => summarizeDownloadTasks(downloadTasks), [downloadTasks])
	const uploadSummaryText = useMemo(() => summarizeUploadTasks(uploadTasks), [uploadTasks])

	return useMemo(
		() => ({
			open,
			onClose,
			tab,
			onTabChange,
			activeDownloadCount,
			activeUploadCount,
			activeTransferCount,
			downloadTasks,
			uploadTasks,
			downloadSummaryText,
			uploadSummaryText,
			hasCompletedDownloads,
			hasCompletedUploads,
			onClearCompletedDownloads,
			onClearCompletedUploads,
			onClearAll,
			onCancelDownload,
			onRetryDownload,
			onRemoveDownload,
			onCancelUpload,
			onRetryUpload,
			onRemoveUpload,
			onOpenJobs,
		}),
		[
			activeDownloadCount,
			activeTransferCount,
			activeUploadCount,
			downloadTasks,
			downloadSummaryText,
			hasCompletedDownloads,
			hasCompletedUploads,
			onCancelDownload,
			onCancelUpload,
			onClearAll,
			onClearCompletedDownloads,
			onClearCompletedUploads,
			onClose,
			onOpenJobs,
			onRemoveDownload,
			onRemoveUpload,
			onRetryDownload,
			onRetryUpload,
			onTabChange,
			open,
			tab,
			uploadTasks,
			uploadSummaryText,
		],
	)
}

function summarizeDownloadTasks(tasks: DownloadTask[]): string {
	if (tasks.length === 0) return ''
	const counts = {
		queued: 0,
		waiting: 0,
		running: 0,
		succeeded: 0,
		failed: 0,
		canceled: 0,
	}
	for (const t of tasks) {
		switch (t.status) {
			case 'queued':
				counts.queued++
				break
			case 'waiting':
				counts.waiting++
				break
			case 'running':
				counts.running++
				break
			case 'succeeded':
				counts.succeeded++
				break
			case 'failed':
				counts.failed++
				break
			case 'canceled':
				counts.canceled++
				break
		}
	}
	const parts: string[] = [`Total ${tasks.length}`]
	if (counts.queued) parts.push(`Queued ${counts.queued}`)
	if (counts.waiting) parts.push(`Waiting ${counts.waiting}`)
	if (counts.running) parts.push(`Running ${counts.running}`)
	if (counts.succeeded) parts.push(`Done ${counts.succeeded}`)
	if (counts.failed) parts.push(`Failed ${counts.failed}`)
	if (counts.canceled) parts.push(`Canceled ${counts.canceled}`)
	return parts.join(' · ')
}

function summarizeUploadTasks(tasks: UploadTask[]): string {
	if (tasks.length === 0) return ''
	const counts = {
		queued: 0,
		staging: 0,
		commit: 0,
		waitingJob: 0,
		cleanup: 0,
		succeeded: 0,
		failed: 0,
		canceled: 0,
	}
	for (const t of tasks) {
		switch (t.status) {
			case 'queued':
				counts.queued++
				break
			case 'staging':
				counts.staging++
				break
			case 'commit':
				counts.commit++
				break
			case 'waiting_job':
				counts.waitingJob++
				break
			case 'cleanup':
				counts.cleanup++
				break
			case 'succeeded':
				counts.succeeded++
				break
			case 'failed':
				counts.failed++
				break
			case 'canceled':
				counts.canceled++
				break
		}
	}
	const parts: string[] = [`Total ${tasks.length}`]
	if (counts.queued) parts.push(`Queued ${counts.queued}`)
	if (counts.staging) parts.push(`Uploading ${counts.staging}`)
	if (counts.commit) parts.push(`Committing ${counts.commit}`)
	if (counts.waitingJob) parts.push(`Transferring ${counts.waitingJob}`)
	if (counts.cleanup) parts.push(`Cleaning ${counts.cleanup}`)
	if (counts.succeeded) parts.push(`Done ${counts.succeeded}`)
	if (counts.failed) parts.push(`Failed ${counts.failed}`)
	if (counts.canceled) parts.push(`Canceled ${counts.canceled}`)
	return parts.join(' · ')
}
