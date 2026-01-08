export type ThumbnailCache = {
	get: (key: string) => string | undefined
	set: (key: string, url: string) => void
	clear: () => void
}

export const THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES = 400
export const THUMBNAIL_CACHE_MIN_ENTRIES = 50
export const THUMBNAIL_CACHE_MAX_ENTRIES = 2000

type CacheOptions = {
	maxEntries?: number
}

export function createThumbnailCache(options: CacheOptions = {}): ThumbnailCache {
	const entries = new Map<string, string>()
	const maxEntries = options.maxEntries ?? THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES

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
			const url = entries.get(key)
			if (!url) return undefined
			entries.delete(key)
			entries.set(key, url)
			return url
		},
		set(key: string, url: string) {
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
		clear() {
			for (const url of entries.values()) {
				URL.revokeObjectURL(url)
			}
			entries.clear()
		},
	}
}
