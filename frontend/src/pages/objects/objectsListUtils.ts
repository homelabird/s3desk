import type { ListObjectsResponse, ObjectItem } from '../../api/types'
import { parseTimeMs } from '../../lib/format'
import type { ObjectSort, ObjectTypeFilter } from './objectsTypes'

export type ObjectRow =
	| { kind: 'prefix'; prefix: string }
	| { kind: 'object'; object: ObjectItem }

export function splitLines(v: string): string[] {
	return v
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean)
}

export function splitSearchTokens(value: string): string[] {
	return value
		.trim()
		.split(/\s+/)
		.map((s) => s.trim())
		.filter(Boolean)
}

export function normalizeForSearch(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, '')
}

export function matchesSearchTokens(value: string, tokens: string[], normalizedTokens?: string[]): boolean {
	if (tokens.length === 0) return true
	const raw = value.toLowerCase()
	let normalizedRaw: string | null = null

	for (let i = 0; i < tokens.length; i++) {
		const rawToken = tokens[i]?.toLowerCase() ?? ''
		if (!rawToken) continue
		if (raw.includes(rawToken)) continue

		const normalizedToken = normalizedTokens?.[i] ?? normalizeForSearch(rawToken)
		if (!normalizedToken) return false

		if (normalizedRaw === null) normalizedRaw = normalizeForSearch(raw)
		if (!normalizedRaw.includes(normalizedToken)) return false
	}
	return true
}

export function clampNumber(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min
	if (max < min) return min
	return Math.max(min, Math.min(max, value))
}

export function treeKeyFromPrefix(prefix: string): string {
	const p = normalizePrefix(prefix)
	return p ? p : '/'
}

export function treeAncestorKeys(prefixKey: string): string[] {
	if (!prefixKey || prefixKey === '/') return ['/']
	const normalized = normalizePrefix(prefixKey)
	const parts = normalized.split('/').filter(Boolean)
	const out: string[] = ['/']
	let current = ''
	for (const part of parts) {
		current += part + '/'
		out.push(current)
	}
	return out
}

export function folderLabelFromPrefix(prefix: string): string {
	const trimmed = prefix.replace(/\/+$/, '')
	const parts = trimmed.split('/').filter(Boolean)
	return parts.length ? parts[parts.length - 1] : prefix
}

export function fileNameFromKey(key: string): string {
	const trimmed = key.replace(/\/+$/, '')
	const parts = trimmed.split('/').filter(Boolean)
	return parts.length ? parts[parts.length - 1] : trimmed || key
}

export function displayNameForKey(key: string, currentPrefix: string): string {
	const p = normalizePrefix(currentPrefix)
	if (!p) return key
	if (!key.startsWith(p)) return key
	return key.slice(p.length) || key
}

export function displayNameForPrefix(prefix: string, currentPrefix: string): string {
	const p = normalizePrefix(currentPrefix)
	if (!p) return prefix
	if (!prefix.startsWith(p)) return prefix
	return prefix.slice(p.length) || prefix
}

export function normalizePrefix(p: string): string {
	const trimmed = p.trim()
	if (!trimmed) return ''
	return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

export function parentPrefixFromKey(key: string): string {
	const trimmed = key.replace(/\/+$/, '')
	const parts = trimmed.split('/').filter(Boolean)
	if (parts.length <= 1) return ''
	parts.pop()
	return parts.join('/') + '/'
}

export function suggestCopyPrefix(srcPrefix: string): string {
	const base = srcPrefix.replace(/\/+$/, '')
	if (!base) return 'copy/'
	return `${base}-copy/`
}

export function uniquePrefixes(pages: ListObjectsResponse[]): string[] {
	const set = new Set<string>()
	for (const p of pages) {
		const commonPrefixes = Array.isArray(p.commonPrefixes) ? p.commonPrefixes : []
		for (const cp of commonPrefixes) {
			set.add(cp)
		}
	}
	return Array.from(set).sort((a, b) => a.localeCompare(b))
}

export function fileExtensionFromKey(key: string): string {
	const base = key.split('/').filter(Boolean).pop() ?? ''
	const idx = base.lastIndexOf('.')
	if (idx <= 0 || idx === base.length - 1) return ''
	return base.slice(idx + 1).toLowerCase()
}

export function isImageKey(key: string): boolean {
	const ext = fileExtensionFromKey(key)
	return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)
}

export function guessPreviewKind(
	contentType: string | null | undefined,
	key: string,
): 'image' | 'text' | 'json' | 'unsupported' {
	const ct = (contentType ?? '').toLowerCase()
	if (ct.startsWith('image/')) return 'image'
	if (ct.includes('json')) return 'json'
	if (ct.startsWith('text/') || ct.includes('xml') || ct.includes('yaml') || ct.includes('csv') || ct.includes('log')) return 'text'

	const ext = fileExtensionFromKey(key)
	if (ext === 'json') return 'json'
	if (ext === 'svg') return 'text'
	if (['txt', 'log', 'md', 'csv', 'tsv', 'yml', 'yaml', 'xml'].includes(ext)) return 'text'
	if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'image'
	return 'unsupported'
}

export type BuildObjectRowsArgs = {
	pages: ListObjectsResponse[]
	favoriteItems: ObjectItem[]
	favoritesOnly: boolean
	favoriteKeys: Set<string>
	prefix: string
	searchTokens: string[]
	searchTokensNormalized: string[]
	extFilter: string
	minSize: number | null
	maxSize: number | null
	minModifiedMs: number | null
	maxModifiedMs: number | null
	typeFilter: ObjectTypeFilter
	sort: ObjectSort
	favoritesFirst: boolean
}

export function buildObjectRows(args: BuildObjectRowsArgs): ObjectRow[] {
	const pages = Array.isArray(args.pages) ? args.pages : []
	const activePrefix = normalizePrefix(args.prefix)
	const prefixes = args.favoritesOnly ? [] : uniquePrefixes(pages)
	const items = args.favoritesOnly
		? args.favoriteItems.filter((item) => (activePrefix ? item.key.startsWith(activePrefix) : true))
		: pages.flatMap((p) => p.items)

	const match = (value: string) => matchesSearchTokens(value, args.searchTokens, args.searchTokensNormalized)

	const filteredPrefixes = prefixes.filter((p) => match(displayNameForPrefix(p, args.prefix)) || match(p))
	const ext = args.extFilter.trim().replace(/^\./, '').toLowerCase()
	let min = typeof args.minSize === 'number' && Number.isFinite(args.minSize) ? args.minSize : null
	let max = typeof args.maxSize === 'number' && Number.isFinite(args.maxSize) ? args.maxSize : null
	if (min != null && max != null && min > max) {
		;[min, max] = [max, min]
	}
	let minTime = typeof args.minModifiedMs === 'number' && Number.isFinite(args.minModifiedMs) ? args.minModifiedMs : null
	let maxTime = typeof args.maxModifiedMs === 'number' && Number.isFinite(args.maxModifiedMs) ? args.maxModifiedMs : null
	if (minTime != null && maxTime != null && minTime > maxTime) {
		;[minTime, maxTime] = [maxTime, minTime]
	}

	const filteredItems = items
		.filter((o) => match(displayNameForKey(o.key, args.prefix)) || match(o.key))
		.filter((o) => {
			if (ext) {
				if (fileExtensionFromKey(o.key) !== ext) return false
			}
			const size = o.size ?? 0
			if (min != null && size < min) return false
			if (max != null && size > max) return false
			if (minTime != null || maxTime != null) {
				const modified = parseTimeMs(o.lastModified)
				if (!modified) return false
				if (minTime != null && modified < minTime) return false
				if (maxTime != null && modified > maxTime) return false
			}
			return true
		})

	const visiblePrefixes = args.typeFilter === 'files' ? [] : filteredPrefixes
	const visibleItems = args.typeFilter === 'folders' ? [] : filteredItems

	const sortedPrefixes = [...visiblePrefixes].sort((a, b) => (args.sort === 'name_desc' ? b.localeCompare(a) : a.localeCompare(b)))
	const sortedItems = [...visibleItems].sort((a, b) => {
		switch (args.sort) {
			case 'name_asc':
				return a.key.localeCompare(b.key)
			case 'name_desc':
				return b.key.localeCompare(a.key)
			case 'size_asc':
				return (a.size ?? 0) - (b.size ?? 0) || a.key.localeCompare(b.key)
			case 'size_desc':
				return (b.size ?? 0) - (a.size ?? 0) || a.key.localeCompare(b.key)
			case 'time_asc':
				return parseTimeMs(a.lastModified) - parseTimeMs(b.lastModified) || a.key.localeCompare(b.key)
			case 'time_desc':
				return parseTimeMs(b.lastModified) - parseTimeMs(a.lastModified) || a.key.localeCompare(b.key)
			default:
				return a.key.localeCompare(b.key)
		}
	})
	const orderedItems = args.favoritesFirst
		? sortedItems.reduce<{ favorites: ObjectItem[]; rest: ObjectItem[] }>(
				(acc, item) => {
					if (args.favoriteKeys.has(item.key)) acc.favorites.push(item)
					else acc.rest.push(item)
					return acc
				},
				{ favorites: [], rest: [] },
			)
		: null

	const out: ObjectRow[] = []
	for (const p of sortedPrefixes) out.push({ kind: 'prefix', prefix: p })
	if (orderedItems) {
		for (const obj of orderedItems.favorites) out.push({ kind: 'object', object: obj })
		for (const obj of orderedItems.rest) out.push({ kind: 'object', object: obj })
	} else {
		for (const obj of sortedItems) out.push({ kind: 'object', object: obj })
	}
	return out
}
