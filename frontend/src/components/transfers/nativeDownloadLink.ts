export type NativeDownloadLink = { url: string; expiresAtMs: number }

// Signed URLs are bearer capabilities. Keep them in memory, never history storage
// or log/error text. The API token itself must never be placed in the URL.
export function validateNativeDownloadLink(
	result: { url: string; expiresAt: string },
	origin: string,
	now = Date.now(),
): NativeDownloadLink {
	const url = new URL(result.url, origin)
	if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
		throw new Error('Invalid browser download URL.')
	}
	for (const name of url.searchParams.keys()) {
		if (/^(x[-_]?api[-_]?token|api[-_]?token)$/i.test(name)) {
			throw new Error('Browser download links cannot contain the API token.')
		}
	}
	const expiresAtMs = Date.parse(result.expiresAt)
	if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now + 5000) {
		throw new Error('Download link expired. Retry to prepare a fresh link.')
	}
	return { url: url.href, expiresAtMs }
}

export function isDownloadLinkFresh(expiresAtMs?: number, now = Date.now()): boolean {
	return typeof expiresAtMs === 'number' && Number.isFinite(expiresAtMs) && expiresAtMs > now + 5000
}
