import type { InfiniteData } from '@tanstack/react-query'

import type { ListObjectsResponse } from '../../api/types'
import { normalizePrefix } from './objectsListUtils'

export function getVisibleCreatedPrefix(parentPrefix: string, createdKey: string): string {
	const parent = normalizePrefix(parentPrefix)
	const created = normalizePrefix(createdKey)
	if (!created) return ''
	if (!parent || !created.startsWith(parent)) {
		const parts = created.split('/').filter(Boolean)
		return parts.length > 0 ? `${parts[0]}/` : created
	}

	const remainder = created.slice(parent.length)
	const firstSegment = remainder.split('/').filter(Boolean)[0]
	if (!firstSegment) return created
	return `${parent}${firstSegment}/`
}

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
