import { describe, expect, it } from 'vitest'

import type { ListObjectsResponse, ObjectItem } from '../../../api/types'
import { buildObjectRows, matchesSearchTokens, normalizeForSearch, splitSearchTokens } from '../objectsListUtils'

function makeItem(key: string, size: number, lastModified = '2024-01-02T00:00:00Z'): ObjectItem {
	return { key, size, lastModified }
}

function makePage(items: ObjectItem[], commonPrefixes: string[] = []): ListObjectsResponse {
	return {
		bucket: 'demo',
		prefix: '',
		delimiter: '/',
		commonPrefixes,
		items,
		isTruncated: false,
	}
}

describe('matchesSearchTokens', () => {
	it('matches normalized tokens across punctuation', () => {
		const tokens = splitSearchTokens('foo-bar')
		const normalized = tokens.map(normalizeForSearch)
		expect(matchesSearchTokens('foo bar', tokens, normalized)).toBe(true)
	})
})

describe('buildObjectRows', () => {
	it('filters by extension and type', () => {
		const items = [
			makeItem('a/file1.txt', 10),
			makeItem('b/file2.log', 5),
		]
		const rows = buildObjectRows({
			pages: [makePage(items, ['a/', 'b/'])],
			favoriteItems: [],
			favoritesOnly: false,
			favoriteKeys: new Set(),
			prefix: '',
			searchTokens: [],
			searchTokensNormalized: [],
			extFilter: 'txt',
			minSize: null,
			maxSize: null,
			minModifiedMs: null,
			maxModifiedMs: null,
			typeFilter: 'files',
			sort: 'name_asc',
			favoritesFirst: false,
		})

		expect(rows.map((row) => (row.kind === 'object' ? row.object.key : row.prefix))).toEqual(['a/file1.txt'])
	})

	it('orders favorites first when enabled', () => {
		const items = [
			makeItem('a/file1.txt', 10),
			makeItem('b/file2.log', 5),
		]
		const rows = buildObjectRows({
			pages: [makePage(items, [])],
			favoriteItems: [],
			favoritesOnly: false,
			favoriteKeys: new Set(['b/file2.log']),
			prefix: '',
			searchTokens: [],
			searchTokensNormalized: [],
			extFilter: '',
			minSize: null,
			maxSize: null,
			minModifiedMs: null,
			maxModifiedMs: null,
			typeFilter: 'files',
			sort: 'name_asc',
			favoritesFirst: true,
		})

		expect(rows.map((row) => (row.kind === 'object' ? row.object.key : row.prefix))).toEqual([
			'b/file2.log',
			'a/file1.txt',
		])
	})
})
