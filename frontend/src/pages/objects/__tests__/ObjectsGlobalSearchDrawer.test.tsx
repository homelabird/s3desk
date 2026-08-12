import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { selectBucketFirstHint, selectProfileFirstHint } from '../../../lib/actionHints'
import { ObjectsGlobalSearchDrawer } from '../ObjectsGlobalSearchDrawer'
import styles from '../ObjectsSearch.module.css'

function buildProps() {
	return {
		scopeKey: 'token-a:profile-1:bucket-a',
		open: true,
		onClose: vi.fn(),
		hasProfile: true,
		hasBucket: true,
		bucket: 'bucket-a',
		currentPrefix: 'docs/',
		isMd: false,
		useWideResults: false,
		queryDraft: '',
		onQueryDraftChange: vi.fn(),
		prefixFilter: '',
		onPrefixFilterChange: vi.fn(),
		limit: 100,
		onLimitChange: vi.fn(),
		extFilter: '',
		onExtFilterChange: vi.fn(),
		minSizeBytes: null,
		maxSizeBytes: null,
		onMinSizeBytesChange: vi.fn(),
		onMaxSizeBytesChange: vi.fn(),
		modifiedAfterMs: null,
		modifiedBeforeMs: null,
		onModifiedRangeChange: vi.fn(),
		onReset: vi.fn(),
		onRefresh: vi.fn(),
		isRefreshing: false,
		isError: false,
		isNotIndexed: true,
		errorMessage: '',
		onCreateIndexJob: vi.fn(),
		isCreatingIndexJob: false,
		indexPrefix: '',
		onIndexPrefixChange: vi.fn(),
		indexFullReindex: true,
		onIndexFullReindexChange: vi.fn(),
		searchQueryText: '',
		isFetching: false,
		hasNextPage: false,
		isFetchingNextPage: false,
		items: [],
		onLoadMore: vi.fn(),
		onUseCurrentPrefix: vi.fn(),
		onOpenPrefixForKey: vi.fn(),
		onCopyKey: vi.fn(),
		onDownloadKey: vi.fn(),
		onOpenDetails: vi.fn(),
	}
}

describe('ObjectsGlobalSearchDrawer', () => {
	it('shows shared prerequisite warnings before a profile or bucket is selected', () => {
		const { rerender } = render(<ObjectsGlobalSearchDrawer {...buildProps()} hasProfile={false} />)

		expect(screen.getByText(selectProfileFirstHint())).toBeInTheDocument()

		rerender(<ObjectsGlobalSearchDrawer {...buildProps()} hasBucket={false} />)

		expect(screen.getByText(selectBucketFirstHint())).toBeInTheDocument()
	})

	it('resets the index panel disclosure state when the scope changes', () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
		const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		try {
			const { rerender } = render(<ObjectsGlobalSearchDrawer {...buildProps()} />)
			expect(screen.getByTestId('objects-global-search-sheet')).toBeInTheDocument()
			expect(screen.getByTestId('objects-global-search-content')).toBeInTheDocument()
			expect(screen.queryByText('Search across this bucket')).not.toBeInTheDocument()
			expect(screen.queryByText(/Find objects outside the current folder/)).not.toBeInTheDocument()
			expect(screen.getByTestId('objects-global-search-index-card')).toBeInTheDocument()
			expect(screen.getByTestId('objects-global-search-index-toggle')).toBeInTheDocument()

			const toggle = screen.getByRole('button', { name: /Search index setup/i })
			fireEvent.click(toggle)
			expect(screen.queryByLabelText('Index folder path')).not.toBeInTheDocument()

			rerender(
				<ObjectsGlobalSearchDrawer
					{...buildProps()}
					scopeKey="token-b:profile-1:bucket-a"
				/>,
			)

			expect(screen.getByLabelText('Index folder path')).toBeInTheDocument()
			expect(screen.getByRole('button', { name: /Search index setup/i })).toHaveAttribute('aria-expanded', 'true')
		} finally {
			consoleErrorSpy.mockRestore()
			consoleWarnSpy.mockRestore()
		}
	})

	it('renders compact result cards on mobile and wires row actions', () => {
		const onOpenPrefixForKey = vi.fn()
		const onCopyKey = vi.fn()
		const onDownloadKey = vi.fn()
		const onOpenDetails = vi.fn()

		render(
			<ObjectsGlobalSearchDrawer
				{...buildProps()}
				searchQueryText="alpha"
				items={[{ key: 'alpha.txt', size: 12, lastModified: '2024-01-01T00:00:00Z' }]}
				onOpenPrefixForKey={onOpenPrefixForKey}
				onCopyKey={onCopyKey}
				onDownloadKey={onDownloadKey}
				onOpenDetails={onOpenDetails}
			/>,
		)

		const card = screen.getByText('alpha.txt').closest('[data-global-search-result-card="true"]')
		expect(card).toBeInTheDocument()
		expect(screen.getByTestId('objects-global-search-index-card')).toBeInTheDocument()
		expect(screen.getByTestId('objects-global-search-results')).toBeInTheDocument()
		expect(screen.getByText('alpha.txt')).toHaveAttribute('data-global-search-result-key', 'true')
		expect(screen.queryByRole('table')).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Open alpha.txt' })).toHaveClass(styles.globalSearchResultPrimaryButton)
		expect(screen.getByRole('button', { name: 'Open details for alpha.txt' })).toHaveClass(styles.globalSearchResultSecondaryButton)

		fireEvent.click(screen.getByRole('button', { name: 'Open alpha.txt' }))
		fireEvent.click(screen.getByRole('button', { name: 'Copy key alpha.txt' }))
		fireEvent.click(screen.getByRole('button', { name: 'Download alpha.txt' }))
		fireEvent.click(screen.getByRole('button', { name: 'Open details for alpha.txt' }))

		expect(onOpenPrefixForKey).toHaveBeenCalledWith('alpha.txt')
		expect(onCopyKey).toHaveBeenCalledWith('alpha.txt')
		expect(onDownloadKey).toHaveBeenCalledWith('alpha.txt', 12)
		expect(onOpenDetails).toHaveBeenCalledWith('alpha.txt')
	})

	it('announces loading and result-count changes', () => {
		const { rerender } = render(
			<ObjectsGlobalSearchDrawer
				{...buildProps()}
				searchQueryText="alpha"
				isFetching
			/>,
		)

		expect(screen.getByRole('status', { name: 'Loading search results' })).toHaveTextContent('Loading results...')

		rerender(
			<ObjectsGlobalSearchDrawer
				{...buildProps()}
				searchQueryText="alpha"
				items={[{ key: 'alpha.txt', size: 12, lastModified: '2024-01-01T00:00:00Z' }]}
			/>,
		)

		expect(screen.getByRole('status')).toHaveTextContent('1 result(s)')
	})

	it('windows large result sets instead of mounting every action row', () => {
		const items = Array.from({ length: 200 }, (_, index) => ({
			key: `object-${index}.txt`,
			size: index,
			lastModified: '2024-01-01T00:00:00Z',
		}))

		render(
			<ObjectsGlobalSearchDrawer
				{...buildProps()}
				searchQueryText="object"
				items={items}
			/>,
		)

		expect(within(screen.getByTestId('objects-global-search-results')).getAllByRole('listitem')).toHaveLength(20)
		expect(screen.queryByText('object-199.txt')).not.toBeInTheDocument()
	})
})
