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

export function JobsTableSection(props: JobsTableSectionProps) {
	const emptyState = (
		<JobsEmptyState
			isOffline={props.isOffline}
			uploadSupported={props.uploadSupported}
			onOpenCreateUpload={props.onOpenCreateUpload}
			onOpenDownloadJob={props.onOpenDownloadJob}
			onOpenDeleteJob={props.onOpenDeleteJob}
		/>
	)

	return (
		<div className={styles.stack}>
			{props.jobsError ? <Alert type="error" showIcon title="Failed to load jobs" description={formatErr(props.jobsError)} /> : null}

			<PageSection
				title="Queue history"
				description="Recent jobs stay searchable here. Desktop keeps the full virtualized table, while smaller screens collapse the list into action-oriented cards. Use Objects when you need copy, move, or indexing workflows."
				actions={
					<Typography.Text type="secondary">
						{props.sortedJobs.length ? `${props.sortedJobs.length.toLocaleString()} visible` : 'No visible jobs'}
					</Typography.Text>
				}
				flush
			>
				<div ref={props.onTableContainerRef} className={styles.surfaceBody}>
					{props.isCompact ? (
						props.isLoading && props.sortedJobs.length === 0 ? (
							<div className={styles.loadingState}>
								<Spin />
							</div>
						) : props.sortedJobs.length === 0 ? (
							<div className={styles.emptyState}>{emptyState}</div>
						) : (
							<JobsMobileList jobs={props.sortedJobs} getJobSummary={props.getJobSummary} renderJobActions={props.renderJobActions} />
						)
					) : (
						<JobsDesktopTable
							jobs={props.sortedJobs}
							columns={props.columns}
							tableScrollY={props.tableScrollY}
							isLoading={props.isLoading}
							emptyState={emptyState}
							sortState={props.sortState}
							onSortChange={props.onSortChange}
							theme={props.theme}
						/>
					)}

					{props.hasNextPage ? (
						<div className={styles.footer}>
							<Button onClick={props.onLoadMore} loading={props.isFetchingNextPage} disabled={!props.hasNextPage || props.isOffline}>
								Load more
							</Button>
						</div>
					) : null}
				</div>
			</PageSection>
		</div>
	)
}
