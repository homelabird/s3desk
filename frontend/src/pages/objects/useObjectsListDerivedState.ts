import { useMemo } from 'react'

import type { ListObjectsResponse, ObjectItem } from '../../api/types'
import type { ObjectRow } from './objectsListUtils'
import {
	buildObjectRows,
	fileExtensionFromKey,
	normalizeForSearch,
	normalizePrefix,
	splitSearchTokens,
	uniquePrefixes,
} from './objectsListUtils'
import type { ObjectSort, ObjectTypeFilter } from './objectsTypes'
import type { SearchHighlightResult } from './useSearchHighlight'
import { useSearchHighlight } from './useSearchHighlight'

export type ObjectsListDerivedState = {
	searchTokens: string[]
	searchTokensNormalized: string[]
	highlightText: SearchHighlightResult['highlightText']
	rows: ObjectRow[]
	rowIndexByObjectKey: Map<string, number>
	rawPrefixCount: number
	rawFileCount: number
	rawTotalCount: number
	emptyKind: 'empty' | 'noresults' | null
	visibleObjectKeys: string[]
	orderedVisibleObjectKeys: string[]
	visiblePrefixCount: number
	visibleFileCount: number
	loadedSelectedCount: number
	allLoadedSelected: boolean
	someLoadedSelected: boolean
	extOptions: Array<{ label: string; value: string }>
}

export function useObjectsListDerivedState(args: {
	deferredSearch: string
	objectsPages: ListObjectsResponse[]
	favoriteItems: ObjectItem[]
	favoritesOnly: boolean
	favoriteKeys: Set<string>
	prefix: string
	extFilter: string
	minSize: number | null
	maxSize: number | null
	minModifiedMs: number | null
	maxModifiedMs: number | null
	typeFilter: ObjectTypeFilter
	sort: ObjectSort
	favoritesFirst: boolean
	selectedKeys: Set<string>
}): ObjectsListDerivedState {
	const searchTokens = useMemo(() => splitSearchTokens(args.deferredSearch), [args.deferredSearch])
	const searchTokensNormalized = useMemo(() => searchTokens.map((token) => normalizeForSearch(token)), [searchTokens])
	const { highlightText } = useSearchHighlight(searchTokens)

	const rows: ObjectRow[] = useMemo(
		() =>
			buildObjectRows({
				pages: args.objectsPages,
				favoriteItems: args.favoriteItems,
				favoritesOnly: args.favoritesOnly,
				favoriteKeys: args.favoriteKeys,
				prefix: args.prefix,
				searchTokens,
				searchTokensNormalized,
				extFilter: args.extFilter,
				minSize: args.minSize,
				maxSize: args.maxSize,
				minModifiedMs: args.minModifiedMs,
				maxModifiedMs: args.maxModifiedMs,
				typeFilter: args.typeFilter,
				sort: args.sort,
				favoritesFirst: args.favoritesFirst,
			}),
		[
			args.extFilter,
			args.favoriteItems,
			args.favoriteKeys,
			args.favoritesFirst,
			args.favoritesOnly,
			args.maxModifiedMs,
			args.maxSize,
			args.minModifiedMs,
			args.minSize,
			args.objectsPages,
			args.prefix,
			args.sort,
			args.typeFilter,
			searchTokens,
			searchTokensNormalized,
		],
	)

	const { rowIndexByObjectKey, visibleObjectKeys, orderedVisibleObjectKeys, visiblePrefixCount, visibleFileCount } = useMemo(() => {
		const indexMap = new Map<string, number>()
		const uniqueKeys = new Set<string>()
		const ordered: string[] = []
		let prefixCount = 0
		let fileCount = 0
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i]
			if (row && row.kind === 'object') {
				indexMap.set(row.object.key, i)
				uniqueKeys.add(row.object.key)
				ordered.push(row.object.key)
				fileCount++
			} else if (row && row.kind === 'prefix') {
				prefixCount++
			}
		}
		return {
			rowIndexByObjectKey: indexMap,
			visibleObjectKeys: Array.from(uniqueKeys),
			orderedVisibleObjectKeys: ordered,
			visiblePrefixCount: prefixCount,
			visibleFileCount: fileCount,
		}
	}, [rows])

	const { rawPrefixCount, rawFileCount } = useMemo(() => {
		if (args.favoritesOnly) {
			const activePrefix = normalizePrefix(args.prefix)
			const items = activePrefix ? args.favoriteItems.filter((item) => item.key.startsWith(activePrefix)) : args.favoriteItems
			return { rawPrefixCount: 0, rawFileCount: items.length }
		}
		return {
			rawPrefixCount: uniquePrefixes(args.objectsPages).length,
			rawFileCount: args.objectsPages.reduce((sum, p) => sum + p.items.length, 0),
		}
	}, [args.favoriteItems, args.favoritesOnly, args.objectsPages, args.prefix])

	const rawTotalCount = rawPrefixCount + rawFileCount
	const emptyKind = rawTotalCount === 0 ? 'empty' : rows.length === 0 ? 'noresults' : null

	const loadedSelectedCount = useMemo(() => {
		if (visibleObjectKeys.length === 0 || args.selectedKeys.size === 0) return 0
		let count = 0
		for (const k of visibleObjectKeys) {
			if (args.selectedKeys.has(k)) count++
		}
		return count
	}, [args.selectedKeys, visibleObjectKeys])
	const allLoadedSelected = visibleObjectKeys.length > 0 && loadedSelectedCount === visibleObjectKeys.length
	const someLoadedSelected = loadedSelectedCount > 0 && loadedSelectedCount < visibleObjectKeys.length

	const extOptions = useMemo(() => {
		const counts = new Map<string, number>()
		for (const page of args.objectsPages) {
			for (const obj of page.items) {
				const ext = fileExtensionFromKey(obj.key)
				if (!ext) continue
				counts.set(ext, (counts.get(ext) ?? 0) + 1)
			}
		}
		return Array.from(counts.entries())
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.slice(0, 20)
			.map(([ext, count]) => ({ label: `.${ext} (${count})`, value: ext }))
	}, [args.objectsPages])

	return {
		searchTokens,
		searchTokensNormalized,
		highlightText,
		rows,
		rowIndexByObjectKey,
		rawPrefixCount,
		rawFileCount,
		rawTotalCount,
		emptyKind,
		visibleObjectKeys,
		orderedVisibleObjectKeys,
		visiblePrefixCount,
		visibleFileCount,
		loadedSelectedCount,
		allLoadedSelected,
		someLoadedSelected,
		extOptions,
	}
}

