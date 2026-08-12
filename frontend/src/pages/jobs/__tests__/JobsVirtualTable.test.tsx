import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ensureDomShims } from '../../../test/domShims'
import { JobsVirtualTable } from '../JobsVirtualTable'

vi.mock('@tanstack/react-virtual', () => ({
	useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => {
		const itemSize = estimateSize()
		return {
			getVirtualItems: () =>
				Array.from({ length: count }, (_, index) => ({
					index,
					key: index,
					size: itemSize,
					start: index * itemSize,
					end: (index + 1) * itemSize,
				})),
			getTotalSize: () => count * itemSize,
			measureElement: vi.fn(),
		}
	},
}))

ensureDomShims()

describe('JobsVirtualTable', () => {
	it('labels sortable column buttons with the current sort state', () => {
		render(
			<JobsVirtualTable
				rows={[{ id: 'job-1', name: 'Upload' }]}
				columns={[
					{
						key: 'name',
						title: 'Name',
						dataIndex: 'name',
						sorter: (a, b) => a.name.localeCompare(b.name),
					},
				]}
				height={240}
				loading={false}
				sort={{ key: 'name', direction: 'desc' }}
				onSortChange={vi.fn()}
				theme={{ borderColor: '#ddd', bg: '#fff', hoverBg: '#f5f5f5' }}
			/>,
		)

		expect(screen.getByRole('button', { name: 'Sort by Name. Current sort: descending.' })).toBeInTheDocument()
		expect(screen.getByText('v')).toHaveAttribute('aria-hidden', 'true')
		expect(screen.getByText('sorted descending')).toHaveClass('sr-only')
	})

	it('exposes virtualized row counts and visible row indexes', () => {
		render(
			<JobsVirtualTable
				ariaLabel="Transfer jobs"
				rows={[
					{ id: 'job-1', name: 'Upload' },
					{ id: 'job-2', name: 'Download' },
				]}
				columns={[
					{
						key: 'name',
						title: 'Name',
						dataIndex: 'name',
						sorter: (a, b) => a.name.localeCompare(b.name),
					},
					{
						key: 'actions',
						title: 'Actions',
						render: () => <button type="button">Open</button>,
					},
				]}
				height={240}
				loading={false}
				sort={null}
				onSortChange={vi.fn()}
				theme={{ borderColor: '#ddd', bg: '#fff', hoverBg: '#f5f5f5' }}
			/>,
		)

		expect(screen.getByRole('table', { name: 'Transfer jobs' })).toHaveAttribute('aria-rowcount', '3')
		expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute('aria-sort', 'none')
		expect(screen.getByRole('columnheader', { name: 'Actions' })).not.toHaveAttribute('aria-sort')
		expect(screen.getByText('Upload').closest('tr')).toHaveAttribute('aria-rowindex', '2')
		expect(screen.getByText('Download').closest('tr')).toHaveAttribute('aria-rowindex', '3')
	})
})
