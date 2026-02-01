import type { InfiniteData } from '@tanstack/react-query'

import type { Job, JobsListResponse, JobStatus } from '../../api/types'

export function statusColor(s: JobStatus): string {
	switch (s) {
		case 'queued':
			return 'default'
		case 'running':
			return 'processing'
		case 'succeeded':
			return 'success'
		case 'failed':
			return 'error'
		case 'canceled':
			return 'warning'
	}
}
export function updateJob(
	old: InfiniteData<JobsListResponse, string | undefined> | undefined,
	jobId: string,
	patch: (job: Job) => Job,
): InfiniteData<JobsListResponse, string | undefined> | undefined {
	if (!old) return old
	let changed = false
	const nextPages = old.pages.map((page) => {
		const idx = page.items.findIndex((j) => j.id === jobId)
		if (idx < 0) return page
		const nextItems = page.items.slice()
		nextItems[idx] = patch(nextItems[idx])
		changed = true
		return { ...page, items: nextItems }
	})
	if (!changed) return old
	return { ...old, pages: nextPages }
}
export function getString(payload: Record<string, unknown>, key: string): string | null {
	const v = payload[key]
	return typeof v === 'string' && v.trim() ? v : null
}
export function getNumber(payload: Record<string, unknown>, key: string): number | null {
	const v = payload[key]
	if (typeof v === 'number' && Number.isFinite(v)) return v
	if (typeof v === 'string') {
		const trimmed = v.trim()
		if (!trimmed) return null
		const parsed = Number(trimmed)
		return Number.isFinite(parsed) ? parsed : null
	}
	return null
}
export function getBool(payload: Record<string, unknown>, key: string): boolean {
	return payload[key] === true
}
export function parentPrefixFromKey(key: string): string {
	const trimmed = key.replace(/\/+$/, '')
	const parts = trimmed.split('/').filter(Boolean)
	if (parts.length <= 1) return ''
	parts.pop()
	return parts.join('/') + '/'
}
export function joinKeyWithPrefix(prefix: string, path: string): string {
	const cleanPrefix = prefix.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
	const cleanPath = path.replace(/\\/g, '/').replace(/^\/+/, '')
	if (!cleanPrefix) return cleanPath
	if (!cleanPath) return cleanPrefix
	return `${cleanPrefix}/${cleanPath}`
}
export function formatS3Destination(bucket: string | null, prefix: string | null): string | null {
	if (!bucket) return null
	const cleanPrefix = (prefix ?? '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
	return cleanPrefix ? `s3://${bucket}/${cleanPrefix}` : `s3://${bucket}/`
}
export function normalizePrefix(value: string): string {
	const trimmed = value.trim()
	if (!trimmed) return ''
	const normalized = trimmed.replace(/\\/g, '/')
	return normalized.endsWith('/') ? normalized : `${normalized}/`
}
