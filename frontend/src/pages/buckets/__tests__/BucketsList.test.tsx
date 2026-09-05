import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { BucketsList } from '../BucketsList'

const baseProps = {
	search: '',
	onSearchChange: vi.fn(),
	buckets: [{ name: 'primary-bucket', createdAt: '2026-04-08T00:00:00Z' }],
	useCompactList: true,
	policySupported: true,
	policyUnsupportedReason: 'unsupported',
	controlsSupported: true,
	controlsUnsupportedReason: 'unsupported',
	deletePending: false,
	deletingBucket: null,
	onOpenObjects: vi.fn(),
	onOpenControls: vi.fn(),
	onOpenPolicy: vi.fn(),
	onDelete: vi.fn(),
}

describe('BucketsList', () => {
	it.each([true, false])('filters all loaded names and restores the list (compact: %s)', (useCompactList) => {
		function Harness() {
			const [search, setSearch] = useState('')
			return <BucketsList {...baseProps} useCompactList={useCompactList} search={search} onSearchChange={setSearch}
				buckets={Array.from({ length: 50 }, (_, i) => ({ name: `bucket-${String(i).padStart(3, '0')}` }))} />
		}
		render(<Harness />)
		expect(screen.queryByText('bucket-049')).not.toBeInTheDocument()
		fireEvent.change(screen.getByRole('searchbox', { name: 'Search buckets' }), { target: { value: ' BuCkEt-049 ' } })
		expect(screen.getByRole('status')).toHaveTextContent('1 of 50 buckets')
		expect(screen.getByText('bucket-049')).toBeInTheDocument()
		fireEvent.click(screen.getByRole('button', { name: /^Open/ }))
		expect(baseProps.onOpenObjects).toHaveBeenLastCalledWith('bucket-049')
		fireEvent.change(screen.getByRole('searchbox', { name: 'Search buckets' }), { target: { value: 'missing' } })
		expect(screen.getByText('No buckets match your search.')).toBeInTheDocument()
		expect(screen.getByRole('status')).toHaveTextContent('0 of 50 buckets')
		fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
		expect(screen.getByRole('status')).toHaveTextContent('50 of 50 buckets')
		expect(screen.getByText('bucket-000')).toBeInTheDocument()
	})

	it('keeps compact bucket cards exposed as a semantic list without changing article selectors', () => {
		render(<BucketsList {...baseProps} />)

		const compactList = screen.getByTestId('buckets-list-compact')
		expect(compactList).toHaveAttribute('role', 'list')
		expect(compactList).toHaveAccessibleName('Buckets')
		expect(compactList.querySelectorAll('article')).toHaveLength(1)
		const items = screen.getAllByRole('listitem')
		expect(items).toHaveLength(1)
		expect(items[0]).toHaveTextContent('primary-bucket')
	})

	it('windows large compact bucket lists', () => {
		render(
			<BucketsList
				{...baseProps}
				buckets={Array.from({ length: 1_000 }, (_, index) => ({ name: `bucket-${index}` }))}
			/>,
		)

		expect(screen.getAllByRole('listitem')).toHaveLength(10)
		expect(screen.getByText('bucket-0')).toBeInTheDocument()
		expect(screen.queryByText('bucket-999')).not.toBeInTheDocument()
	})

	it('uses a human-readable created date heading on desktop', () => {
		render(<BucketsList {...baseProps} useCompactList={false} />)

		expect(screen.getByRole('columnheader', { name: 'Created at' })).toBeInTheDocument()
	})
})
