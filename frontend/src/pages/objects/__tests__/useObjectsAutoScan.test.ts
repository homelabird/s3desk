import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useObjectsAutoScan } from '../useObjectsAutoScan'

describe('useObjectsAutoScan favorites pagination', () => {
	it('offers an explicit next-page action without auto-fetching more favorites', () => {
		const fetchNextPage = vi.fn().mockResolvedValue(undefined)
		const { result } = renderHook(() => useObjectsAutoScan({
			favoritesOnly: true,
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: '',
			search: '',
			isAdvanced: false,
			extFilter: '',
			minSize: null,
			maxSize: null,
			minModifiedMs: null,
			maxModifiedMs: null,
			typeFilter: 'all',
			rawTotalCount: 0,
			rowsLength: 1000,
			virtualItems: [{ index: 999 }],
			autoScanReady: true,
			hasNextPage: true,
			isFetchingNextPage: false,
			fetchNextPage,
			debugEnabled: false,
			log: vi.fn(),
		}))

		expect(result.current.showLoadMore).toBe(true)
		expect(result.current.loadMoreLabel).toBe('Load more favorites')
		expect(fetchNextPage).not.toHaveBeenCalled()
		result.current.handleLoadMore()
		expect(fetchNextPage).toHaveBeenCalledOnce()
	})
})
