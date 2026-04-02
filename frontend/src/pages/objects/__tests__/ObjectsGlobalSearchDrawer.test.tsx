import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ObjectsGlobalSearchDrawer } from '../ObjectsGlobalSearchDrawer'

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
	it('resets the index panel disclosure state when the scope changes', () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
		const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		try {
			const { rerender } = render(<ObjectsGlobalSearchDrawer {...buildProps()} />)

			const toggle = screen.getByRole('button', { name: /Index management/i })
			fireEvent.click(toggle)
			expect(screen.queryByLabelText('Index prefix')).not.toBeInTheDocument()

			rerender(
				<ObjectsGlobalSearchDrawer
					{...buildProps()}
					scopeKey="token-b:profile-1:bucket-a"
				/>,
			)

			expect(screen.getByLabelText('Index prefix')).toBeInTheDocument()
			expect(screen.getByRole('button', { name: /Index management/i })).toHaveAttribute('aria-expanded', 'true')
		} finally {
			consoleErrorSpy.mockRestore()
			consoleWarnSpy.mockRestore()
		}
	})
})
