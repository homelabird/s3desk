import { APIError } from '../../api/client'
import type { ThumbnailCacheRequest } from '../../lib/thumbnailCache'

type PreviewFetchPlanArgs = {
	size: number
	maxBytes: number
	downloadLinkProxyEnabled: boolean
	presignedDownloadSupported: boolean
}

type ObjectThumbnailRequestArgs = {
	apiToken: string
	profileId: string
	bucket: string
	objectKey: string
	size: number
	cacheKeySuffix?: string
	etag?: string | null
	lastModified?: string | null
}

type ThumbnailFailurePolicy = {
	cache: boolean
	ttlMs?: number
}

const THUMBNAIL_FAILURE_TTL_UNSUPPORTED_MS = 30 * 60 * 1000
const THUMBNAIL_FAILURE_TTL_NOT_FOUND_MS = 5 * 60 * 1000

export function getPreviewFetchPlan(args: PreviewFetchPlanArgs) {
	return {
		proxyFirst: args.downloadLinkProxyEnabled || !args.presignedDownloadSupported || args.size > args.maxBytes/2,
		allowDirect: args.presignedDownloadSupported && !args.downloadLinkProxyEnabled,
		directTimeoutMs: 1500,
	}
}

export function buildObjectThumbnailRequest(args: ObjectThumbnailRequestArgs): ThumbnailCacheRequest {
	return {
		apiToken: args.apiToken,
		profileId: args.profileId,
		bucket: args.bucket,
		objectKey: args.objectKey,
		size: args.size,
		cacheKeySuffix: args.cacheKeySuffix ?? args.etag ?? args.lastModified ?? undefined,
	}
}

export function shouldFallbackToProxy(err: unknown, signal: AbortSignal): boolean {
	if (signal.aborted) return false
	if (err instanceof Error && err.name === 'AbortError') return false
	if (err instanceof TypeError) return true
	if (err instanceof Error && /cors|failed to fetch|network/i.test(err.message)) return true
	return false
}

export function getThumbnailFailurePolicy(err: unknown): ThumbnailFailurePolicy {
	if (!(err instanceof APIError)) return { cache: false }
	if (err.code === 'too_large' || err.code === 'unsupported' || err.status === 413 || err.status === 415) {
		return { cache: true, ttlMs: THUMBNAIL_FAILURE_TTL_UNSUPPORTED_MS }
	}
	if (err.code === 'not_found' || err.status === 404) {
		return { cache: true, ttlMs: THUMBNAIL_FAILURE_TTL_NOT_FOUND_MS }
	}
	if (err.code === 'rate_limited' || err.status === 429) {
		return { cache: true, ttlMs: (err.retryAfterSeconds ?? 30) * 1000 }
	}
	return { cache: false }
}

export function shouldCacheThumbnailFailure(err: unknown): boolean {
	return getThumbnailFailurePolicy(err).cache
}

export function getThumbnailFailureTtlMs(err: unknown): number | undefined {
	return getThumbnailFailurePolicy(err).ttlMs
}
