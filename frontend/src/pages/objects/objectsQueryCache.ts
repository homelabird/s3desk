import type { InfiniteData, QueryClient } from '@tanstack/react-query'

import { parseObjectsListQueryKey } from '../../api/queryKeys'
import type { ListObjectsResponse } from '../../api/types'
import { normalizePrefix } from './objectsListUtils'
import { getVisibleCreatedPrefix } from './objectsCreatedPrefix'

export { getVisibleCreatedPrefix }

export function insertOptimisticPrefixIntoObjectsData(
	data: InfiniteData<ListObjectsResponse, string | undefined> | undefined,
	optimisticPrefix: string,
): InfiniteData<ListObjectsResponse, string | undefined> | undefined {
	if (!data || !optimisticPrefix) return data

	const firstPage = data.pages[0]
	if (!firstPage) return data

	const currentPrefixes = Array.isArray(firstPage.commonPrefixes) ? firstPage.commonPrefixes : []
	if (currentPrefixes.includes(optimisticPrefix)) return data

	const nextFirstPage: ListObjectsResponse = {
		...firstPage,
		commonPrefixes: [...currentPrefixes, optimisticPrefix].sort((a, b) => a.localeCompare(b)),
	}

	return {
		...data,
		pages: [nextFirstPage, ...data.pages.slice(1)],
	}
}

export function hasVisiblePrefixInObjectsData(
	data: InfiniteData<ListObjectsResponse, string | undefined> | undefined,
	prefix: string,
): boolean {
	if (!data || !prefix) return false
	for (const page of data.pages) {
		if (Array.isArray(page.commonPrefixes) && page.commonPrefixes.includes(prefix)) {
			return true
		}
	}
	return false
}

type ObjectsQueryLocation = {
	profileId: string
	bucket: string
	changedPrefix: string
	apiToken: string
}

function isPrefixRelated(queryPrefix: string, changedPrefix: string): boolean {
	const normalizedQueryPrefix = normalizePrefix(queryPrefix)
	const normalizedChangedPrefix = normalizePrefix(changedPrefix)
	if (!normalizedChangedPrefix) return true
	if (!normalizedQueryPrefix) return true
	return normalizedChangedPrefix.startsWith(normalizedQueryPrefix) || normalizedQueryPrefix.startsWith(normalizedChangedPrefix)
}

export function isObjectsQueryKeyRelevantToPrefix(
	queryKey: readonly unknown[],
	location: ObjectsQueryLocation,
): boolean {
	const parsed = parseObjectsListQueryKey(queryKey)
	if (!parsed) return false
	if (parsed.profileId !== location.profileId) return false
	if (parsed.bucket !== location.bucket) return false
	if (parsed.apiToken !== location.apiToken) return false
	return isPrefixRelated(parsed.prefix, location.changedPrefix)
}

export async function invalidateObjectQueriesForPrefix(queryClient: QueryClient, location: ObjectsQueryLocation): Promise<void> {
	await queryClient.invalidateQueries({
		predicate: (query) => isObjectsQueryKeyRelevantToPrefix(query.queryKey, location),
	})
}
