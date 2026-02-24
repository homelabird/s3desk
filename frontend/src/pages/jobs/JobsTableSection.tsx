import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Space } from 'antd'
import { Profiler } from 'react'

import type { Job } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { logReactRender } from '../../lib/perf'
import { JobsVirtualTable, type JobsVirtualTableColumn, type SortState } from './JobsVirtualTable'

type Props = {
	bucketsError: unknown
	jobsError: unknown
	sortedJobs: Job[]
	columns: JobsVirtualTableColumn<Job>[]
	tableScrollY: number
	isLoading: boolean
	isOffline: boolean
	uploadSupported: boolean
	onOpenCreateUpload: () => void
	onOpenDeleteJob: () => void
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
	tableScrollY,
	isLoading,
	isOffline,
	uploadSupported,
	onOpenCreateUpload,
	onOpenDeleteJob,
	sortState,
	onSortChange,
	theme,
	hasNextPage,
	onLoadMore,
	isFetchingNextPage,
	onTableContainerRef,
}: Props) {
	return (
		<>
			{bucketsError ? (
				<Alert
					type="error"
					showIcon
					title="Failed to load buckets (autocomplete)"
					description={formatErr(bucketsError)}
				/>
			) : null}

			{jobsError ? <Alert type="error" showIcon title="Failed to load jobs" description={formatErr(jobsError)} /> : null}

			<div ref={onTableContainerRef}>
				<Profiler id="JobsTable" onRender={logReactRender}>
					<JobsVirtualTable
						rows={sortedJobs}
						columns={columns}
						height={tableScrollY}
						loading={isLoading}
						empty={
							<Empty description={
								<Space direction="vertical" size={4}>
									<span>No jobs yet.</span>
									<span style={{ color: 'rgba(0,0,0,0.45)' }}>Upload files or create a sync/copy/delete job to get started.</span>
								</Space>
							}>
								<Space wrap>
									<Button
										type="primary"
										icon={<PlusOutlined />}
										onClick={onOpenCreateUpload}
										disabled={isOffline || !uploadSupported}
									>
										Upload folder
									</Button>
									<Button danger icon={<DeleteOutlined />} onClick={onOpenDeleteJob} disabled={isOffline}>
										New delete job
									</Button>
								</Space>
							</Empty>
						}
						sort={sortState}
						onSortChange={onSortChange}
						ariaLabel="Jobs"
						theme={theme}
					/>
				</Profiler>
			</div>

			{hasNextPage ? (
				<Button
					onClick={onLoadMore}
					loading={isFetchingNextPage}
					disabled={!hasNextPage || isOffline}
				>
					Load more
				</Button>
			) : null}
		</>
	)
}
