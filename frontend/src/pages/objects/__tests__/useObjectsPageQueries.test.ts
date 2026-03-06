import { describe, expect, it, vi } from 'vitest'

import type { ListObjectsResponse } from '../../../api/types'
import { getNextObjectsContinuationToken } from '../useObjectsPageQueries'

function buildPage(overrides: Partial<ListObjectsResponse> = {}): ListObjectsResponse {
	return {
		bucket: 'bucket-a',
		prefix: 'photos/',
		items: [{ key: 'photos/a.jpg', size: 128, lastModified: '2026-03-06T00:00:00Z' }],
		commonPrefixes: [],
		isTruncated: false,
		nextContinuationToken: undefined,
		...overrides,
	} as ListObjectsResponse
}

describe('getNextObjectsContinuationToken', () => {
	it('returns the next token for a valid truncated page', () => {
		const nextToken = getNextObjectsContinuationToken({
			lastPage: buildPage({ isTruncated: true, nextContinuationToken: 'page-2' }),
			lastPageParam: 'page-1',
			allPageParams: [undefined, 'page-1'],
			bucket: 'bucket-a',
			prefix: 'photos/',
		})

		expect(nextToken).toBe('page-2')
	})

	it('stops pagination when a truncated page is missing a continuation token', () => {
		const onWarn = vi.fn()

		const nextToken = getNextObjectsContinuationToken({
			lastPage: buildPage({ isTruncated: true, nextContinuationToken: undefined }),
			lastPageParam: 'page-1',
			allPageParams: [undefined, 'page-1'],
			bucket: 'bucket-a',
			prefix: 'photos/',
			onWarn,
		})

		expect(nextToken).toBeUndefined()
		expect(onWarn).toHaveBeenCalledWith('List objects missing continuation token; stopping pagination', {
			bucket: 'bucket-a',
			prefix: 'photos/',
		})
	})

	it('stops pagination when a truncated page returns no objects or prefixes', () => {
		const onWarn = vi.fn()

		const nextToken = getNextObjectsContinuationToken({
			lastPage: buildPage({
				isTruncated: true,
				items: [],
				commonPrefixes: [],
				nextContinuationToken: 'page-2',
			}),
			lastPageParam: 'page-1',
			allPageParams: [undefined, 'page-1'],
			bucket: 'bucket-a',
			prefix: 'photos/',
			onWarn,
		})

		expect(nextToken).toBeUndefined()
		expect(onWarn).toHaveBeenCalledWith('List objects returned empty page; stopping pagination', {
			bucket: 'bucket-a',
			prefix: 'photos/',
			nextToken: 'page-2',
		})
	})

	it('stops pagination when the next token repeats the current page token', () => {
		const onWarn = vi.fn()

		const nextToken = getNextObjectsContinuationToken({
			lastPage: buildPage({ isTruncated: true, nextContinuationToken: 'page-1' }),
			lastPageParam: 'page-1',
			allPageParams: [undefined, 'page-1'],
			bucket: 'bucket-a',
			prefix: 'photos/',
			onWarn,
		})

		expect(nextToken).toBeUndefined()
		expect(onWarn).toHaveBeenCalledWith('List objects repeated continuation token; stopping pagination', {
			bucket: 'bucket-a',
			prefix: 'photos/',
			nextToken: 'page-1',
		})
	})

	it('stops pagination when the next token was already seen earlier', () => {
		const onWarn = vi.fn()

		const nextToken = getNextObjectsContinuationToken({
			lastPage: buildPage({ isTruncated: true, nextContinuationToken: 'page-1' }),
			lastPageParam: 'page-3',
			allPageParams: [undefined, 'page-1', 'page-2', 'page-3'],
			bucket: 'bucket-a',
			prefix: 'photos/',
			onWarn,
		})

		expect(nextToken).toBeUndefined()
		expect(onWarn).toHaveBeenCalledWith('List objects hit previously seen continuation token; stopping pagination', {
			bucket: 'bucket-a',
			prefix: 'photos/',
			nextToken: 'page-1',
		})
	})
})
