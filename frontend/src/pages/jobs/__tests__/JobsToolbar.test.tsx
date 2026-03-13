import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

function setMatchMedia(matches: boolean) {
	Object.defineProperty(window, 'matchMedia', {
		writable: true,
		value: vi.fn().mockImplementation(() => ({
			matches,
			media: '(max-width: 480px)',
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	})
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('JobsToolbar', () => {
	it('renders queue health stats for the current result set', () => {
		setMatchMedia(false)
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

	it('collapses advanced filters into a mobile filter sheet trigger below 480px', () => {
		setMatchMedia(true)
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
				statusFilter="running"
				onStatusFilterChange={vi.fn()}
				searchFilterNormalized=""
				onSearchFilterChange={vi.fn()}
				typeFilterNormalized="upload"
				onTypeFilterChange={vi.fn()}
				typeFilterSuggestions={[]}
				errorCodeFilterNormalized=""
				onErrorCodeFilterChange={vi.fn()}
				errorCodeSuggestions={[]}
				filtersDirty
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

		expect(screen.getByTestId('jobs-mobile-filters-trigger')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: /Filters active/i })).toBeInTheDocument()
		expect(screen.queryByRole('combobox', { name: 'Job status filter' })).not.toBeInTheDocument()
		expect(screen.queryByRole('combobox', { name: 'Job type filter' })).not.toBeInTheDocument()
		expect(screen.queryByRole('combobox', { name: 'Job error code filter' })).not.toBeInTheDocument()
	})
})
