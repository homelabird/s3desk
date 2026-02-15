import { useInfiniteQuery } from '@tanstack/react-query'

import type { APIClient } from '../../api/client'
import { APIError } from '../../api/client'
import type { ObjectItem } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { normalizePrefix } from './objectsListUtils'

type UseObjectsIndexedSearchQueryArgs = {
	api: APIClient
	apiToken: string
	profileId: string | null
	bucket: string
	globalSearchOpen: boolean
	deferredGlobalSearch: string
	globalSearchPrefix: string
	globalSearchLimit: number
	globalSearchExt: string
	globalSearchMinSize: number | null
	globalSearchMaxSize: number | null
	globalSearchMinModifiedMs: number | null
	globalSearchMaxModifiedMs: number | null
}

export function useObjectsIndexedSearchQuery({
	api,
	apiToken,
	profileId,
	bucket,
	globalSearchOpen,
	deferredGlobalSearch,
	globalSearchPrefix,
	globalSearchLimit,
	globalSearchExt,
	globalSearchMinSize,
	globalSearchMaxSize,
	globalSearchMinModifiedMs,
	globalSearchMaxModifiedMs,
}: UseObjectsIndexedSearchQueryArgs) {
	const globalSearchQueryText = deferredGlobalSearch.trim()
	const globalSearchPrefixNormalized = normalizePrefix(globalSearchPrefix)
	const globalSearchLimitClamped = Math.max(1, Math.min(200, globalSearchLimit))
	const globalSearchExtNormalized = globalSearchExt.trim().replace(/^\./, '').toLowerCase()

	let globalSearchMinSizeBytes =
		typeof globalSearchMinSize === 'number' && Number.isFinite(globalSearchMinSize) ? globalSearchMinSize : null
	let globalSearchMaxSizeBytes =
		typeof globalSearchMaxSize === 'number' && Number.isFinite(globalSearchMaxSize) ? globalSearchMaxSize : null
	if (globalSearchMinSizeBytes != null && globalSearchMaxSizeBytes != null && globalSearchMinSizeBytes > globalSearchMaxSizeBytes) {
		;[globalSearchMinSizeBytes, globalSearchMaxSizeBytes] = [globalSearchMaxSizeBytes, globalSearchMinSizeBytes]
	}

	let globalSearchMinTimeMs =
		typeof globalSearchMinModifiedMs === 'number' && Number.isFinite(globalSearchMinModifiedMs) ? globalSearchMinModifiedMs : null
	let globalSearchMaxTimeMs =
		typeof globalSearchMaxModifiedMs === 'number' && Number.isFinite(globalSearchMaxModifiedMs) ? globalSearchMaxModifiedMs : null
	if (globalSearchMinTimeMs != null && globalSearchMaxTimeMs != null && globalSearchMinTimeMs > globalSearchMaxTimeMs) {
		;[globalSearchMinTimeMs, globalSearchMaxTimeMs] = [globalSearchMaxTimeMs, globalSearchMinTimeMs]
	}

	const globalSearchModifiedAfter = globalSearchMinTimeMs != null ? new Date(globalSearchMinTimeMs).toISOString() : undefined
	const globalSearchModifiedBefore = globalSearchMaxTimeMs != null ? new Date(globalSearchMaxTimeMs).toISOString() : undefined

	const indexedSearchQuery = useInfiniteQuery({
		queryKey: [
			'objectsIndexSearch',
			profileId,
			bucket,
			globalSearchQueryText,
			globalSearchPrefixNormalized,
			globalSearchLimitClamped,
			globalSearchExtNormalized,
			globalSearchMinSizeBytes,
			globalSearchMaxSizeBytes,
			globalSearchModifiedAfter,
			globalSearchModifiedBefore,
			apiToken,
		],
		enabled: globalSearchOpen && !!profileId && !!bucket && !!globalSearchQueryText,
		initialPageParam: undefined as string | undefined,
		queryFn: async ({ pageParam }) =>
			api.searchObjectsIndex({
				profileId: profileId!,
				bucket,
				q: globalSearchQueryText,
				prefix: globalSearchPrefixNormalized || undefined,
				limit: globalSearchLimitClamped,
				cursor: pageParam,
				ext: globalSearchExtNormalized || undefined,
				minSize: globalSearchMinSizeBytes ?? undefined,
				maxSize: globalSearchMaxSizeBytes ?? undefined,
				modifiedAfter: globalSearchModifiedAfter,
				modifiedBefore: globalSearchModifiedBefore,
			}),
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
	})

	const indexedSearchItems: ObjectItem[] = indexedSearchQuery.data?.pages.flatMap((p) => p.items) ?? []
	const indexedSearchNotIndexed =
		indexedSearchQuery.error instanceof APIError && indexedSearchQuery.error.code === 'not_indexed'
	const indexedSearchErrorMessage = indexedSearchQuery.isError ? formatErr(indexedSearchQuery.error) : ''

	return {
		globalSearchQueryText,
		globalSearchPrefixNormalized,
		globalSearchLimitClamped,
		indexedSearchQuery,
		indexedSearchItems,
		indexedSearchNotIndexed,
		indexedSearchErrorMessage,
	}
}

