import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'

import { ensureDomShims } from '../../../test/domShims'
import type { Job } from '../../../api/types'
import { JobsTableSection } from '../JobsTableSection'

beforeAll(() => {
	ensureDomShims()
})

describe('JobsTableSection', () => {
	function renderJobsTableSection(props: Partial<ComponentProps<typeof JobsTableSection>> = {}) {
		render(
			<MemoryRouter>
				<JobsTableSection
					bucketsError={null}
					jobsError={null}
					sortedJobs={[]}
					columns={[]}
					isCompact={false}
					tableScrollY={300}
					isLoading={false}
					isOffline={false}
					uploadSupported
					filtersDirty={false}
					onResetFilters={vi.fn()}
					eventsConnected
					onRetryRealtime={vi.fn()}
					onOpenCreateUpload={vi.fn()}
					getJobSummary={vi.fn(() => null)}
					renderJobActions={vi.fn(() => null)}
					sortState={null}
					onSortChange={vi.fn()}
					theme={{ borderColor: '#ddd', bg: '#fff', hoverBg: '#f5f5f5' }}
					hasNextPage={false}
					onLoadMore={vi.fn()}
					isFetchingNextPage={false}
					onTableContainerRef={vi.fn()}
					{...props}
				/>
			</MemoryRouter>,
		)
	}

	it('keeps the unfiltered empty state concise', () => {
		renderJobsTableSection()

		expect(screen.getByText('No activity yet.')).toBeInTheDocument()
		expect(screen.getByText('Uploads and other background work will appear here.')).toBeInTheDocument()
		expect(screen.queryByRole('button')).not.toBeInTheDocument()
		expect(screen.queryByRole('link')).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'New delete job' })).not.toBeInTheDocument()
	})

	it('uses filtered empty state actions when filters hide all loaded jobs', () => {
		const onResetFilters = vi.fn()
		renderJobsTableSection({
			filtersDirty: true,
			onResetFilters,
			eventsConnected: false,
		})

		expect(screen.getByText('No activity matches the current filters.')).toBeInTheDocument()
		fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
		expect(onResetFilters).toHaveBeenCalledTimes(1)
		expect(screen.getByRole('button', { name: 'Retry realtime' })).toBeInTheDocument()
	})

	it('windows large mobile job histories', () => {
		const jobs: Job[] = Array.from({ length: 200 }, (_, index) => ({
			id: `job-${index}`,
			type: 'transfer_sync_staging_to_s3',
			status: 'succeeded',
			payload: {},
			createdAt: '2026-03-09T09:40:17Z',
			error: null,
			errorCode: null,
		}))

		renderJobsTableSection({ sortedJobs: jobs, isCompact: true })

		expect(screen.getAllByRole('listitem')).toHaveLength(20)
		expect(screen.getByText('job-0')).toBeInTheDocument()
		expect(screen.queryByText('job-199')).not.toBeInTheDocument()
	})
})
