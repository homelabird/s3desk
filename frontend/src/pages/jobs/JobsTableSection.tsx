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

type Props = {
	bucketsError: unknown
	jobsError: unknown
	sortedJobs: Job[]
	columns: JobsVirtualTableColumn<Job>[]
	isCompact: boolean
	tableScrollY: number
	isLoading: boolean
	isOffline: boolean
	uploadSupported: boolean
	onOpenCreateUpload: () => void
	onOpenDownloadJob: () => void
	onOpenDeleteJob: () => void
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

export function JobsTableSection({
	bucketsError,
	jobsError,
	sortedJobs,
	columns,
	isCompact,
	tableScrollY,
	isLoading,
	isOffline,
	uploadSupported,
	onOpenCreateUpload,
	onOpenDownloadJob,
	onOpenDeleteJob,
	getJobSummary,
	renderJobActions,
	sortState,
	onSortChange,
	theme,
	hasNextPage,
	onLoadMore,
	isFetchingNextPage,
	onTableContainerRef,
}: Props) {
	const emptyState = (
		<JobsEmptyState
			isOffline={isOffline}
			uploadSupported={uploadSupported}
			onOpenCreateUpload={onOpenCreateUpload}
			onOpenDownloadJob={onOpenDownloadJob}
			onOpenDeleteJob={onOpenDeleteJob}
		/>
	)

	return (
		<div className={styles.stack}>
			{bucketsError ? (
				<Alert
					type="error"
					showIcon
					title="Failed to load buckets (autocomplete)"
					description={formatErr(bucketsError)}
				/>
			) : null}

			{jobsError ? <Alert type="error" showIcon title="Failed to load jobs" description={formatErr(jobsError)} /> : null}

			<PageSection
				title="Queue history"
				description="Recent jobs stay searchable here. Desktop keeps the full virtualized table, while smaller screens collapse the list into action-oriented cards. Use Objects when you need copy, move, or indexing workflows."
				actions={
					<Typography.Text type="secondary">
						{sortedJobs.length ? `${sortedJobs.length.toLocaleString()} visible` : 'No visible jobs'}
					</Typography.Text>
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
							<JobsMobileList jobs={sortedJobs} getJobSummary={getJobSummary} renderJobActions={renderJobActions} />
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
