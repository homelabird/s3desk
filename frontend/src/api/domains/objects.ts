import type { RequestOptions } from '../retryTransport'
import type {
	CreateFolderRequest,
	CreateFolderResponse,
	DeleteObjectsResponse,
	ListLocalEntriesResponse,
	ListObjectsResponse,
	ObjectFavorite,
	ObjectFavoriteCreateRequest,
	ObjectFavoritesResponse,
	ObjectIndexSummaryResponse,
	ObjectMeta,
	PresignedURLResponse,
	SearchObjectsResponse,
} from '../types'

type RequestFn = <T>(path: string, init: RequestInit, options?: RequestOptions) => Promise<T>

function normalizeListObjectsResponse(
	resp: ListObjectsResponse,
	fallback: { bucket: string; prefix?: string; delimiter?: string },
): ListObjectsResponse {
	if (!resp || typeof resp !== 'object') {
		return {
			bucket: fallback.bucket,
			prefix: fallback.prefix ?? '',
			delimiter: fallback.delimiter ?? '/',
			commonPrefixes: [],
			items: [],
			isTruncated: false,
		}
	}
	const safe = resp as ListObjectsResponse
	const commonPrefixes = Array.isArray(safe.commonPrefixes) ? safe.commonPrefixes : []
	const items = Array.isArray(safe.items) ? safe.items : []
	return { ...safe, commonPrefixes, items }
}

export function listObjects(
	request: RequestFn,
	args: { profileId: string; bucket: string; prefix?: string; delimiter?: string; maxKeys?: number; continuationToken?: string },
): Promise<ListObjectsResponse> {
	const params = new URLSearchParams()
	if (args.prefix) params.set('prefix', args.prefix)
	if (args.delimiter) params.set('delimiter', args.delimiter)
	if (args.maxKeys) params.set('maxKeys', String(args.maxKeys))
	if (args.continuationToken) params.set('continuationToken', args.continuationToken)
	const qs = params.toString()
	return request<ListObjectsResponse>(
		`/buckets/${encodeURIComponent(args.bucket)}/objects${qs ? `?${qs}` : ''}`,
		{ method: 'GET' },
		{ profileId: args.profileId },
	).then((resp) =>
		normalizeListObjectsResponse(resp, {
			bucket: args.bucket,
			prefix: args.prefix,
			delimiter: args.delimiter,
		}),
	)
}

export function searchObjectsIndex(
	request: RequestFn,
	args: {
		profileId: string
		bucket: string
		q: string
		prefix?: string
		limit?: number
		cursor?: string
		ext?: string
		minSize?: number
		maxSize?: number
		modifiedAfter?: string
		modifiedBefore?: string
	},
): Promise<SearchObjectsResponse> {
	const params = new URLSearchParams()
	params.set('q', args.q)
	if (args.prefix) params.set('prefix', args.prefix)
	if (args.limit) params.set('limit', String(args.limit))
	if (args.cursor) params.set('cursor', args.cursor)
	if (args.ext) params.set('ext', args.ext)
	if (args.minSize != null) params.set('minSize', String(args.minSize))
	if (args.maxSize != null) params.set('maxSize', String(args.maxSize))
	if (args.modifiedAfter) params.set('modifiedAfter', args.modifiedAfter)
	if (args.modifiedBefore) params.set('modifiedBefore', args.modifiedBefore)
	return request(
		`/buckets/${encodeURIComponent(args.bucket)}/objects/search?${params.toString()}`,
		{ method: 'GET' },
		{ profileId: args.profileId },
	)
}

export function getObjectIndexSummary(
	request: RequestFn,
	args: { profileId: string; bucket: string; prefix?: string; sampleLimit?: number },
): Promise<ObjectIndexSummaryResponse> {
	const params = new URLSearchParams()
	if (args.prefix) params.set('prefix', args.prefix)
	if (args.sampleLimit != null) params.set('sampleLimit', String(args.sampleLimit))
	const qs = params.toString()
	return request(
		`/buckets/${encodeURIComponent(args.bucket)}/objects/index-summary${qs ? `?${qs}` : ''}`,
		{ method: 'GET' },
		{ profileId: args.profileId },
	)
}

export function listLocalEntries(request: RequestFn, args: { profileId: string; path?: string; limit?: number }): Promise<ListLocalEntriesResponse> {
	const params = new URLSearchParams()
	if (args.path) params.set('path', args.path)
	if (args.limit != null) params.set('limit', String(args.limit))
	const qs = params.toString()
	return request(`/local/entries${qs ? `?${qs}` : ''}`, { method: 'GET' }, { profileId: args.profileId })
}

export function getObjectMeta(request: RequestFn, args: { profileId: string; bucket: string; key: string }): Promise<ObjectMeta> {
	const params = new URLSearchParams()
	params.set('key', args.key)
	return request(
		`/buckets/${encodeURIComponent(args.bucket)}/objects/meta?${params.toString()}`,
		{ method: 'GET' },
		{ profileId: args.profileId },
	)
}

export function getObjectDownloadURL(
	request: RequestFn,
	args: {
		profileId: string
		bucket: string
		key: string
		expiresSeconds?: number
		proxy?: boolean
		size?: number
		contentType?: string
		lastModified?: string
	},
): Promise<PresignedURLResponse> {
	const params = new URLSearchParams()
	params.set('key', args.key)
	if (args.expiresSeconds) params.set('expiresSeconds', String(args.expiresSeconds))
	if (args.proxy) params.set('proxy', 'true')
	if (typeof args.size === 'number' && Number.isFinite(args.size)) {
		params.set('size', String(Math.max(0, Math.trunc(args.size))))
	}
	if (args.contentType) params.set('contentType', args.contentType)
	if (args.lastModified) params.set('lastModified', args.lastModified)
	return request(
		`/buckets/${encodeURIComponent(args.bucket)}/objects/download-url?${params.toString()}`,
		{ method: 'GET' },
		{ profileId: args.profileId },
	)
}

export function createFolder(request: RequestFn, args: { profileId: string; bucket: string; key: string }): Promise<CreateFolderResponse> {
	const req: CreateFolderRequest = { key: args.key }
	return request(
		`/buckets/${encodeURIComponent(args.bucket)}/objects/folder`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(req),
		},
		{ profileId: args.profileId },
	)
}

export function deleteObjects(request: RequestFn, args: { profileId: string; bucket: string; keys: string[] }): Promise<DeleteObjectsResponse> {
	return request(
		`/buckets/${encodeURIComponent(args.bucket)}/objects`,
		{
			method: 'DELETE',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ keys: args.keys }),
		},
		{ profileId: args.profileId },
	)
}

export function listObjectFavorites(
	request: RequestFn,
	args: { profileId: string; bucket: string; prefix?: string; hydrate?: boolean },
): Promise<ObjectFavoritesResponse> {
	const params = new URLSearchParams()
	if (args.prefix) params.set('prefix', args.prefix)
	if (typeof args.hydrate === 'boolean') params.set('hydrate', String(args.hydrate))
	const qs = params.toString()
	return request(
		`/buckets/${encodeURIComponent(args.bucket)}/objects/favorites${qs ? `?${qs}` : ''}`,
		{ method: 'GET' },
		{ profileId: args.profileId },
	)
}

export function createObjectFavorite(request: RequestFn, args: { profileId: string; bucket: string; key: string }): Promise<ObjectFavorite> {
	const payload: ObjectFavoriteCreateRequest = { key: args.key }
	return request(
		`/buckets/${encodeURIComponent(args.bucket)}/objects/favorites`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
		},
		{ profileId: args.profileId },
	)
}

export function deleteObjectFavorite(request: RequestFn, args: { profileId: string; bucket: string; key: string }): Promise<void> {
	const params = new URLSearchParams()
	params.set('key', args.key)
	return request(
		`/buckets/${encodeURIComponent(args.bucket)}/objects/favorites?${params.toString()}`,
		{ method: 'DELETE' },
		{ profileId: args.profileId },
	)
}
