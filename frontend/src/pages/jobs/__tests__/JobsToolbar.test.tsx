import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ColumnKey } from '../useJobsColumnsVisibility'
import { JobsToolbar } from '../JobsToolbar'

const mergedColumnVisibility: Record<ColumnKey, boolean> = {
	id: true,
	type: true,
	summary: true,
	status: true,
	progress: true,
	errorCode: true,
	error: true,
	createdAt: true,
	actions: true,
}

describe('JobsToolbar', () => {
	it('renders queue health stats for the current result set', () => {
		render(
			<JobsToolbar
				activeProfileName="MinIO Demo"
				isOffline={false}
				uploadSupported
				uploadDisabledReason={null}
				eventsConnected
				eventsTransport="sse"
				eventsRetryCount={0}
				eventsRetryThreshold={3}
				onRetryRealtime={vi.fn()}
				onOpenCreateUpload={vi.fn()}
				onOpenCreateDownload={vi.fn()}
				topActionsMenu={{ items: [] }}
				statusFilter="all"
				onStatusFilterChange={vi.fn()}
				searchFilterNormalized=""
				onSearchFilterChange={vi.fn()}
				typeFilterNormalized=""
				onTypeFilterChange={vi.fn()}
				typeFilterSuggestions={[]}
				errorCodeFilterNormalized=""
				onErrorCodeFilterChange={vi.fn()}
				errorCodeSuggestions={[]}
				filtersDirty={false}
				onResetFilters={vi.fn()}
				jobsStatusSummary={{
					total: 15,
					active: 3,
					queued: 1,
					running: 2,
					succeeded: 10,
					failed: 1,
					canceled: 1,
				}}
				columnOptions={[]}
				mergedColumnVisibility={mergedColumnVisibility}
				onSetColumnVisible={vi.fn()}
				columnsDirty={false}
				onResetColumns={vi.fn()}
				onRefreshJobs={vi.fn()}
				jobsRefreshing={false}
				jobsCount={15}
			/>,
		)

		expect(screen.getByRole('heading', { name: 'Queue health' })).toBeInTheDocument()
		expect(screen.getByText('Active')).toBeInTheDocument()
		expect(screen.getByText('3')).toBeInTheDocument()
		expect(screen.getByText('Succeeded')).toBeInTheDocument()
		expect(screen.getByText('10')).toBeInTheDocument()
		expect(screen.getByText('15 loaded')).toBeInTheDocument()
		expect(screen.getByRole('combobox', { name: 'Search jobs' })).toBeInTheDocument()
	})
})
