import { Profiler } from 'react'
import type { ReactNode } from 'react'

import type { Job } from '../../api/types'
import { logReactRender } from '../../lib/perf'
import { JobsVirtualTable, type JobsVirtualTableColumn, type SortState } from './JobsVirtualTable'

type Props = {
	jobs: Job[]
	columns: JobsVirtualTableColumn<Job>[]
	tableScrollY: number
	isLoading: boolean
	emptyState: ReactNode
	sortState: SortState
	onSortChange: (next: SortState) => void
	theme: {
		borderColor: string
		bg: string
		hoverBg: string
	}
}

export function JobsDesktopTable({
	jobs,
	columns,
	tableScrollY,
	isLoading,
	emptyState,
	sortState,
	onSortChange,
	theme,
}: Props) {
	return (
		<Profiler id="JobsTable" onRender={logReactRender}>
			<JobsVirtualTable
				rows={jobs}
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
	)
}
