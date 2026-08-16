import { FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons'
import { Alert, Button, Spin, Typography } from 'antd'
import { useEffect, useState, type ReactNode } from 'react'

import type { Job } from '../../api/types'
import { PageSection } from '../../components/PageSection'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { JobsDesktopTable } from './JobsDesktopTable'
import { JobsEmptyState } from './JobsEmptyState'
import { JobsMobileList } from './JobsMobileList'
import type { JobsVirtualTableColumn, SortState } from './JobsVirtualTable'
import styles from './JobsTableSection.module.css'

export type JobsTableSectionProps = {
	bucketsError?: unknown
	jobsError: unknown
	sortedJobs: Job[]
	columns: JobsVirtualTableColumn<Job>[]
	isCompact: boolean
	tableScrollY: number
	isLoading: boolean
	isOffline: boolean
	uploadSupported?: boolean
	filtersDirty: boolean
	onResetFilters: () => void
	eventsConnected: boolean
	onRetryRealtime: () => void
	onOpenCreateUpload?: () => void
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
	const [isExpanded, setIsExpanded] = useState(false)
	const {
		jobsError,
		sortedJobs,
		columns,
		isCompact,
		tableScrollY,
		isLoading,
		isOffline,
		filtersDirty,
		onResetFilters,
		eventsConnected,
		onRetryRealtime,
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
	useEffect(() => {
		if (!isExpanded) return
		const restore = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setIsExpanded(false)
		}
		window.addEventListener('keydown', restore)
		return () => window.removeEventListener('keydown', restore)
	}, [isExpanded])

	const visibleTableHeight = isExpanded
		? Math.max(240, (typeof window === 'undefined' ? tableScrollY : window.innerHeight) - 72)
		: tableScrollY
	const emptyState = (
		<JobsEmptyState
			isOffline={isOffline}
			filtersDirty={filtersDirty}
			onResetFilters={onResetFilters}
			eventsConnected={eventsConnected}
			onRetryRealtime={onRetryRealtime}
		/>
	)

	return (
		<div className={styles.stack}>
			{jobsError ? <Alert type="error" showIcon title="Failed to load jobs" description={formatErr(jobsError)} /> : null}

			<PageSection
				title="History"
				className={isExpanded ? styles.expandedSection : undefined}
				bodyClassName={isExpanded ? styles.expandedBody : undefined}
				actions={
					<>
						{sortedJobs.length ? (
							<Typography.Text type="secondary">{sortedJobs.length.toLocaleString()} visible</Typography.Text>
						) : null}
						<Button
							type="text"
							icon={isExpanded ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
							aria-label={isExpanded ? 'Restore History panel' : 'Expand History panel'}
							aria-pressed={isExpanded}
							onClick={() => setIsExpanded((current) => !current)}
						/>
					</>
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
								height={visibleTableHeight}
								getJobSummary={getJobSummary}
								renderJobActions={renderJobActions}
							/>
						)
					) : (
						<JobsDesktopTable
							jobs={sortedJobs}
							columns={columns}
							tableScrollY={visibleTableHeight}
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
