export type ThumbnailCache = {
	get: (key: string) => string | undefined
	set: (key: string, url: string) => void
	isFailed: (key: string) => boolean
	markFailed: (key: string) => void
	clear: () => void
}

export const THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES = 400
export const THUMBNAIL_CACHE_MIN_ENTRIES = 50
export const THUMBNAIL_CACHE_MAX_ENTRIES = 2000
const PERSISTENT_THUMBNAIL_CACHE_NAME = 's3desk-thumbnail-blobs-v1'
const PERSISTENT_THUMBNAIL_CACHE_INDEX_KEY = 's3desk-thumbnail-blobs-v1:index'
const PERSISTENT_THUMBNAIL_CACHE_PREFIX = 'https://thumbnail-cache.s3desk.local/'
export const PERSISTENT_THUMBNAIL_CACHE_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const PERSISTENT_THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES = 120
const VIDEO_THUMBNAIL_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'])

type CacheOptions = {
	maxEntries?: number
	failureTtlMs?: number
}

type PersistentThumbnailOptions = {
	ttlMs?: number
	maxEntries?: number
}

type PersistentThumbnailIndex = Record<string, number>

export function buildThumbnailCacheKey(args: {
	profileId: string
	bucket: string
	objectKey: string
	size: number
	cacheKeySuffix?: string
}): string {
	const suffix = args.cacheKeySuffix ? `:${args.cacheKeySuffix}` : ''
	return `${args.profileId}:${args.bucket}:${args.objectKey}:${args.size}${suffix}`
}

export function shouldPersistThumbnailLocally(objectKey: string): boolean {
	const ext = objectKey.split('.').pop()?.trim().toLowerCase() ?? ''
	return VIDEO_THUMBNAIL_EXTENSIONS.has(ext)
}

export async function getPersistentThumbnailBlob(
	cacheKey: string,
	options: PersistentThumbnailOptions = {},
): Promise<Blob | null> {
	if (!supportsPersistentThumbnailCache()) return null
	try {
		const cache = await window.caches.open(PERSISTENT_THUMBNAIL_CACHE_NAME)
		const index = loadPersistentThumbnailIndex()
		const now = Date.now()
		const ttlMs = options.ttlMs ?? PERSISTENT_THUMBNAIL_CACHE_DEFAULT_TTL_MS
		const updatedAt = index[cacheKey]
		if (typeof updatedAt === 'number' && now-updatedAt > ttlMs) {
			await deletePersistentThumbnailEntry(cache, cacheKey)
			delete index[cacheKey]
			savePersistentThumbnailIndex(index)
			return null
		}
		const response = await cache.match(buildPersistentThumbnailRequest(cacheKey))
		if (!response || !response.ok) {
			if (cacheKey in index) {
				delete index[cacheKey]
				savePersistentThumbnailIndex(index)
			}
			return null
		}
		index[cacheKey] = now
		await prunePersistentThumbnailCache(cache, index, options)
		return await response.blob()
	} catch {
		return null
	}
}

export async function setPersistentThumbnailBlob(
	cacheKey: string,
	blob: Blob,
	options: PersistentThumbnailOptions = {},
): Promise<void> {
	if (!supportsPersistentThumbnailCache()) return
	try {
		const cache = await window.caches.open(PERSISTENT_THUMBNAIL_CACHE_NAME)
		await cache.put(
			buildPersistentThumbnailRequest(cacheKey),
			new Response(blob, {
				status: 200,
				headers: {
					'content-type': blob.type || 'application/octet-stream',
					'cache-control': 'private, max-age=2592000',
				},
			}),
		)
		const index = loadPersistentThumbnailIndex()
		index[cacheKey] = Date.now()
		await prunePersistentThumbnailCache(cache, index, options)
	} catch {
		// ignore persistent cache failures
	}
}

export function createThumbnailCache(options: CacheOptions = {}): ThumbnailCache {
	const entries = new Map<string, string>()
	const failedEntries = new Map<string, number>()
	const maxEntries = options.maxEntries ?? THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES
	const failureTtlMs = options.failureTtlMs ?? 5 * 60 * 1000

	const isFailureFresh = (key: string): boolean => {
		const expiresAt = failedEntries.get(key)
		if (!expiresAt) return false
		if (expiresAt <= Date.now()) {
			failedEntries.delete(key)
			return false
		}
		return true
	}

	const prune = () => {
		while (entries.size > maxEntries) {
			const first = entries.entries().next().value as [string, string] | undefined
			if (!first) return
			const [, url] = first
			entries.delete(first[0])
			URL.revokeObjectURL(url)
		}
	}

		return {
		get(key: string) {
			isFailureFresh(key)
			const url = entries.get(key)
			if (!url) return undefined
			entries.delete(key)
			entries.set(key, url)
			return url
		},
		set(key: string, url: string) {
			failedEntries.delete(key)
			const existing = entries.get(key)
			if (existing) {
				if (existing !== url) {
					URL.revokeObjectURL(existing)
				}
				entries.delete(key)
			}
			entries.set(key, url)
			prune()
		},
		isFailed(key: string) {
			return isFailureFresh(key)
		},
		markFailed(key: string) {
			const existing = entries.get(key)
			if (existing) {
				entries.delete(key)
				URL.revokeObjectURL(existing)
			}
			failedEntries.set(key, Date.now() + failureTtlMs)
		},
		clear() {
			for (const url of entries.values()) {
				URL.revokeObjectURL(url)
			}
			entries.clear()
			failedEntries.clear()
		},
	}
}

function supportsPersistentThumbnailCache(): boolean {
	return typeof window !== 'undefined' && 'caches' in window && typeof window.caches?.open === 'function'
}

function buildPersistentThumbnailRequest(cacheKey: string): Request {
	return new Request(`${PERSISTENT_THUMBNAIL_CACHE_PREFIX}${encodeURIComponent(cacheKey)}`)
}

function loadPersistentThumbnailIndex(): PersistentThumbnailIndex {
	if (typeof window === 'undefined' || !window.localStorage) return {}
	try {
		const raw = window.localStorage.getItem(PERSISTENT_THUMBNAIL_CACHE_INDEX_KEY)
		if (!raw) return {}
		const parsed = JSON.parse(raw) as PersistentThumbnailIndex
		if (!parsed || typeof parsed !== 'object') return {}
		return Object.fromEntries(
			Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[0] === 'string' && typeof entry[1] === 'number'),
		)
	} catch {
		return {}
	}
}

function savePersistentThumbnailIndex(index: PersistentThumbnailIndex): void {
	if (typeof window === 'undefined' || !window.localStorage) return
	try {
		window.localStorage.setItem(PERSISTENT_THUMBNAIL_CACHE_INDEX_KEY, JSON.stringify(index))
	} catch {
		// ignore storage failures
	}
}

async function prunePersistentThumbnailCache(
	cache: Cache,
	index: PersistentThumbnailIndex,
	options: PersistentThumbnailOptions,
): Promise<void> {
	const now = Date.now()
	const ttlMs = options.ttlMs ?? PERSISTENT_THUMBNAIL_CACHE_DEFAULT_TTL_MS
	const maxEntries = options.maxEntries ?? PERSISTENT_THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES

	for (const [cacheKey, updatedAt] of Object.entries(index)) {
		if (now-updatedAt <= ttlMs) continue
		await deletePersistentThumbnailEntry(cache, cacheKey)
		delete index[cacheKey]
	}

	const orderedKeys = Object.entries(index)
		.sort((a, b) => a[1] - b[1])
		.map(([cacheKey]) => cacheKey)
	while (orderedKeys.length > maxEntries) {
		const oldestKey = orderedKeys.shift()
		if (!oldestKey) break
		await deletePersistentThumbnailEntry(cache, oldestKey)
		delete index[oldestKey]
	}

	savePersistentThumbnailIndex(index)
}

async function deletePersistentThumbnailEntry(cache: Cache, cacheKey: string): Promise<void> {
	await cache.delete(buildPersistentThumbnailRequest(cacheKey))
}
