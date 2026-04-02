import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ObjectsBucketPicker } from '../ObjectsBucketPicker'

describe('ObjectsBucketPicker', () => {
	it('closes the desktop picker and clears the search query when the scope changes', () => {
		const onChange = vi.fn()
		const { rerender } = render(
			<ObjectsBucketPicker
				scopeKey="token-a:profile-1"
				isDesktop={true}
				value="bucket-a"
				recentBuckets={['bucket-a']}
				options={[
					{ label: 'Bucket A', value: 'bucket-a' },
					{ label: 'Bucket B', value: 'bucket-b' },
				]}
				placeholder="Bucket…"
				onChange={onChange}
			/>,
		)

		fireEvent.click(screen.getByTestId('objects-bucket-picker-desktop'))
		const searchInput = screen.getByLabelText('Search buckets')
		fireEvent.change(searchInput, { target: { value: 'bucket-b' } })

		expect(screen.getByDisplayValue('bucket-b')).toBeInTheDocument()
		expect(screen.getByTestId('objects-bucket-picker-desktop-popover')).toBeInTheDocument()

		rerender(
			<ObjectsBucketPicker
				scopeKey="token-b:profile-1"
				isDesktop={true}
				value="bucket-a"
				recentBuckets={['bucket-a']}
				options={[
					{ label: 'Bucket A', value: 'bucket-a' },
					{ label: 'Bucket B', value: 'bucket-b' },
				]}
				placeholder="Bucket…"
				onChange={onChange}
			/>,
		)

		expect(screen.queryByTestId('objects-bucket-picker-desktop-popover')).not.toBeInTheDocument()
		expect(screen.getByTestId('objects-bucket-picker-desktop')).toHaveAttribute('aria-expanded', 'false')
	})

	it('closes the mobile picker and clears the search query when the scope changes', () => {
		const onChange = vi.fn()
		const { rerender } = render(
			<ObjectsBucketPicker
				scopeKey="token-a:profile-1"
				isDesktop={false}
				value="bucket-a"
				recentBuckets={['bucket-a']}
				options={[
					{ label: 'Bucket A', value: 'bucket-a' },
					{ label: 'Bucket B', value: 'bucket-b' },
				]}
				placeholder="Bucket…"
				onChange={onChange}
			/>,
		)

		fireEvent.click(screen.getByTestId('objects-bucket-picker-mobile-trigger'))
		const searchInput = screen.getByTestId('objects-bucket-picker-mobile-search')
		fireEvent.change(searchInput, { target: { value: 'bucket-b' } })

		expect(screen.getByDisplayValue('bucket-b')).toBeInTheDocument()
		expect(screen.getByTestId('objects-bucket-picker-mobile-drawer')).toBeInTheDocument()

		rerender(
			<ObjectsBucketPicker
				scopeKey="token-b:profile-1"
				isDesktop={false}
				value="bucket-a"
				recentBuckets={['bucket-a']}
				options={[
					{ label: 'Bucket A', value: 'bucket-a' },
					{ label: 'Bucket B', value: 'bucket-b' },
				]}
				placeholder="Bucket…"
				onChange={onChange}
			/>,
		)

		expect(screen.queryByTestId('objects-bucket-picker-mobile-drawer')).not.toBeInTheDocument()
		expect(screen.queryByDisplayValue('bucket-b')).not.toBeInTheDocument()
	})
})
