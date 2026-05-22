import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { uploadsUnsupportedHint } from '../../../lib/actionHints'
import { ensureDomShims } from '../../../test/domShims'
import type { ColumnKey } from '../useJobsColumnsVisibility'
import { JobsToolbar } from '../JobsToolbar'

ensureDomShims()

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
			media: '(max-width: 767px)',
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
		const onStatusFilterChange = vi.fn()
		render(
			<JobsToolbar
				scopeKey="token-a:profile-1"
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
				topActionsMenu={{ items: [] }}
				statusFilter="all"
				onStatusFilterChange={onStatusFilterChange}
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

		expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument()
		expect(screen.queryByRole('heading', { name: 'Launch work' })).not.toBeInTheDocument()
		expect(screen.queryByRole('heading', { name: 'Troubleshooting' })).not.toBeInTheDocument()
		expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeInTheDocument()
		expect(screen.getByRole('heading', { name: 'Queue health' })).toBeInTheDocument()
		expect(screen.getByText('Active')).toBeInTheDocument()
		expect(screen.getByText('3')).toBeInTheDocument()
		expect(screen.getByText('Succeeded')).toBeInTheDocument()
		expect(screen.getByText('10')).toBeInTheDocument()
		expect(screen.getByText('15 loaded')).toBeInTheDocument()
		expect(screen.getByRole('combobox', { name: 'Search jobs' })).toBeInTheDocument()
		expect(screen.getByRole('combobox', { name: 'Job status filter' })).toBeInTheDocument()
		expect(screen.queryByRole('combobox', { name: 'Job type filter' })).not.toBeInTheDocument()
		const diagnosticsButton = screen.getByTestId('jobs-diagnostics-trigger')
		expect(diagnosticsButton).toHaveAttribute('aria-haspopup', 'dialog')
		expect(diagnosticsButton).toHaveAttribute('aria-expanded', 'false')
		expect(diagnosticsButton).toHaveAttribute('aria-controls', 'jobs-diagnostics-popover-panel')
		fireEvent.click(diagnosticsButton)
		expect(diagnosticsButton).toHaveAttribute('aria-expanded', 'true')
		const diagnosticsPopover = screen.getByRole('dialog', { name: 'Job diagnostic filters' })
		expect(diagnosticsPopover).toHaveAttribute('id', 'jobs-diagnostics-popover-panel')
		expect(screen.getByRole('combobox', { name: 'Job type filter' })).toBeInTheDocument()
		expect(screen.getByRole('combobox', { name: 'Job error code filter' })).toBeInTheDocument()
		fireEvent.click(screen.getByTestId('jobs-health-active'))
		expect(onStatusFilterChange).toHaveBeenCalledWith('active')
		fireEvent.click(screen.getByRole('button', { name: 'Show failed jobs' }))
		expect(onStatusFilterChange).toHaveBeenCalledWith('failed')

		const columnsButton = screen.getByTestId('jobs-columns-trigger')
		expect(columnsButton).toHaveAttribute('aria-haspopup', 'dialog')
		expect(columnsButton).toHaveAttribute('aria-expanded', 'false')
		expect(columnsButton).toHaveAttribute('aria-controls', 'jobs-columns-popover-panel')

		fireEvent.click(columnsButton)
		expect(columnsButton).toHaveAttribute('aria-expanded', 'true')
		const columnsPopover = screen.getByRole('dialog', { name: 'Job table layout' })
		expect(columnsPopover).toHaveAttribute('id', 'jobs-columns-popover-panel')

		fireEvent.keyDown(columnsPopover, { key: 'Tab' })
		expect(screen.getByRole('dialog', { name: 'Job table layout' })).toBeInTheDocument()
		expect(columnsButton).toHaveAttribute('aria-expanded', 'true')
	})

	it('collapses advanced filters into a mobile filter sheet trigger below the card breakpoint', () => {
		setMatchMedia(true)
		render(
			<JobsToolbar
				scopeKey="token-a:profile-1"
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
				topActionsMenu={{ items: [] }}
				statusFilter="active"
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

		const trigger = screen.getByTestId('jobs-mobile-filters-trigger')
		expect(trigger).toBeInTheDocument()
		expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
		expect(trigger).toHaveAttribute('aria-expanded', 'false')
		expect(trigger).toHaveAttribute('aria-controls', 'jobs-mobile-filters-sheet-panel')
		expect(screen.getByRole('button', { name: /Filters active/i })).toBeInTheDocument()
		expect(screen.getByTestId('jobs-mobile-filters-hint')).toHaveTextContent(
			'Search current jobs here, or open Filters for status, type, and error code.',
		)
		expect(screen.queryByRole('combobox', { name: 'Job status filter' })).not.toBeInTheDocument()
		expect(screen.queryByRole('combobox', { name: 'Job type filter' })).not.toBeInTheDocument()
		expect(screen.queryByRole('combobox', { name: 'Job error code filter' })).not.toBeInTheDocument()

		fireEvent.click(trigger)
		expect(screen.getByRole('combobox', { name: 'Job status filter' })).toHaveValue('active')
	})

	it('closes the mobile filters sheet when the scope changes', () => {
		setMatchMedia(true)
		const { rerender } = render(
			<JobsToolbar
				scopeKey="token-a:profile-1"
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

		const trigger = screen.getByTestId('jobs-mobile-filters-trigger')
		fireEvent.click(trigger)
		expect(trigger).toHaveAttribute('aria-expanded', 'true')
		expect(screen.getByTestId('jobs-mobile-filters-sheet')).toHaveAttribute('id', 'jobs-mobile-filters-sheet-panel')
		expect(screen.getByText('Job filters')).toBeInTheDocument()

		rerender(
			<JobsToolbar
				scopeKey="token-b:profile-1"
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

		expect(screen.queryByText('Job filters')).not.toBeInTheDocument()
	})

	it('hides the top actions menu when the scope changes', () => {
		setMatchMedia(false)
		const { rerender } = render(
			<JobsToolbar
				scopeKey="token-a:profile-1"
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
				topActionsMenu={{ items: [{ key: 'delete', label: 'Delete jobs' }] }}
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

		const moreButton = screen.getByRole('button', { name: /More job actions/i })
		expect(moreButton).toHaveAttribute('aria-haspopup', 'menu')
		expect(moreButton).toHaveAttribute('aria-expanded', 'false')

		fireEvent.click(moreButton)
		expect(moreButton).toHaveAttribute('aria-expanded', 'true')
		expect(screen.getByRole('menuitem', { name: 'Delete jobs' })).toBeInTheDocument()

		rerender(
			<JobsToolbar
				scopeKey="token-b:profile-1"
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
				topActionsMenu={{ items: [{ key: 'delete', label: 'Delete jobs' }] }}
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

		expect(screen.queryByRole('menuitem', { name: /Delete jobs/i })).not.toBeInTheDocument()
	})

	it('surfaces bucket lookup failures near the primary job actions', () => {
		setMatchMedia(false)
		render(
			<JobsToolbar
				scopeKey="token-a:profile-1"
				activeProfileName="MinIO Demo"
				isOffline={false}
				uploadSupported
				uploadDisabledReason={null}
				bucketLookupErrorDescription="transfer_engine_missing: rclone is required to list buckets"
				eventsConnected
				eventsTransport="ws"
				eventsRetryCount={0}
				eventsRetryThreshold={3}
				onRetryRealtime={vi.fn()}
				onOpenCreateUpload={vi.fn()}
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
					total: 0,
					active: 0,
					queued: 0,
					running: 0,
					succeeded: 0,
					failed: 0,
					canceled: 0,
				}}
				columnOptions={[]}
				mergedColumnVisibility={mergedColumnVisibility}
				onSetColumnVisible={vi.fn()}
				columnsDirty={false}
				onResetColumns={vi.fn()}
				onRefreshJobs={vi.fn()}
				jobsRefreshing={false}
				jobsCount={0}
			/>,
		)

		expect(screen.getByText('Bucket lookup unavailable')).toBeInTheDocument()
		expect(screen.getByText(/You can still type a bucket name manually/i)).toBeInTheDocument()
	})

	it('uses the shared uploads-unsupported hint when no provider reason is supplied', () => {
		setMatchMedia(false)
		render(
			<JobsToolbar
				scopeKey="token-a:profile-1"
				activeProfileName="MinIO Demo"
				isOffline={false}
				uploadSupported={false}
				uploadDisabledReason={null}
				eventsConnected
				eventsTransport="ws"
				eventsRetryCount={0}
				eventsRetryThreshold={3}
				onRetryRealtime={vi.fn()}
				onOpenCreateUpload={vi.fn()}
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
					total: 0,
					active: 0,
					queued: 0,
					running: 0,
					succeeded: 0,
					failed: 0,
					canceled: 0,
				}}
				columnOptions={[]}
				mergedColumnVisibility={mergedColumnVisibility}
				onSetColumnVisible={vi.fn()}
				columnsDirty={false}
				onResetColumns={vi.fn()}
				onRefreshJobs={vi.fn()}
				jobsRefreshing={false}
				jobsCount={0}
			/>,
		)

		expect(screen.getByText(uploadsUnsupportedHint())).toBeInTheDocument()
	})

	it('hides recovery signals when the queue is healthy', () => {
		setMatchMedia(false)
		render(
			<JobsToolbar
				scopeKey="token-a:profile-1"
				activeProfileName="MinIO Demo"
				isOffline={false}
				uploadSupported
				uploadDisabledReason={null}
				eventsConnected
				eventsTransport="ws"
				eventsRetryCount={0}
				eventsRetryThreshold={3}
				onRetryRealtime={vi.fn()}
				onOpenCreateUpload={vi.fn()}
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
					total: 0,
					active: 0,
					queued: 0,
					running: 0,
					succeeded: 0,
					failed: 0,
					canceled: 0,
				}}
				columnOptions={[]}
				mergedColumnVisibility={mergedColumnVisibility}
				onSetColumnVisible={vi.fn()}
				columnsDirty={false}
				onResetColumns={vi.fn()}
				onRefreshJobs={vi.fn()}
				jobsRefreshing={false}
				jobsCount={0}
			/>,
		)

		expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument()
		expect(screen.queryByRole('heading', { name: 'Needs attention' })).not.toBeInTheDocument()
		expect(screen.queryByText('No active troubleshooting warnings.')).not.toBeInTheDocument()
	})
})
