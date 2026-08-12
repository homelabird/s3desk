import { Alert, Button, Spin, Typography } from 'antd'
import type { ReactNode } from 'react'

import type { Job } from '../../api/types'
import { PageSection } from '../../components/PageSection'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { JobsDesktopTable } from './JobsDesktopTable'
import { JobsEmptyState } from './JobsEmptyState'
import { JobsMobileList } from './JobsMobileList'
import type { JobsVirtualTableColumn, SortState } from './JobsVirtualTable'
import styles from './JobsTableSection.module.css'

export type JobsTableSectionProps = {
	bucketsError: unknown
	jobsError: unknown
	sortedJobs: Job[]
	columns: JobsVirtualTableColumn<Job>[]
	isCompact: boolean
	tableScrollY: number
	isLoading: boolean
	isOffline: boolean
	uploadSupported: boolean
	filtersDirty: boolean
	onResetFilters: () => void
	eventsConnected: boolean
	onRetryRealtime: () => void
	onOpenCreateUpload: () => void
	getJobSummary: (job: Job) => string | null
	renderJobActions: (job: Job) => ReactNode
	sortState: SortState
	onSortChange: (next: SortState) => void
	theme: {
		borderColor: string
		bg: string
		hoverBg: string
	}
	hasNextPage: boolean
	onLoadMore: () => void
	isFetchingNextPage: boolean
	onTableContainerRef: (element: HTMLDivElement | null) => void
}

export function JobsTableSection(props: JobsTableSectionProps) {
	const {
		jobsError,
		sortedJobs,
		columns,
		isCompact,
		tableScrollY,
		isLoading,
		isOffline,
		uploadSupported,
		filtersDirty,
		onResetFilters,
		eventsConnected,
		onRetryRealtime,
		onOpenCreateUpload,
		getJobSummary,
		renderJobActions,
		sortState,
		onSortChange,
		theme,
		hasNextPage,
		onLoadMore,
		isFetchingNextPage,
		onTableContainerRef,
	} = props
	const emptyState = (
		<JobsEmptyState
			isOffline={isOffline}
			uploadSupported={uploadSupported}
			filtersDirty={filtersDirty}
			onResetFilters={onResetFilters}
			eventsConnected={eventsConnected}
			onRetryRealtime={onRetryRealtime}
			onOpenCreateUpload={onOpenCreateUpload}
		/>
	)

	return (
		<div className={styles.stack}>
			{jobsError ? <Alert type="error" showIcon title="Failed to load jobs" description={formatErr(jobsError)} /> : null}

			<PageSection
				title="History"
				actions={
					sortedJobs.length ? (
						<Typography.Text type="secondary">{sortedJobs.length.toLocaleString()} visible</Typography.Text>
					) : null
				}
				flush
			>
				<div ref={onTableContainerRef} className={styles.surfaceBody}>
					{isCompact ? (
						isLoading && sortedJobs.length === 0 ? (
							<div className={styles.loadingState}>
								<Spin />
							</div>
						) : sortedJobs.length === 0 ? (
							<div className={styles.emptyState}>{emptyState}</div>
						) : (
							<JobsMobileList
								jobs={sortedJobs}
								height={tableScrollY}
								getJobSummary={getJobSummary}
								renderJobActions={renderJobActions}
							/>
						)
					) : (
						<JobsDesktopTable
							jobs={sortedJobs}
							columns={columns}
							tableScrollY={tableScrollY}
							isLoading={isLoading}
							emptyState={emptyState}
							sortState={sortState}
							onSortChange={onSortChange}
							theme={theme}
						/>
					)}

					{hasNextPage ? (
						<div className={styles.footer}>
							<Button onClick={onLoadMore} loading={isFetchingNextPage} disabled={!hasNextPage || isOffline}>
								Load more
							</Button>
						</div>
					) : null}
				</div>
			</PageSection>
		</div>
	)
}
