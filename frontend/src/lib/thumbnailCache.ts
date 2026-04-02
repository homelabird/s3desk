export type ThumbnailCache = {
	get: (key: string) => string | undefined
	set: (key: string, url: string) => void
	findBestMatch: (args: ThumbnailCacheRequest) => ThumbnailCacheMatch | null
	isFailed: (key: string) => boolean
	markFailed: (key: string, ttlMs?: number) => void
	clear: () => void
}

export type ThumbnailCacheRequest = {
	apiToken: string
	profileId: string
	bucket: string
	objectKey: string
	size: number
	cacheKeySuffix?: string
}

export type ThumbnailCacheMatch = {
	cacheKey: string
	size: number
	url: string
}

export const THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES = 400
export const THUMBNAIL_CACHE_MIN_ENTRIES = 50
export const THUMBNAIL_CACHE_MAX_ENTRIES = 2000
const PERSISTENT_THUMBNAIL_CACHE_NAME = 's3desk-thumbnail-blobs-v1'
const PERSISTENT_THUMBNAIL_CACHE_INDEX_KEY = 's3desk-thumbnail-blobs-v1:index'
const PERSISTENT_THUMBNAIL_CACHE_PREFIX = 'https://thumbnail-cache.s3desk.local/'
export const PERSISTENT_THUMBNAIL_CACHE_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const PERSISTENT_THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES = 120
const PERSISTENT_THUMBNAIL_EXTENSIONS = new Set([
	'jpg',
	'jpeg',
	'png',
	'gif',
	'webp',
	'bmp',
	'mp4',
	'mov',
	'm4v',
	'webm',
	'mkv',
	'avi',
])
const THUMBNAIL_CACHE_KEY_VERSION = 'v3'

type CacheOptions = {
	maxEntries?: number
	failureTtlMs?: number
}

type PersistentThumbnailOptions = {
	ttlMs?: number
	maxEntries?: number
}

type PersistentThumbnailIndex = Record<string, number>

export function buildThumbnailCacheBaseKey(args: Omit<ThumbnailCacheRequest, 'size'>): string {
	return [
		THUMBNAIL_CACHE_KEY_VERSION,
		encodeURIComponent(args.apiToken),
		encodeURIComponent(args.profileId),
		encodeURIComponent(args.bucket),
		encodeURIComponent(args.objectKey),
		encodeURIComponent(args.cacheKeySuffix ?? ''),
	].join('|')
}

export function buildThumbnailCacheKey(args: ThumbnailCacheRequest): string {
	return `${buildThumbnailCacheBaseKey(args)}|${normalizeThumbnailSize(args.size)}`
}

export function shouldPersistThumbnailLocally(objectKey: string): boolean {
	const ext = objectKey.split('.').pop()?.trim().toLowerCase() ?? ''
	return PERSISTENT_THUMBNAIL_EXTENSIONS.has(ext)
}

export async function getPersistentThumbnailBlob(
	cacheKey: string,
	options: PersistentThumbnailOptions = {},
): Promise<Blob | null> {
	const match = await getReusablePersistentThumbnailBlobByCacheKey(cacheKey, options)
	return match?.blob ?? null
}

export async function getReusablePersistentThumbnailBlob(
	args: ThumbnailCacheRequest,
	options: PersistentThumbnailOptions = {},
): Promise<ThumbnailPersistentMatch | null> {
	return getReusablePersistentThumbnailBlobByCacheKey(buildThumbnailCacheKey(args), options)
}

async function getReusablePersistentThumbnailBlobByCacheKey(
	cacheKey: string,
	options: PersistentThumbnailOptions = {},
): Promise<ThumbnailPersistentMatch | null> {
	if (!supportsPersistentThumbnailCache()) return null
	try {
		const cache = await window.caches.open(PERSISTENT_THUMBNAIL_CACHE_NAME)
		const index = loadPersistentThumbnailIndex()
		const now = Date.now()
		const ttlMs = options.ttlMs ?? PERSISTENT_THUMBNAIL_CACHE_DEFAULT_TTL_MS
		let indexChanged = false
		for (const [indexedKey, updatedAt] of Object.entries(index)) {
			if (now - updatedAt <= ttlMs) continue
			await deletePersistentThumbnailEntry(cache, indexedKey)
			delete index[indexedKey]
			indexChanged = true
		}

		const requested = parseThumbnailCacheKey(cacheKey)
		const candidateKeys = requested ? findReusableCacheKeys(Object.keys(index), requested) : [cacheKey]
		for (const candidateKey of candidateKeys) {
			const response = await cache.match(buildPersistentThumbnailRequest(candidateKey))
			if (!response || !response.ok) {
				if (candidateKey in index) {
					delete index[candidateKey]
					indexChanged = true
				}
				continue
			}
			index[candidateKey] = now
			await prunePersistentThumbnailCache(cache, index, options)
			return {
				blob: await response.blob(),
				cacheKey: candidateKey,
				size: parseThumbnailCacheKey(candidateKey)?.size ?? 0,
			}
		}

		if (indexChanged) {
			savePersistentThumbnailIndex(index)
		}
		return null
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
		findBestMatch(args: ThumbnailCacheRequest) {
			const requested = parseThumbnailCacheKey(buildThumbnailCacheKey(args))
			if (!requested) return null
			const candidateKeys = findReusableCacheKeys(entries.keys(), requested)
			for (const candidateKey of candidateKeys) {
				const url = entries.get(candidateKey)
				if (!url) continue
				entries.delete(candidateKey)
				entries.set(candidateKey, url)
				return {
					cacheKey: candidateKey,
					size: parseThumbnailCacheKey(candidateKey)?.size ?? requested.size,
					url,
				}
			}
			return null
		},
		isFailed(key: string) {
			return isFailureFresh(key)
		},
		markFailed(key: string, ttlMs = failureTtlMs) {
			const existing = entries.get(key)
			if (existing) {
				entries.delete(key)
				URL.revokeObjectURL(existing)
			}
			failedEntries.set(key, Date.now() + ttlMs)
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

type ParsedThumbnailCacheKey = {
	baseKey: string
	size: number
	cacheKey: string
}

type ThumbnailPersistentMatch = {
	blob: Blob
	cacheKey: string
	size: number
}

function normalizeThumbnailSize(size: number): number {
	if (!Number.isFinite(size)) return 0
	return Math.max(0, Math.round(size))
}

function parseThumbnailCacheKey(cacheKey: string): ParsedThumbnailCacheKey | null {
	const parts = cacheKey.split('|')
	if (parts.length !== 7 || parts[0] !== THUMBNAIL_CACHE_KEY_VERSION) return null
	const size = Number(parts[6])
	if (!Number.isFinite(size) || size < 0) return null
	return {
		baseKey: parts.slice(0, 6).join('|'),
		size,
		cacheKey,
	}
}

function findReusableCacheKeys(keys: Iterable<string>, requested: ParsedThumbnailCacheKey): string[] {
	const exact: ParsedThumbnailCacheKey[] = []
	const larger: ParsedThumbnailCacheKey[] = []
	const smaller: ParsedThumbnailCacheKey[] = []

	for (const key of keys) {
		const parsed = parseThumbnailCacheKey(key)
		if (!parsed || parsed.baseKey !== requested.baseKey) continue
		if (parsed.size === requested.size) {
			exact.push(parsed)
			continue
		}
		if (parsed.size > requested.size) {
			larger.push(parsed)
			continue
		}
		smaller.push(parsed)
	}

	larger.sort((a, b) => a.size - b.size)
	smaller.sort((a, b) => b.size - a.size)
	return [...exact, ...larger, ...smaller].map((entry) => entry.cacheKey)
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
