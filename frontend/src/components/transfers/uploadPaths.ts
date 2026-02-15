import type { UploadFileItem } from '../../api/client'

export const normalizeRelPath = (value: string): string => {
	const trimmed = value.trim()
	if (!trimmed) return ''
	return trimmed.replace(/\\/g, '/').replace(/^\.\//, '')
}

export const resolveUploadItemPath = (item: UploadFileItem): string => {
	const rel = (item.relPath ?? '').trim()
	return rel || item.file.name
}

export const resolveUploadItemPathNormalized = (item: UploadFileItem): string => normalizeRelPath(resolveUploadItemPath(item))

export function normalizeUploadPath(value: string): string {
	const trimmed = value.trim()
	if (!trimmed) return ''
	const normalized = trimmed.replace(/\\/g, '/').replace(/^\/+/, '')
	const parts = normalized.split('/').filter(Boolean)
	const cleaned: string[] = []
	for (const part of parts) {
		if (part === '.' || part === '') continue
		if (part === '..') {
			if (cleaned.length === 0) return ''
			cleaned.pop()
			continue
		}
		if (part.includes('\u0000')) return ''
		cleaned.push(part)
	}
	return cleaned.length ? cleaned.join('/') : ''
}

