import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
	bucketFieldPlaceholder,
	loadingBucketsPlaceholder,
	noMatchingBucketsHint,
	noBucketsAvailableHint,
	noBucketsAvailableSentenceHint,
	noBucketsMatchSearchHint,
	searchBucketsPlaceholder,
	selectBucketTitle,
	tapToChooseBucketHint,
	tapToSwitchBucketHint,
} from '../../../lib/actionHints'
import { ObjectsBucketPicker } from '../ObjectsBucketPicker'

describe('ObjectsBucketPicker', () => {
	it('preserves the full desktop bucket name in the trigger title for truncated labels', () => {
		const longBucketName = 'layout-bucket-regional-observability-archive-2026'

		render(
			<ObjectsBucketPicker
				scopeKey="token-a:profile-1"
				isDesktop={true}
				value={longBucketName}
				recentBuckets={[longBucketName]}
				options={[{ label: longBucketName, value: longBucketName }]}
				placeholder={bucketFieldPlaceholder()}
				onChange={vi.fn()}
			/>,
		)

		expect(screen.getByRole('button', { name: `Bucket: ${longBucketName}` })).toHaveAttribute('title', longBucketName)
		expect(screen.getByTestId('objects-bucket-picker-desktop-value')).toHaveAttribute('title', longBucketName)
	})

	it('exposes the selected desktop bucket and traps focus inside the popover', () => {
		render(
			<ObjectsBucketPicker
				scopeKey="token-a:profile-1"
				isDesktop={true}
				value="bucket-a"
				recentBuckets={['bucket-a']}
				options={[
					{ label: 'Bucket A', value: 'bucket-a' },
					{ label: 'Bucket B', value: 'bucket-b' },
				]}
				placeholder={bucketFieldPlaceholder()}
				onChange={vi.fn()}
			/>,
		)

		const trigger = screen.getByRole('button', { name: 'Bucket: bucket-a' })
		expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')

		fireEvent.click(trigger)

		const popover = screen.getByRole('dialog', { name: selectBucketTitle() })
		expect(trigger).toHaveAttribute('aria-controls', popover.id)
		expect(screen.getByLabelText('Search buckets')).toHaveFocus()

		trigger.focus()
		fireEvent.keyDown(trigger, { key: 'Tab', shiftKey: true })
		expect(screen.getByTestId('objects-bucket-picker-option-bucket-b')).toHaveFocus()
	})

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
				placeholder={bucketFieldPlaceholder()}
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
				placeholder={bucketFieldPlaceholder()}
				onChange={onChange}
			/>,
		)

		expect(screen.queryByTestId('objects-bucket-picker-desktop-popover')).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Bucket: bucket-a' })).toHaveAttribute('aria-expanded', 'false')
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
				placeholder={bucketFieldPlaceholder()}
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
				placeholder={bucketFieldPlaceholder()}
				onChange={onChange}
			/>,
		)

		expect(screen.queryByTestId('objects-bucket-picker-mobile-drawer')).not.toBeInTheDocument()
		expect(screen.queryByDisplayValue('bucket-b')).not.toBeInTheDocument()
	})

	it('uses shared helper copy for the mobile trigger hint states', () => {
		const { rerender } = render(
			<ObjectsBucketPicker
				scopeKey="token-a:profile-1"
				isDesktop={false}
				value="bucket-a"
				recentBuckets={['bucket-a']}
				options={[{ label: 'Bucket A', value: 'bucket-a' }]}
				placeholder={bucketFieldPlaceholder()}
				onChange={vi.fn()}
			/>,
		)

		expect(screen.getByText(tapToSwitchBucketHint())).toBeInTheDocument()

		rerender(
			<ObjectsBucketPicker
				scopeKey="token-a:profile-1"
				isDesktop={false}
				value=""
				recentBuckets={[]}
				options={[{ label: 'Bucket A', value: 'bucket-a' }]}
				placeholder={bucketFieldPlaceholder()}
				onChange={vi.fn()}
			/>,
		)

		expect(screen.getByText(tapToChooseBucketHint())).toBeInTheDocument()

		rerender(
			<ObjectsBucketPicker
				scopeKey="token-a:profile-1"
				isDesktop={false}
				value=""
				recentBuckets={[]}
				options={[]}
				placeholder={bucketFieldPlaceholder()}
				onChange={vi.fn()}
			/>,
		)

		expect(screen.getByText(noBucketsAvailableHint())).toBeInTheDocument()
	})

	it('uses shared helper copy for the mobile empty-state messages', () => {
		render(
			<ObjectsBucketPicker
				scopeKey="token-a:profile-1"
				isDesktop={false}
				value=""
				recentBuckets={[]}
				options={[]}
				placeholder={bucketFieldPlaceholder()}
				onChange={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId('objects-bucket-picker-mobile-trigger'))
		expect(screen.getByText(selectBucketTitle())).toBeInTheDocument()
		expect(screen.getByText(noBucketsAvailableSentenceHint())).toBeInTheDocument()

		const searchInput = screen.getByTestId('objects-bucket-picker-mobile-search')
		expect(searchInput).toHaveAttribute('placeholder', searchBucketsPlaceholder())
		fireEvent.change(searchInput, { target: { value: 'missing' } })

		expect(screen.getByText(noBucketsMatchSearchHint())).toBeInTheDocument()
	})

	it('uses shared desktop search and empty-state copy', () => {
		render(
			<ObjectsBucketPicker
				scopeKey="token-a:profile-1"
				isDesktop={true}
				value=""
				recentBuckets={[]}
				options={[]}
				placeholder={bucketFieldPlaceholder()}
				onChange={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId('objects-bucket-picker-desktop'))

		const searchInput = screen.getByLabelText('Search buckets')
		expect(searchInput).toHaveAttribute('placeholder', searchBucketsPlaceholder())
		expect(screen.getByText(noMatchingBucketsHint())).toBeInTheDocument()
	})

	it('surfaces the shared loading placeholder while the bucket picker is disabled', () => {
		render(
			<ObjectsBucketPicker
				scopeKey="token-a:profile-1"
				isDesktop={true}
				value=""
				recentBuckets={[]}
				options={[]}
				placeholder={loadingBucketsPlaceholder()}
				disabled
				onChange={vi.fn()}
			/>,
		)

		expect(screen.getByTestId('objects-bucket-picker-desktop')).toHaveAttribute('title', loadingBucketsPlaceholder())
	})
})
