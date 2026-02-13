export const DEFAULT_API_BASE_URL = '/api/v1'

export function normalizeApiBaseUrl(baseUrl: string): string {
	const trimmed = (baseUrl ?? '').trim()
	const resolved = trimmed || DEFAULT_API_BASE_URL
	// Keep concatenation predictable: `${base}${path}` where `path` starts with `/`.
	return resolved.replace(/\/+$/, '')
}

export function getApiBaseUrl(): string {
	return normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL)
}

export function buildApiHttpUrl(path: string): URL {
	const base = getApiBaseUrl()
	const url = new URL(base, window.location.origin)
	const basePath = url.pathname.replace(/\/+$/, '')
	const nextPath = path.startsWith('/') ? path : `/${path}`
	url.pathname = `${basePath}${nextPath}`
	return url
}

export function buildApiWsUrl(path: string): URL {
	const url = buildApiHttpUrl(path)
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
	return url
}

