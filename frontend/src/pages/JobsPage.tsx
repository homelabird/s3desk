import { Space } from 'antd'
import { Suspense } from 'react'

import { SetupCallout } from '../components/SetupCallout'
import { JobsOverlaysHost } from './jobs/jobsLazy'
import { JobsTableSection } from './jobs/JobsTableSection'
import { JobsToolbar } from './jobs/JobsToolbar'
import { useJobsPageController } from './jobs/useJobsPageController'
import styles from './JobsPage.module.css'

type Props = {
	apiToken: string
	profileId: string | null
}

export function JobsPage(props: Props) {
	const controller = useJobsPageController(props)

	if (!props.profileId) {
		return <SetupCallout apiToken={props.apiToken} profileId={props.profileId} message="Select a profile to view jobs" />
	}

	return (
		<Space orientation="vertical" size="large" className={styles.pageStack}>
			<JobsToolbar
				activeProfileName={controller.selectedProfile?.name ?? null}
				isOffline={controller.isOffline}
				uploadSupported={controller.uploadSupported}
				uploadDisabledReason={controller.uploadDisabledReason}
				eventsConnected={controller.eventsConnected}
				eventsTransport={controller.eventsTransport}
				eventsRetryCount={controller.eventsRetryCount}
				eventsRetryThreshold={controller.eventsRetryThreshold}
				onRetryRealtime={controller.onRetryRealtime}
				onOpenCreateUpload={controller.onOpenCreateUpload}
				onOpenCreateDownload={controller.onOpenCreateDownload}
				topActionsMenu={controller.topActionsMenu}
				statusFilter={controller.filters.statusFilter}
				onStatusFilterChange={controller.filters.setStatusFilter}
				searchFilterNormalized={controller.filters.searchFilterNormalized}
				onSearchFilterChange={controller.filters.setSearchFilter}
				typeFilterNormalized={controller.filters.typeFilterNormalized}
				onTypeFilterChange={controller.filters.setTypeFilter}
				typeFilterSuggestions={controller.typeFilterSuggestions}
				errorCodeFilterNormalized={controller.filters.errorCodeFilterNormalized}
				onErrorCodeFilterChange={controller.filters.setErrorCodeFilter}
				errorCodeSuggestions={controller.errorCodeSuggestions}
				filtersDirty={controller.filters.filtersDirty}
				onResetFilters={controller.filters.resetFilters}
				jobsStatusSummary={controller.jobsStatusSummary}
				columnOptions={controller.columnOptions}
				mergedColumnVisibility={controller.mergedColumnVisibility}
				onSetColumnVisible={controller.onSetColumnVisible}
				columnsDirty={controller.columnsDirty}
				onResetColumns={controller.onResetColumns}
				onRefreshJobs={controller.onRefreshJobs}
				jobsRefreshing={controller.jobsRefreshing}
				jobsCount={controller.jobsCount}
			/>

			<JobsTableSection
				bucketsError={controller.bucketsError}
				jobsError={controller.jobsError}
				sortedJobs={controller.sortedJobs}
				columns={controller.columns}
				isCompact={controller.isCompact}
				tableScrollY={controller.tableScrollY}
				isLoading={controller.isLoading}
				isOffline={controller.isOffline}
				uploadSupported={controller.uploadSupported}
				onOpenCreateUpload={controller.onOpenCreateUpload}
				onOpenDownloadJob={controller.onOpenCreateDownload}
				onOpenDeleteJob={controller.onOpenDeleteJob}
				getJobSummary={controller.getJobSummary}
				renderJobActions={controller.renderJobActions}
				sortState={controller.sortState}
				onSortChange={controller.onSortChange}
				theme={controller.themeConfig}
				hasNextPage={controller.hasNextPage}
				onLoadMore={controller.onLoadMore}
				isFetchingNextPage={controller.isFetchingNextPage}
				onTableContainerRef={controller.onTableContainerRef}
			/>

			{controller.hasOpenOverlay ? (
				<Suspense fallback={null}>
					<JobsOverlaysHost
						api={controller.api}
						apiToken={props.apiToken}
						profileId={props.profileId}
						isOffline={controller.isOffline}
						createFlow={{
							createOpen: controller.createOpen,
							createDownloadOpen: controller.createDownloadOpen,
							createDeleteOpen: controller.createDeleteOpen,
							onCloseCreate: controller.onCloseCreate,
							onCloseDownload: controller.onCloseDownload,
							onCloseDelete: controller.onCloseDelete,
							onSubmitCreate: controller.onCreateUpload,
							onSubmitDownload: controller.onCreateDownload,
							onSubmitDelete: controller.onCreateDelete,
							uploadLoading: controller.deviceUploadLoading,
							downloadLoading: controller.deviceDownloadLoading,
							deleteLoading: controller.createDeleteMutation.isPending,
							uploadSupported: controller.uploadSupported,
							uploadUnsupportedReason: controller.uploadDisabledReason ?? null,
						}}
						bucketState={{
							bucket: controller.bucket,
							onBucketChange: controller.onSetBucket,
							bucketOptions: controller.bucketOptions,
							deleteBucket: controller.deleteJobPrefill?.bucket ?? controller.bucket,
							deletePrefill: controller.deleteJobPrefill
								? { prefix: controller.deleteJobPrefill.prefix, deleteAll: controller.deleteJobPrefill.deleteAll }
								: null,
						}}
						detailsState={{
							detailsOpen: controller.detailsOpen,
							detailsJobId: controller.detailsJobId,
							onCloseDetails: controller.onCloseDetails,
							onDeleteJob: (jobId) => controller.deleteJobMutation.mutateAsync(jobId),
							deleteJobLoading:
								controller.deleteJobMutation.isPending && controller.deletingJobId === controller.detailsJobId,
							onOpenLogs: controller.onOpenLogs,
						}}
						logsState={{
							logRequestJobId: controller.logDrawerRequest.jobId,
							logRequestNonce: controller.logDrawerRequest.nonce,
							onCloseLogs: controller.onCloseLogs,
						}}
						layout={{
							drawerWidth: controller.drawerWidth,
							logSearchInputWidth: controller.logSearchInputWidth,
							borderColor: controller.themeConfig.borderColor,
							backgroundColor: controller.themeConfig.bg,
							borderRadius: controller.borderRadius,
						}}
					/>
				</Suspense>
			) : null}
		</Space>
	)
}
