import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BucketsList } from '../BucketsList'

const baseProps = {
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

		expect(screen.getAllByRole('listitem')).toHaveLength(20)
		expect(screen.getByText('bucket-0')).toBeInTheDocument()
		expect(screen.queryByText('bucket-999')).not.toBeInTheDocument()
	})
})
