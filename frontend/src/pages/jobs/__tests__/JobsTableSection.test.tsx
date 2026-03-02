import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ensureDomShims } from '../../../test/domShims'
import { JobsTableSection } from '../JobsTableSection'

beforeAll(() => {
	ensureDomShims()
})

describe('JobsTableSection', () => {
	it('shows contextual help tooltips in empty state actions', () => {
		render(
			<JobsTableSection
				bucketsError={null}
				jobsError={null}
				sortedJobs={[]}
				columns={[]}
				tableScrollY={300}
				isLoading={false}
				isOffline={false}
				uploadSupported
				onOpenCreateUpload={vi.fn()}
				onOpenDeleteJob={vi.fn()}
				sortState={null}
				onSortChange={vi.fn()}
				theme={{ borderColor: '#ddd', bg: '#fff', hoverBg: '#f5f5f5' }}
				hasNextPage={false}
				onLoadMore={vi.fn()}
				isFetchingNextPage={false}
				onTableContainerRef={vi.fn()}
			/>,
		)

		expect(screen.getByText('No jobs yet.')).toBeInTheDocument()
		const triggers = screen.getAllByTestId('help-tooltip-trigger')
		expect(triggers).toHaveLength(2)

		fireEvent.mouseEnter(triggers[0].parentElement!)
		expect(screen.getByTestId('help-tooltip-content')).toHaveTextContent(
			'Uploads selected files from your device to the bucket',
		)

		fireEvent.mouseLeave(triggers[0].parentElement!)
		fireEvent.mouseEnter(triggers[1].parentElement!)
		expect(screen.getByTestId('help-tooltip-content')).toHaveTextContent(
			'Delete or copy objects matching patterns (prefix, wildcards)',
		)
	})
})
