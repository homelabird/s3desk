import type { InfiniteData, QueryClient } from '@tanstack/react-query'

import { parseObjectsListQueryKey } from '../../api/queryKeys'
import type { Job, ListObjectsResponse } from '../../api/types'
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

export type ObjectsQueryLocation = {
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

function isIndexedQueryKeyRelevantToPrefix(queryKey: readonly unknown[], location: ObjectsQueryLocation): boolean {
	if (queryKey[0] !== 'objects') return false
	const kind = queryKey[1]
	const profileId = queryKey[2]
	const bucket = queryKey[3]
	if (profileId !== location.profileId || bucket !== location.bucket) return false

	if (kind === 'indexSummary') {
		const prefix = queryKey[4]
		const apiToken = queryKey[5]
		return typeof prefix === 'string' && apiToken === location.apiToken && isPrefixRelated(prefix, location.changedPrefix)
	}
	if (kind === 'indexSearch') {
		const prefix = queryKey[5]
		const apiToken = queryKey[12]
		return typeof prefix === 'string' && apiToken === location.apiToken && isPrefixRelated(prefix, location.changedPrefix)
	}
	return false
}

function isObjectCacheQueryKeyRelevant(queryKey: readonly unknown[], location: ObjectsQueryLocation): boolean {
	return isObjectsQueryKeyRelevantToPrefix(queryKey, location) || isIndexedQueryKeyRelevantToPrefix(queryKey, location)
}

export async function invalidateObjectQueriesForPrefix(queryClient: QueryClient, location: ObjectsQueryLocation): Promise<void> {
	await queryClient.invalidateQueries({
		predicate: (query) => isObjectCacheQueryKeyRelevant(query.queryKey, location),
	})
}

function payloadString(payload: Record<string, unknown>, key: string): string {
	return typeof payload[key] === 'string' ? payload[key].trim() : ''
}

function payloadBool(payload: Record<string, unknown>, key: string): boolean {
	return payload[key] === true
}

function parentPrefix(key: string): string {
	const normalized = key.replace(/^\/+/, '')
	const separator = normalized.lastIndexOf('/')
	return separator < 0 ? '' : normalized.slice(0, separator + 1)
}

function location(profileId: string, bucket: string, changedPrefix: string, apiToken: string): ObjectsQueryLocation | null {
	if (!bucket) return null
	return { profileId, bucket, changedPrefix, apiToken }
}

function addLocation(
	locations: ObjectsQueryLocation[],
	profileId: string,
	bucket: string,
	changedPrefix: string,
	apiToken: string,
) {
	const next = location(profileId, bucket, changedPrefix, apiToken)
	if (!next) return
	const key = `${next.bucket}\u0000${normalizePrefix(next.changedPrefix)}`
	if (locations.some((entry) => `${entry.bucket}\u0000${normalizePrefix(entry.changedPrefix)}` === key)) return
	locations.push(next)
}

export function objectQueryLocationsForJob(job: Job, profileId: string, apiToken: string): ObjectsQueryLocation[] {
	const payload = job.payload ?? {}
	if (payloadBool(payload, 'dryRun')) return []

	const locations: ObjectsQueryLocation[] = []
	switch (job.type) {
		case 'transfer_delete_prefix':
			addLocation(locations, profileId, payloadString(payload, 'bucket'), payloadString(payload, 'prefix'), apiToken)
			break
		case 's3_delete_objects':
			addLocation(locations, profileId, payloadString(payload, 'bucket'), '', apiToken)
			break
		case 'transfer_copy_object':
		case 'transfer_move_object':
			addLocation(locations, profileId, payloadString(payload, 'srcBucket'), parentPrefix(payloadString(payload, 'srcKey')), apiToken)
			addLocation(locations, profileId, payloadString(payload, 'dstBucket'), parentPrefix(payloadString(payload, 'dstKey')), apiToken)
			break
		case 'transfer_copy_batch':
		case 'transfer_move_batch':
			addLocation(locations, profileId, payloadString(payload, 'srcBucket'), '', apiToken)
			addLocation(locations, profileId, payloadString(payload, 'dstBucket'), '', apiToken)
			break
		case 'transfer_copy_prefix':
		case 'transfer_move_prefix':
			addLocation(locations, profileId, payloadString(payload, 'srcBucket'), payloadString(payload, 'srcPrefix'), apiToken)
			addLocation(locations, profileId, payloadString(payload, 'dstBucket'), payloadString(payload, 'dstPrefix'), apiToken)
			break
		case 's3_index_objects':
			addLocation(locations, profileId, payloadString(payload, 'bucket'), payloadString(payload, 'prefix'), apiToken)
			break
	}
	return locations
}

export async function invalidateObjectQueriesForJob(
	queryClient: QueryClient,
	job: Job,
	profileId: string,
	apiToken: string,
): Promise<void> {
	await Promise.all(
		objectQueryLocationsForJob(job, profileId, apiToken).map((location) =>
			invalidateObjectQueriesForPrefix(queryClient, location),
		),
	)
}
