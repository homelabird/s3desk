export const DEFAULT_API_BASE_URL = '/api/v1'
const SAFE_BROWSER_PROTOCOLS = new Set(['http:', 'https:'])

export type SafeBrowserObjectUrlKind = 'api_proxy' | 'api_same_origin' | 'external_storage'

export type SafeBrowserObjectUrl = {
	url: URL
	kind: SafeBrowserObjectUrlKind
}

export function normalizeApiBaseUrl(baseUrl: string): string {
	const trimmed = (baseUrl ?? '').trim()
	const resolved = trimmed || DEFAULT_API_BASE_URL
	if (resolved.startsWith('/')) {
		return resolved.replace(/\/+$/, '')
	}
	try {
		const parsed = new URL(resolved)
		if (!SAFE_BROWSER_PROTOCOLS.has(parsed.protocol) || parsed.username || parsed.password) {
			return DEFAULT_API_BASE_URL
		}
		parsed.search = ''
		parsed.hash = ''
		parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/'
		return parsed.toString().replace(/\/+$/, '')
	} catch {
		return DEFAULT_API_BASE_URL
	}
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

export function getSafeBrowserObjectUrl(
	rawUrl: string,
	args: { origin?: string; apiBaseUrl?: string } = {},
): SafeBrowserObjectUrl {
	const origin = args.origin ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
	let parsed: URL
	try {
		parsed = new URL(rawUrl, origin)
	} catch {
		throw new Error('Object URL is invalid.')
	}
	if (!SAFE_BROWSER_PROTOCOLS.has(parsed.protocol)) {
		throw new Error('Only HTTP(S) object URLs are allowed.')
	}
	if (parsed.username || parsed.password) {
		throw new Error('Object URLs with embedded credentials are not allowed.')
	}

	const apiBase = new URL(normalizeApiBaseUrl(args.apiBaseUrl ?? DEFAULT_API_BASE_URL), origin)
	const apiBasePath = apiBase.pathname.replace(/\/+$/, '')
	if (parsed.origin === apiBase.origin) {
		if (parsed.pathname === '/download-proxy') {
			return { url: parsed, kind: 'api_proxy' }
		}
		if (parsed.pathname === apiBasePath || parsed.pathname.startsWith(`${apiBasePath}/`)) {
			return { url: parsed, kind: 'api_same_origin' }
		}
	}

	return { url: parsed, kind: 'external_storage' }
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
