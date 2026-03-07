import { describe, expect, it } from 'vitest'

import { getVisibleCreatedPrefix, insertOptimisticPrefixIntoObjectsData } from '../objectsQueryCache'

describe('objectsQueryCache', () => {
	it('derives the visible created prefix relative to the current parent prefix', () => {
		expect(getVisibleCreatedPrefix('', 'alpha/beta/')).toBe('alpha/')
		expect(getVisibleCreatedPrefix('alpha/', 'alpha/beta/gamma/')).toBe('alpha/beta/')
	})

	it('optimistically inserts a prefix into the first objects page', () => {
		const data = {
			pages: [
				{
					bucket: 'bucket-a',
					prefix: '',
					delimiter: '/',
					commonPrefixes: ['existing/'],
					items: [],
					isTruncated: false,
				},
			],
			pageParams: [undefined],
		}

		const next = insertOptimisticPrefixIntoObjectsData(data, 'alpha/')
		expect(next?.pages[0]?.commonPrefixes).toEqual(['alpha/', 'existing/'])
	})

	it('does not duplicate an already inserted prefix', () => {
		const data = {
			pages: [
				{
					bucket: 'bucket-a',
					prefix: '',
					delimiter: '/',
					commonPrefixes: ['alpha/'],
					items: [],
					isTruncated: false,
				},
			],
			pageParams: [undefined],
		}

		expect(insertOptimisticPrefixIntoObjectsData(data, 'alpha/')).toBe(data)
	})
})
