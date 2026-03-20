import { clearNetworkStatus, publishNetworkStatus } from '../../lib/networkStatus'
import { parseAPIError, RequestAbortedError } from '../errors'
import { createInvalidHeaderValueError, setSafeXHRHeader } from '../headers'
import { rejectedTransferHandle, type RequestOptions } from '../retryTransport'
import type { ServerBackupConfidentialityMode, ServerBackupDownloadOptions, ServerBackupScope } from '../types'

type XhrConfig = { baseUrl: string; apiToken: string }
type RawRequestFn = (path: string, init: RequestInit, options?: RequestOptions) => Promise<Response>

async function blobToTextSafe(blob: Blob | null): Promise<string | null> {
	if (!blob) return null
	try {
		return await blob.text()
	} catch {
		return null
	}
}

export function downloadServerBackup(
	config: XhrConfig,
	scope: ServerBackupScope = 'full',
	confidentiality: ServerBackupConfidentialityMode = 'clear',
	options?: ServerBackupDownloadOptions,
): { promise: Promise<{ blob: Blob; contentDisposition: string | null; contentType: string | null }>; abort: () => void } {
	const xhr = new XMLHttpRequest()
	const params = new URLSearchParams()
	params.set('scope', scope)
	params.set('confidentiality', confidentiality)
	if (scope === 'portable' && typeof options?.includeThumbnails === 'boolean') {
		params.set('includeThumbnails', options.includeThumbnails ? 'true' : 'false')
	}
	xhr.open('GET', config.baseUrl + `/server/backup?${params.toString()}`)
	xhr.responseType = 'blob'

	try {
		setSafeXHRHeader(xhr, 'X-Api-Token', config.apiToken)
		if (typeof options?.password === 'string' && options.password.length > 0) {
			const err = createInvalidHeaderValueError('X-S3Desk-Backup-Password', options.password)
			if (err) throw err
			xhr.setRequestHeader('X-S3Desk-Backup-Password', options.password)
		}
	} catch (err) {
		return rejectedTransferHandle(err instanceof Error ? err : new Error('invalid API token header'))
	}

	const promise = new Promise<{ blob: Blob; contentDisposition: string | null; contentType: string | null }>((resolve, reject) => {
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
			if (xhr.status >= 500 || xhr.status === 0) {
				publishNetworkStatus({ kind: 'unstable', message: `Server error (HTTP ${xhr.status || '0'}).` })
			}
			reject(parseAPIError(xhr.status, bodyText))
		}
		xhr.onerror = () => {
			publishNetworkStatus({ kind: 'unstable', message: 'Network error. Check your connection.' })
			reject(new Error('network error'))
		}
		xhr.onabort = () => reject(new RequestAbortedError())
	})

	xhr.send()
	return { promise, abort: () => xhr.abort() }
}

export function downloadObject(
	config: XhrConfig,
	args: { profileId: string; bucket: string; key: string },
	opts: { onProgress?: (progress: { loadedBytes: number; totalBytes?: number }) => void } = {},
): { promise: Promise<{ blob: Blob; contentDisposition: string | null; contentType: string | null }>; abort: () => void } {
	const params = new URLSearchParams()
	params.set('key', args.key)

	const xhr = new XMLHttpRequest()
	xhr.open('GET', config.baseUrl + `/buckets/${encodeURIComponent(args.bucket)}/objects/download?${params.toString()}`)
	xhr.responseType = 'blob'

	try {
		setSafeXHRHeader(xhr, 'X-Profile-Id', args.profileId)
		setSafeXHRHeader(xhr, 'X-Api-Token', config.apiToken)
	} catch (err) {
		return rejectedTransferHandle(err instanceof Error ? err : new Error('invalid request headers'))
	}

	xhr.onprogress = (e) => {
		if (!opts.onProgress) return
		opts.onProgress({
			loadedBytes: e.loaded,
			totalBytes: e.lengthComputable ? e.total : undefined,
		})
	}

	const promise = new Promise<{ blob: Blob; contentDisposition: string | null; contentType: string | null }>((resolve, reject) => {
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
			if (xhr.status >= 500 || xhr.status === 0) {
				publishNetworkStatus({ kind: 'unstable', message: `Server error (HTTP ${xhr.status || '0'}).` })
			}
			reject(parseAPIError(xhr.status, bodyText))
		}
		xhr.onerror = () => {
			publishNetworkStatus({ kind: 'unstable', message: 'Network error. Check your connection.' })
			reject(new Error('network error'))
		}
		xhr.onabort = () => reject(new RequestAbortedError())
	})

	xhr.send()
	return { promise, abort: () => xhr.abort() }
}

export function downloadObjectThumbnail(
	config: XhrConfig,
	args: {
		profileId: string
		bucket: string
		key: string
		size?: number
		objectSize?: number
		etag?: string
		lastModified?: string
		contentType?: string
	},
): { promise: Promise<{ blob: Blob; contentType: string | null }>; abort: () => void } {
	const params = new URLSearchParams()
	params.set('key', args.key)
	if (args.size) params.set('size', String(args.size))
	if (typeof args.objectSize === 'number' && Number.isFinite(args.objectSize)) {
		params.set('objectSize', String(Math.max(0, Math.trunc(args.objectSize))))
	}
	if (args.etag) params.set('etag', args.etag)
	if (args.lastModified) params.set('lastModified', args.lastModified)
	if (args.contentType) params.set('contentType', args.contentType)

	const xhr = new XMLHttpRequest()
	xhr.open('GET', config.baseUrl + `/buckets/${encodeURIComponent(args.bucket)}/objects/thumbnail?${params.toString()}`)
	xhr.responseType = 'blob'

	try {
		setSafeXHRHeader(xhr, 'X-Profile-Id', args.profileId)
		setSafeXHRHeader(xhr, 'X-Api-Token', config.apiToken)
	} catch (err) {
		return rejectedTransferHandle(err instanceof Error ? err : new Error('invalid request headers'))
	}

	const promise = new Promise<{ blob: Blob; contentType: string | null }>((resolve, reject) => {
		xhr.onload = async () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				clearNetworkStatus()
				resolve({
					blob: xhr.response,
					contentType: xhr.getResponseHeader('content-type'),
				})
				return
			}

			const bodyText = await blobToTextSafe(xhr.response)
			if (xhr.status >= 500 || xhr.status === 0) {
				publishNetworkStatus({ kind: 'unstable', message: `Server error (HTTP ${xhr.status || '0'}).` })
			}
			reject(parseAPIError(xhr.status, bodyText))
		}
		xhr.onerror = () => {
			publishNetworkStatus({ kind: 'unstable', message: 'Network error. Check your connection.' })
			reject(new Error('network error'))
		}
		xhr.onabort = () => reject(new RequestAbortedError())
	})

	xhr.send()
	return { promise, abort: () => xhr.abort() }
}

export function downloadJobArtifact(
	config: XhrConfig,
	args: { profileId: string; jobId: string },
	opts: { onProgress?: (progress: { loadedBytes: number; totalBytes?: number }) => void } = {},
): { promise: Promise<{ blob: Blob; contentDisposition: string | null; contentType: string | null }>; abort: () => void } {
	const xhr = new XMLHttpRequest()
	xhr.open('GET', config.baseUrl + `/jobs/${encodeURIComponent(args.jobId)}/artifact`)
	xhr.responseType = 'blob'

	try {
		setSafeXHRHeader(xhr, 'X-Profile-Id', args.profileId)
		setSafeXHRHeader(xhr, 'X-Api-Token', config.apiToken)
	} catch (err) {
		return rejectedTransferHandle(err instanceof Error ? err : new Error('invalid request headers'))
	}

	xhr.onprogress = (e) => {
		if (!opts.onProgress) return
		opts.onProgress({
			loadedBytes: e.loaded,
			totalBytes: e.lengthComputable ? e.total : undefined,
		})
	}

	const promise = new Promise<{ blob: Blob; contentDisposition: string | null; contentType: string | null }>((resolve, reject) => {
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
			if (xhr.status >= 500 || xhr.status === 0) {
				publishNetworkStatus({ kind: 'unstable', message: `Server error (HTTP ${xhr.status || '0'}).` })
			}
			reject(parseAPIError(xhr.status, bodyText))
		}
		xhr.onerror = () => {
			publishNetworkStatus({ kind: 'unstable', message: 'Network error. Check your connection.' })
			reject(new Error('network error'))
		}
		xhr.onabort = () => reject(new RequestAbortedError())
	})

	xhr.send()
	return { promise: promise, abort: () => xhr.abort() }
}

export function downloadObjectStream(
	request: RawRequestFn,
	args: { profileId: string; bucket: string; key: string; signal?: AbortSignal },
): Promise<Response> {
	const params = new URLSearchParams()
	params.set('key', args.key)
	return request(
		`/buckets/${encodeURIComponent(args.bucket)}/objects/download?${params.toString()}`,
		{ method: 'GET', signal: args.signal },
		{ profileId: args.profileId, timeoutMs: 0, retries: 0 },
	)
}
