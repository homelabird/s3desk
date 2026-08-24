import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ListObjectsResponse, ObjectItem } from '../../../api/types'
import { useObjectsListDerivedState } from '../useObjectsListDerivedState'

type Args = Parameters<typeof useObjectsListDerivedState>[0]

function page(items: ObjectItem[]): ListObjectsResponse {
	return {
		bucket: 'bucket-a',
		prefix: '',
		delimiter: '/',
		commonPrefixes: [],
		items,
		isTruncated: false,
	}
}

const baseArgs: Args = {
	deferredSearch: '',
	objectsPages: [page([
		{ key: 'b.txt', size: 2, lastModified: '2026-08-24T00:00:00Z' },
		{ key: 'a.txt', size: 1, lastModified: '2026-08-24T00:00:00Z' },
	])],
	favoriteItems: [],
	favoritesOnly: false,
	favoriteKeys: new Set(),
	prefix: '',
	extFilter: '',
	minSize: null,
	maxSize: null,
	minModifiedMs: null,
	maxModifiedMs: null,
	typeFilter: 'all',
	sort: 'name_asc',
	favoritesFirst: false,
	selectedKeys: new Set(),
}

describe('useObjectsListDerivedState', () => {
	it('keeps rows stable when an inactive favorite source changes', () => {
		const { result, rerender } = renderHook(
			(args: Args) => useObjectsListDerivedState(args),
			{ initialProps: baseArgs },
		)
		const initialRows = result.current.rows
		const initialRowIndex = result.current.rowIndexByObjectKey

		rerender({
			...baseArgs,
			favoriteItems: [{ key: 'favorite.txt', size: 3, lastModified: '2026-08-24T00:00:00Z' }],
			favoriteKeys: new Set(['b.txt']),
		})

		expect(result.current.rows).toBe(initialRows)
		expect(result.current.rowIndexByObjectKey).toBe(initialRowIndex)
	})

	it('recomputes rows when the favorite source is active', () => {
		const activeArgs = { ...baseArgs, favoritesFirst: true }
		const { result, rerender } = renderHook(
			(args: Args) => useObjectsListDerivedState(args),
			{ initialProps: activeArgs },
		)
		const initialRows = result.current.rows

		rerender({
			...activeArgs,
			favoriteKeys: new Set(['b.txt']),
		})

		expect(result.current.rows).not.toBe(initialRows)
		expect(result.current.rows.map((row) => row.kind === 'object' ? row.object.key : row.prefix)).toEqual([
			'b.txt',
			'a.txt',
		])
	})

	it('recomputes rows when the favorite-only source changes', () => {
		const activeArgs = { ...baseArgs, favoritesOnly: true }
		const { result, rerender } = renderHook(
			(args: Args) => useObjectsListDerivedState(args),
			{ initialProps: activeArgs },
		)
		const initialRows = result.current.rows

		rerender({
			...activeArgs,
			favoriteItems: [{ key: 'favorite.txt', size: 3, lastModified: '2026-08-24T00:00:00Z' }],
		})

		expect(result.current.rows).not.toBe(initialRows)
		expect(result.current.rows.map((row) => row.kind === 'object' ? row.object.key : row.prefix)).toEqual([
			'favorite.txt',
		])
	})
})
