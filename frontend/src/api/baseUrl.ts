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

export function buildApiHttpUrlFor(baseUrl: string, path: string, origin: string): URL {
	const base = normalizeApiBaseUrl(baseUrl)
	const url = new URL(base, origin)
	const basePath = url.pathname.replace(/\/+$/, '')
	const nextPath = path.startsWith('/') ? path : `/${path}`
	url.pathname = `${basePath}${nextPath}`
	return url
}

export function buildApiHttpUrl(path: string): URL {
	return buildApiHttpUrlFor(getApiBaseUrl(), path, window.location.origin)
}

export function buildApiWsUrlFor(baseUrl: string, path: string, origin: string): URL {
	const url = buildApiHttpUrlFor(baseUrl, path, origin)
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
	return url
}

export function buildApiWsUrl(path: string): URL {
	return buildApiWsUrlFor(getApiBaseUrl(), path, window.location.origin)
}

export function stripApiBaseSuffix(pathname: string): string {
	const normalized = (pathname ?? '').replace(/\/+$/, '')
	// The backend exposes HTTP/WS endpoints under /api/v1 by default.
	const suffix = DEFAULT_API_BASE_URL
	if (normalized.endsWith(suffix)) {
		const out = normalized.slice(0, -suffix.length)
		return out || '/'
	}
	return normalized || '/'
}
