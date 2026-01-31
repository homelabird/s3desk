import { useCallback, useEffect, useMemo } from 'react'

import type { ObjectTypeFilter } from './objectsTypes'

type LogFn = (enabled: boolean, level: 'debug' | 'warn', message: string, context?: Record<string, unknown>) => void

type UseObjectsAutoScanArgs = {
	favoritesOnly: boolean
	profileId: string | null
	bucket: string
	prefix: string
	search: string
	isAdvanced: boolean
	extFilter: string
	minSize: number | null
	maxSize: number | null
	minModifiedMs: number | null
	maxModifiedMs: number | null
	typeFilter: ObjectTypeFilter
	rawTotalCount: number
	rowsLength: number
	virtualItems: { index: number }[]
	autoScanReady: boolean
	hasNextPage: boolean
	isFetchingNextPage: boolean
	fetchNextPage: () => Promise<unknown>
	debugEnabled: boolean
	log: LogFn
}

export type ObjectsAutoScanResult = {
	showLoadMore: boolean
	loadMoreLabel: string
	handleLoadMore: () => void
	searchAutoScanCap: number
}

export function useObjectsAutoScan(args: UseObjectsAutoScanArgs): ObjectsAutoScanResult {
	const {
		favoritesOnly,
		profileId,
		bucket,
		prefix,
		search,
		isAdvanced,
		extFilter,
		minSize,
		maxSize,
		minModifiedMs,
		maxModifiedMs,
		typeFilter,
		rawTotalCount,
		rowsLength,
		virtualItems,
		autoScanReady,
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
		debugEnabled,
		log,
	} = args
	const searchAutoScanCap = isAdvanced ? 3_000 : 1_000
	const filterAutoScanCap = isAdvanced ? 3_000 : 1_000
	const hasSearch = !!search.trim()
	const hasNonSearchFilters =
		!!extFilter.trim() ||
		minSize != null ||
		maxSize != null ||
		minModifiedMs != null ||
		maxModifiedMs != null ||
		typeFilter !== 'all'
	const autoScanReason = hasSearch && hasNonSearchFilters ? 'search+filter' : hasSearch ? 'search' : hasNonSearchFilters ? 'filter' : 'none'
	const effectiveAutoScanCap = Math.min(
		hasSearch ? searchAutoScanCap : Number.POSITIVE_INFINITY,
		hasNonSearchFilters ? filterAutoScanCap : Number.POSITIVE_INFINITY,
	)
	const autoScanCapped = Number.isFinite(effectiveAutoScanCap) && rawTotalCount >= effectiveAutoScanCap

	useEffect(() => {
		if (favoritesOnly) return
		if (!profileId || !bucket) return
		if (!autoScanReady) return
		if (autoScanCapped) {
			log(debugEnabled, 'debug', 'Auto-scan cap reached; skipping next page', {
				bucket,
				prefix,
				reason: autoScanReason,
				rawTotalCount,
				effectiveAutoScanCap,
			})
			return
		}
		const last = virtualItems[virtualItems.length - 1]
		if (!last) return
		if (last.index >= rowsLength - 10 && hasNextPage && !isFetchingNextPage) {
			log(debugEnabled, 'debug', 'Auto-fetching next objects page from scroll', {
				bucket,
				prefix,
				rowCount: rowsLength,
			})
			fetchNextPage().catch(() => {})
		}
	}, [
		autoScanCapped,
		autoScanReady,
		autoScanReason,
		bucket,
		debugEnabled,
		effectiveAutoScanCap,
		favoritesOnly,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		log,
		prefix,
		profileId,
		rawTotalCount,
		rowsLength,
		virtualItems,
	])

	useEffect(() => {
		if (favoritesOnly) return
		if (!profileId || !bucket) return
		if (!autoScanReady) return
		if (!search.trim()) return
		if (!hasNextPage || isFetchingNextPage) return
		if (autoScanCapped) {
			log(debugEnabled, 'debug', 'Search auto-scan cap reached; skipping next page', {
				bucket,
				prefix,
				reason: autoScanReason,
				rawTotalCount,
				effectiveAutoScanCap,
			})
			return
		}
		log(debugEnabled, 'debug', 'Auto-fetching next objects page for search scan', {
			bucket,
			prefix,
			rawTotalCount,
		})
		fetchNextPage().catch(() => {})
	}, [
		autoScanCapped,
		autoScanReady,
		autoScanReason,
		bucket,
		debugEnabled,
		effectiveAutoScanCap,
		favoritesOnly,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		log,
		prefix,
		profileId,
		rawTotalCount,
		search,
	])

	const showLoadMore = useMemo(() => !favoritesOnly && autoScanCapped && hasNextPage, [autoScanCapped, favoritesOnly, hasNextPage])
	const loadMoreLabel = hasSearch ? 'Load more results' : hasNonSearchFilters ? 'Load more filtered items' : 'Load more'
	const handleLoadMore = useCallback(() => {
		if (!hasNextPage || isFetchingNextPage) return
		log(debugEnabled, 'debug', 'Manual load more triggered', {
			bucket,
			prefix,
			rawTotalCount,
			effectiveAutoScanCap,
		})
		fetchNextPage().catch(() => {})
	}, [
		bucket,
		debugEnabled,
		effectiveAutoScanCap,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		log,
		prefix,
		rawTotalCount,
	])

	return {
		showLoadMore,
		loadMoreLabel,
		handleLoadMore,
		searchAutoScanCap,
	}
}
