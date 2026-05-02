import { useCallback, useMemo } from 'react'

type StringMapSetter = (
	next: Record<string, string[]> | ((prev: Record<string, string[]>) => Record<string, string[]>),
) => void

type UseObjectsPathBookmarksArgs = {
	bucket: string
	prefix: string
	pathDraft: string
	bookmarksByBucket: Record<string, string[]>
	recentPrefixesByBucket: Record<string, string[]>
	setBookmarksByBucket: StringMapSetter
	normalizePathInput: (raw: string) => string
}

export function useObjectsPathBookmarks({
	bucket,
	prefix,
	pathDraft,
	bookmarksByBucket,
	recentPrefixesByBucket,
	setBookmarksByBucket,
	normalizePathInput,
}: UseObjectsPathBookmarksArgs) {
	const pathOptions = useMemo(() => {
		if (!bucket) return []
		const bookmarks = bookmarksByBucket[bucket] ?? []
		const recent = recentPrefixesByBucket[bucket] ?? []
		const all = [...bookmarks, ...recent.filter((p) => !bookmarks.includes(p))]
		const q = pathDraft.trim().toLowerCase()
		const filtered = q ? all.filter((p) => p.toLowerCase().includes(q)) : all
		return filtered.slice(0, 30).map((p) => ({ value: p }))
	}, [bookmarksByBucket, bucket, pathDraft, recentPrefixesByBucket])

	const normalizedCurrentPrefix = normalizePathInput(prefix)
	const storedCurrentPrefix = normalizedCurrentPrefix || '/'
	const isBookmarked = !!bucket && (bookmarksByBucket[bucket] ?? []).includes(storedCurrentPrefix)

	const toggleBookmark = useCallback(() => {
		if (!bucket) return
		const p = storedCurrentPrefix
		setBookmarksByBucket((prev) => {
			const existing = prev[bucket] ?? []
			const next = existing.includes(p) ? existing.filter((v) => v !== p) : [p, ...existing].slice(0, 50)
			return { ...prev, [bucket]: next }
		})
	}, [bucket, setBookmarksByBucket, storedCurrentPrefix])

	return {
		pathOptions,
		isBookmarked,
		toggleBookmark,
	}
}
