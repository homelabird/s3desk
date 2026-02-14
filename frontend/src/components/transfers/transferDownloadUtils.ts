import { APIError, RequestAbortedError, RequestTimeoutError } from '../../api/client'
import { clearNetworkStatus, publishNetworkStatus } from '../../lib/networkStatus'

export function randomId(): string {
	return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
		? crypto.randomUUID()
		: `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function defaultFilenameFromKey(key: string): string {
	const base = key.split('/').filter(Boolean).pop()
	return base || 'download'
}

export function filenameFromContentDisposition(header: string | null): string | null {
	if (!header) return null

	const star = /filename\*=([^']*)''([^;]+)/i.exec(header)
	if (star) {
		const encoded = star[2]
		try {
			return decodeURIComponent(encoded)
		} catch {
			return encoded
		}
	}

	const plain = /filename="?([^";]+)"?/i.exec(header)
	if (plain) return plain[1]
	return null
}

export function normalizePrefixForDevice(prefix?: string): string {
	if (!prefix) return ''
	const trimmed = prefix.trim().replace(/\\/g, '/')
	if (!trimmed) return ''
	return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

export function normalizeDevicePath(value: string): string {
	const cleaned = value.replace(/\\/g, '/').replace(/^\/+/, '')
	const parts = cleaned.split('/').filter(Boolean).filter((part) => part !== '.' && part !== '..')
	return parts.join('/')
}

export type DownloadHandle = {
	promise: Promise<{ blob: Blob; contentDisposition: string | null; contentType: string | null }>
	abort: () => void
}

export function downloadURLWithProgress(
	url: string,
	opts: { onProgress?: (progress: { loadedBytes: number; totalBytes?: number }) => void } = {},
): DownloadHandle {
	const xhr = new XMLHttpRequest()
	xhr.open('GET', url)
	xhr.responseType = 'blob'

	xhr.onprogress = (e) => {
		if (!opts.onProgress) return
		opts.onProgress({
			loadedBytes: e.loaded,
			totalBytes: e.lengthComputable ? e.total : undefined,
		})
	}

	const promise = new Promise<{ blob: Blob; contentDisposition: string | null; contentType: string | null }>(
		(resolve, reject) => {
			xhr.onload = async () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					clearNetworkStatus()
					resolve({
						blob: xhr.response,
						contentDisposition: xhr.getResponseHeader('content-disposition'),
						contentType: xhr.getResponseHeader('content-type'),
					})
					return
				}

				const bodyText = await blobToTextSafe(xhr.response)
				const fallback =
					xhr.status === 0 ? 'Download failed (network/CORS).' : `Download failed (HTTP ${xhr.status})`
				reject(new Error(bodyText ? `${fallback}: ${bodyText}` : fallback))
			}
			xhr.onerror = () => {
				reject(new Error('Network error (possible CORS).'))
			}
			xhr.onabort = () => reject(new RequestAbortedError())
		},
	)

	xhr.send()
	return { promise, abort: () => xhr.abort() }
}

async function blobToTextSafe(blob: Blob | null): Promise<string | null> {
	if (!blob) return null
	try {
		return await blob.text()
	} catch {
		return null
	}
}

export function saveBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.rel = 'noopener'
	a.style.display = 'none'
	document.body.appendChild(a)
	a.click()
	a.remove()
	setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function maybeReportNetworkError(err: unknown) {
	if (err instanceof RequestAbortedError) return
	if (err instanceof RequestTimeoutError) {
		publishNetworkStatus({ kind: 'unstable', message: 'Request timed out. Check your connection.' })
		return
	}
	if (err instanceof APIError) {
		if (err.status >= 500 || err.status === 0) {
			publishNetworkStatus({ kind: 'unstable', message: `Server error (HTTP ${err.status}).` })
		}
		return
	}
	if (err instanceof TypeError) {
		publishNetworkStatus({ kind: 'unstable', message: 'Network error. Check your connection.' })
		return
	}
	if (err instanceof Error && /network|failed to fetch|load failed/i.test(err.message)) {
		publishNetworkStatus({ kind: 'unstable', message: 'Network error. Check your connection.' })
	}
}

export function shouldFallbackToProxy(err: unknown): boolean {
	if (err instanceof RequestAbortedError) return false
	if (err instanceof APIError) return false
	if (err instanceof Error) {
		const msg = err.message.toLowerCase()
		if (msg.includes('cors')) return true
		if (msg.includes('download failed') && msg.includes('network')) return true
		if (msg.includes('failed to fetch')) return true
	}
	if (err instanceof TypeError) {
		return true
	}
	return false
}
