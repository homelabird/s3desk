import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Space, Spin, Tag, Typography } from 'antd'
import { Profiler } from 'react'
import type { ReactNode } from 'react'

import type { Job } from '../../api/types'
import { PageSection } from '../../components/PageSection'
import { HelpTooltip } from '../../components/HelpTooltip'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { formatDateTime } from '../../lib/format'
import { jobTypeLabel } from '../../lib/jobTypes'
import { logReactRender } from '../../lib/perf'
import { formatProgress } from './jobPresentation'
import { statusColor } from './jobUtils'
import { JobsVirtualTable, type JobsVirtualTableColumn, type SortState } from './JobsVirtualTable'
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
	onOpenDeleteJob: () => void
	onOpenDetails: (jobId: string) => void
	onOpenLogs: (jobId: string) => void
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
	onOpenDeleteJob,
	onOpenDetails,
	onOpenLogs,
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
		<Empty
			description={
				<Space orientation="vertical" size={6} className={styles.emptyCopy}>
					<Typography.Text strong>No jobs yet.</Typography.Text>
					<Typography.Text type="secondary" className={styles.emptyHint}>
						Upload from this device or create a sync, copy, or delete job to start populating the queue.
					</Typography.Text>
				</Space>
			}
		>
			<div className={styles.emptyActionRow}>
				<Button
					type="primary"
					icon={<PlusOutlined />}
					onClick={onOpenCreateUpload}
					disabled={isOffline || !uploadSupported}
				>
					Upload…
				</Button>
				<HelpTooltip text="Uploads selected files or folders from your device to the bucket" />
				<Button danger icon={<DeleteOutlined />} onClick={onOpenDeleteJob} disabled={isOffline}>
					New delete job
				</Button>
				<HelpTooltip text="Delete or copy objects matching patterns (prefix, wildcards)" />
			</div>
		</Empty>
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
				description="Recent jobs stay searchable here. Desktop keeps the full virtualized table, while smaller screens collapse the list into action-oriented cards."
				actions={
					<Typography.Text type="secondary">{sortedJobs.length ? `${sortedJobs.length.toLocaleString()} visible` : 'No visible jobs'}</Typography.Text>
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
							<div className={styles.mobileList}>
								{sortedJobs.map((job) => {
									const summary = getJobSummary(job) ?? 'No summary available.'
									const errorText = [job.errorCode, job.error].filter(Boolean).join(' · ')
									return (
										<article key={job.id} className={styles.mobileCard}>
											<div className={styles.mobileCardTop}>
												<div className={styles.mobileCardCopy}>
													<div className={styles.mobileTitleRow}>
														<Tag color={statusColor(job.status)}>{job.status}</Tag>
														<Typography.Text strong>{jobTypeLabel(job.type)}</Typography.Text>
													</div>
													<Typography.Paragraph className={styles.mobileSummary}>{summary}</Typography.Paragraph>
													<Typography.Text code className={styles.mobileJobId}>
														{job.id}
													</Typography.Text>
												</div>
											</div>

											<div className={styles.mobileMetaGrid}>
												<div>
													<div className={styles.mobileMetaLabel}>Created</div>
													<div className={styles.mobileMetaValue}>{job.createdAt ? formatDateTime(job.createdAt) : '-'}</div>
												</div>
												<div>
													<div className={styles.mobileMetaLabel}>Progress</div>
													<div className={styles.mobileMetaValue}>{formatProgress(job.progress)}</div>
												</div>
											</div>

											{errorText ? (
												<div className={styles.mobileError} title={errorText}>
													{errorText}
												</div>
											) : null}

											<div className={styles.mobileActionRow}>
												<Button size="small" onClick={() => onOpenDetails(job.id)} disabled={isOffline}>
													Details
												</Button>
												<Button size="small" onClick={() => onOpenLogs(job.id)} disabled={isOffline}>
													Logs
												</Button>
												<div className={styles.mobileInlineActions}>{renderJobActions(job)}</div>
											</div>
										</article>
									)
								})}
							</div>
						)
					) : (
						<Profiler id="JobsTable" onRender={logReactRender}>
							<JobsVirtualTable
								rows={sortedJobs}
								columns={columns}
								height={tableScrollY}
								loading={isLoading}
								empty={emptyState}
								sort={sortState}
								onSortChange={onSortChange}
								ariaLabel="Jobs"
								theme={theme}
							/>
						</Profiler>
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
