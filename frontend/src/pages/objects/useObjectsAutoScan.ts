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
}

export function useObjectsAutoScan(args: UseObjectsAutoScanArgs): ObjectsAutoScanResult {
	const searchAutoScanCap = args.isAdvanced ? 3_000 : 1_000
	const filterAutoScanCap = args.isAdvanced ? 3_000 : 1_000
	const hasSearch = !!args.search.trim()
	const hasNonSearchFilters =
		!!args.extFilter.trim() ||
		args.minSize != null ||
		args.maxSize != null ||
		args.minModifiedMs != null ||
		args.maxModifiedMs != null ||
		args.typeFilter !== 'all'
	const autoScanReason = hasSearch && hasNonSearchFilters ? 'search+filter' : hasSearch ? 'search' : hasNonSearchFilters ? 'filter' : 'none'
	const effectiveAutoScanCap = Math.min(
		hasSearch ? searchAutoScanCap : Number.POSITIVE_INFINITY,
		hasNonSearchFilters ? filterAutoScanCap : Number.POSITIVE_INFINITY,
	)
	const autoScanCapped = Number.isFinite(effectiveAutoScanCap) && args.rawTotalCount >= effectiveAutoScanCap

	useEffect(() => {
		if (args.favoritesOnly) return
		if (!args.profileId || !args.bucket) return
		if (!args.autoScanReady) return
		if (autoScanCapped) {
			args.log(args.debugEnabled, 'debug', 'Auto-scan cap reached; skipping next page', {
				bucket: args.bucket,
				prefix: args.prefix,
				reason: autoScanReason,
				rawTotalCount: args.rawTotalCount,
				effectiveAutoScanCap,
			})
			return
		}
		const last = args.virtualItems[args.virtualItems.length - 1]
		if (!last) return
		if (last.index >= args.rowsLength - 10 && args.hasNextPage && !args.isFetchingNextPage) {
			args.log(args.debugEnabled, 'debug', 'Auto-fetching next objects page from scroll', {
				bucket: args.bucket,
				prefix: args.prefix,
				rowCount: args.rowsLength,
			})
			args.fetchNextPage().catch(() => {})
		}
	}, [
		autoScanCapped,
		autoScanReason,
		effectiveAutoScanCap,
		hasNextPage,
		args.autoScanReady,
		args.bucket,
		args.debugEnabled,
		args.favoritesOnly,
		args.fetchNextPage,
		args.hasNextPage,
		args.isFetchingNextPage,
		args.log,
		args.profileId,
		args.prefix,
		args.rawTotalCount,
		args.rowsLength,
		args.virtualItems,
	])

	useEffect(() => {
		if (args.favoritesOnly) return
		if (!args.profileId || !args.bucket) return
		if (!args.autoScanReady) return
		if (!args.search.trim()) return
		if (!args.hasNextPage || args.isFetchingNextPage) return
		if (autoScanCapped) {
			args.log(args.debugEnabled, 'debug', 'Search auto-scan cap reached; skipping next page', {
				bucket: args.bucket,
				prefix: args.prefix,
				reason: autoScanReason,
				rawTotalCount: args.rawTotalCount,
				effectiveAutoScanCap,
			})
			return
		}
		args.log(args.debugEnabled, 'debug', 'Auto-fetching next objects page for search scan', {
			bucket: args.bucket,
			prefix: args.prefix,
			rawTotalCount: args.rawTotalCount,
		})
		args.fetchNextPage().catch(() => {})
	}, [
		autoScanCapped,
		autoScanReason,
		effectiveAutoScanCap,
		args.autoScanReady,
		args.bucket,
		args.debugEnabled,
		args.favoritesOnly,
		args.fetchNextPage,
		args.hasNextPage,
		args.isFetchingNextPage,
		args.log,
		args.profileId,
		args.prefix,
		args.rawTotalCount,
		args.search,
	])

	const showLoadMore = useMemo(() => !args.favoritesOnly && autoScanCapped && args.hasNextPage, [args.favoritesOnly, autoScanCapped, args.hasNextPage])
	const loadMoreLabel = hasSearch ? 'Load more results' : hasNonSearchFilters ? 'Load more filtered items' : 'Load more'
	const handleLoadMore = useCallback(() => {
		if (!args.hasNextPage || args.isFetchingNextPage) return
		args.log(args.debugEnabled, 'debug', 'Manual load more triggered', {
			bucket: args.bucket,
			prefix: args.prefix,
			rawTotalCount: args.rawTotalCount,
			effectiveAutoScanCap,
		})
		args.fetchNextPage().catch(() => {})
	}, [
		args.bucket,
		args.debugEnabled,
		args.fetchNextPage,
		args.hasNextPage,
		args.isFetchingNextPage,
		args.log,
		args.prefix,
		args.rawTotalCount,
		effectiveAutoScanCap,
	])

	return {
		showLoadMore,
		loadMoreLabel,
		handleLoadMore,
	}
}
