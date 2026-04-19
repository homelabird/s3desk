import { useEffect, useRef } from 'react'

import type { APIClient } from '../../api/client'
import { JobsCreateModals } from './JobsCreateModals'
import { JobsDetailsDrawer } from './JobsDetailsDrawer'
import { JobsLogsDrawer } from './JobsLogsDrawer'
import type { BucketOption, DeleteJobModalPrefill } from './jobsPageTypes'
import { useJobsLogsState } from './useJobsLogsState'
import { useJobsUploadDetails } from './useJobsUploadDetails'

export type JobsOverlaysHostCreateFlow = {
	createOpen: boolean
	createDownloadOpen: boolean
	createDeleteOpen: boolean
	onCloseCreate: () => void
	onCloseDownload: () => void
	onCloseDelete: () => void
	onSubmitCreate: (values: {
		bucket: string
		prefix: string
		files: File[]
		label?: string
	}) => void
	onSubmitDownload: (values: { bucket: string; prefix: string; dirHandle: FileSystemDirectoryHandle; label?: string }) => void
	onSubmitDelete: (values: {
		bucket: string
		prefix: string
		deleteAll: boolean
		allowUnsafePrefix: boolean
		include: string[]
		exclude: string[]
		dryRun: boolean
	}) => void
	uploadLoading: boolean
	downloadLoading: boolean
	deleteLoading: boolean
	uploadSupported: boolean
	uploadUnsupportedReason: string | null
	bucketLookupErrorDescription?: string | null
}

export type JobsOverlaysHostBucketState = {
	bucket: string
	onBucketChange: (next: string) => void
	bucketOptions: BucketOption[]
	deleteBucket: string
	deletePrefill: DeleteJobModalPrefill | null
}

export type JobsOverlaysHostDetailsState = {
	detailsOpen: boolean
	detailsJobId: string | null
	onCloseDetails: () => void
	onDeleteJob: (jobId: string) => Promise<void>
	deleteJobLoading: boolean
	onOpenLogs: (jobId: string) => void
}

export type JobsOverlaysHostLogsState = {
	logClearRequestJobIds: string[]
	logClearRequestNonce: number
	logRequestJobId: string | null
	logRequestNonce: number
	onCloseLogs: () => void
}

export type JobsOverlaysHostLayout = {
	drawerWidth: number | string
	logSearchInputWidth: number | string
	borderColor: string
	backgroundColor: string
	borderRadius: number
}

export type JobsOverlaysHostProps = {
	api: APIClient
	apiToken: string
	profileId: string
	isOffline: boolean
	createFlow: JobsOverlaysHostCreateFlow
	bucketState: JobsOverlaysHostBucketState
	detailsState: JobsOverlaysHostDetailsState
	logsState: JobsOverlaysHostLogsState
	layout: JobsOverlaysHostLayout
}

export function JobsOverlaysHost(props: JobsOverlaysHostProps) {
	const {
		api,
		apiToken,
		profileId,
		isOffline,
		createFlow,
		bucketState,
		detailsState,
		logsState,
		layout,
	} = props
	const {
		createOpen,
		createDownloadOpen,
		createDeleteOpen,
		onCloseCreate,
		onCloseDownload,
		onCloseDelete,
		onSubmitCreate,
		onSubmitDownload,
		onSubmitDelete,
		uploadLoading,
		downloadLoading,
		deleteLoading,
		uploadSupported,
		uploadUnsupportedReason,
		bucketLookupErrorDescription,
	} = createFlow
	const { bucket, onBucketChange, bucketOptions, deleteBucket, deletePrefill } = bucketState
	const { detailsOpen, detailsJobId, onCloseDetails, onDeleteJob, deleteJobLoading, onOpenLogs } = detailsState
	const { logClearRequestJobIds, logClearRequestNonce, logRequestJobId, logRequestNonce, onCloseLogs } = logsState
	const { drawerWidth, logSearchInputWidth, borderColor, backgroundColor, borderRadius } = layout

	const {
		logsOpen,
		activeLogJobId,
		logSearchQuery,
		setLogSearchQuery,
		followLogs,
		setFollowLogs,
		logsContainerRef,
		logPollFailures,
		logPollPaused,
		resumeLogPolling,
		activeLogLines,
		normalizedLogSearchQuery,
		visibleLogEntries,
		visibleLogText,
		copyVisibleLogs,
		openLogsForJob,
		closeLogs,
		refreshActiveLogs,
		isLogsLoading,
		clearLogsForJobs,
	} = useJobsLogsState({
		api,
		apiToken,
		profileId,
	})
	const handledLogRequestNonceRef = useRef<number>(-1)
	const handledLogClearNonceRef = useRef<number>(-1)

	const {
		jobDetailsQuery,
		uploadDetails,
		uploadRootLabel,
		uploadTablePageItems,
		uploadTableDataLength,
		uploadTablePageSize,
		uploadTablePageSafe,
		uploadTableTotalPages,
		goToPrevUploadTablePage,
		goToNextUploadTablePage,
		uploadHashesLoading,
		uploadHashFailures,
	} = useJobsUploadDetails({
		api,
		profileId,
		apiToken,
		detailsJobId,
		detailsOpen,
	})

	useEffect(() => {
		if (!logRequestJobId) return
		if (handledLogRequestNonceRef.current === logRequestNonce) return
		handledLogRequestNonceRef.current = logRequestNonce
		openLogsForJob(logRequestJobId)
	}, [logRequestJobId, logRequestNonce, openLogsForJob])

	useEffect(() => {
		if (logRequestJobId || !logsOpen) return
		handledLogRequestNonceRef.current = -1
		closeLogs()
	}, [closeLogs, logRequestJobId, logsOpen])

	useEffect(() => {
		if (handledLogClearNonceRef.current === logClearRequestNonce) return
		handledLogClearNonceRef.current = logClearRequestNonce
		if (logClearRequestJobIds.length === 0) return
		clearLogsForJobs(logClearRequestJobIds)
	}, [clearLogsForJobs, logClearRequestJobIds, logClearRequestNonce])

	const handleCloseLogs = () => {
		closeLogs()
		onCloseLogs()
	}

	return (
		<>
			<JobsCreateModals
				apiToken={apiToken}
				profileId={profileId}
				createOpen={createOpen}
				createDownloadOpen={createDownloadOpen}
				createDeleteOpen={createDeleteOpen}
				onCloseCreate={onCloseCreate}
				onCloseDownload={onCloseDownload}
				onCloseDelete={onCloseDelete}
				onSubmitCreate={onSubmitCreate}
				onSubmitDownload={onSubmitDownload}
				onSubmitDelete={onSubmitDelete}
				uploadLoading={uploadLoading}
				downloadLoading={downloadLoading}
				deleteLoading={deleteLoading}
				isOffline={isOffline}
				uploadSupported={uploadSupported}
				uploadUnsupportedReason={uploadUnsupportedReason}
				bucketLookupErrorDescription={bucketLookupErrorDescription}
				bucket={bucket}
				onBucketChange={onBucketChange}
				bucketOptions={bucketOptions}
				deleteBucket={deleteBucket}
				deletePrefill={deletePrefill}
			/>

			{detailsOpen ? (
				<JobsDetailsDrawer
					open={detailsOpen}
					onClose={onCloseDetails}
					drawerWidth={drawerWidth}
					isOffline={isOffline}
					detailsJobId={detailsJobId}
					job={jobDetailsQuery.data}
					isFetching={jobDetailsQuery.isFetching}
					isError={jobDetailsQuery.isError}
					error={jobDetailsQuery.error}
					onRefresh={() => {
						void jobDetailsQuery.refetch()
					}}
					onDeleteJob={onDeleteJob}
					deleteLoading={deleteJobLoading}
					onOpenLogs={(jobId) => {
						onCloseDetails()
						onOpenLogs(jobId)
					}}
					uploadDetails={uploadDetails}
					uploadRootLabel={uploadRootLabel}
					uploadTablePageItems={uploadTablePageItems}
					uploadTableDataLength={uploadTableDataLength}
					uploadTablePageSize={uploadTablePageSize}
					uploadTablePageSafe={uploadTablePageSafe}
					uploadTableTotalPages={uploadTableTotalPages}
					onUploadTablePrevPage={goToPrevUploadTablePage}
					onUploadTableNextPage={goToNextUploadTablePage}
					uploadHashesLoading={uploadHashesLoading}
					uploadHashFailures={uploadHashFailures}
					borderColor={borderColor}
					backgroundColor={backgroundColor}
					borderRadius={borderRadius}
				/>
			) : null}

			{logsOpen ? (
				<JobsLogsDrawer
					open={logsOpen}
					onClose={handleCloseLogs}
					drawerWidth={drawerWidth}
					activeLogJobId={activeLogJobId}
					isLogsLoading={isLogsLoading}
					onRefresh={refreshActiveLogs}
					followLogs={followLogs}
					onFollowLogsChange={setFollowLogs}
					logPollPaused={logPollPaused}
					logPollFailures={logPollFailures}
					onResumeLogPolling={resumeLogPolling}
					logSearchQuery={logSearchQuery}
					onLogSearchQueryChange={setLogSearchQuery}
					onCopyVisibleLogs={copyVisibleLogs}
					normalizedLogSearchQuery={normalizedLogSearchQuery}
					visibleLogEntries={visibleLogEntries}
					activeLogLines={activeLogLines}
					onLogsContainerRef={(element) => {
						logsContainerRef.current = element
					}}
					visibleLogText={visibleLogText}
					searchInputWidth={logSearchInputWidth}
				/>
			) : null}
		</>
	)
}
