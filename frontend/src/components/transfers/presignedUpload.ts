import { waitForNetworkRetry } from '../../lib/networkRecovery'
import { planPresignedMultipart, type PresignedMultipartPlan } from './presignedMultipartPlan'
export { planPresignedMultipart } from './presignedMultipartPlan'
import { clearNetworkStatus, publishNetworkStatus } from '../../lib/networkStatus'
import {
	RequestAbortedError,
	type APIClientShape,
	type UploadFileItem,
	type UploadFilesResult,
} from '../../api/client'

import { normalizeUploadPath, resolveUploadItemPath } from './uploadPaths'

const PRESIGNED_UNSAFE_HEADERS = new Set(['accept-encoding', 'connection', 'content-length', 'host', 'user-agent'])

export class PresignedUploadNetworkError extends Error {
	constructor(message = 'network error') {
		super(message)
		this.name = 'PresignedUploadNetworkError'
	}
}

type PresignedUploadItem = {
	item: UploadFileItem
	path: string
	size: number
	contentType?: string
	index: number
}

const applyPresignedHeaders = (xhr: XMLHttpRequest, headers?: Record<string, string>) => {
	if (!headers) return
	for (const [key, value] of Object.entries(headers)) {
		if (!value) continue
		if (PRESIGNED_UNSAFE_HEADERS.has(key.toLowerCase())) continue
		xhr.setRequestHeader(key, value)
	}
}

// A stall deadline, not a whole-file deadline: long uploads keep running as
// long as bytes or response progress are observed.
const PRESIGNED_STALL_TIMEOUT_MS = 120_000
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

class PresignedUploadHTTPError extends Error {
	readonly status: number
	readonly retryAfterMs: number
	constructor(status: number, retryAfterMs: number) {
		super(`Upload failed (HTTP ${status}). Retry to request a fresh upload link.`)
		this.name = 'PresignedUploadHTTPError'
		this.status = status
		this.retryAfterMs = retryAfterMs
	}
}

function retryDelay(value: string | null): number {
	if (!value) return 500
	const seconds = /^\d+$/.test(value.trim()) ? Number(value) : Number.NaN
	const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now()
	return Number.isFinite(ms) ? Math.min(10_000, Math.max(500, ms)) : 500
}

const uploadPresignedBlob = (args: {
	url: string
	method?: string
	headers?: Record<string, string>
	body: Blob
	onProgress?: (loadedBytes: number) => void
	stallTimeoutMs?: number
}): { promise: Promise<{ etag?: string }>; abort: () => void } => {
	const xhr = new XMLHttpRequest()
	let settled = false
	let timer: ReturnType<typeof setTimeout> | undefined
	let rejectRequest!: (error: Error) => void
	const clear = () => {
		if (timer !== undefined) clearTimeout(timer)
		timer = undefined
		xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = xhr.onprogress = null
		xhr.upload.onprogress = null
	}
	const promise = new Promise<{ etag?: string }>((resolve, reject) => {
		rejectRequest = (error) => {
			if (settled) return
			settled = true
			clear()
			reject(error)
		}
		const armDeadline = () => {
			if (settled) return
			if (timer !== undefined) clearTimeout(timer)
			timer = setTimeout(() => {
				rejectRequest(new PresignedUploadNetworkError('Upload stalled. Check your connection and retry.'))
				xhr.abort()
			}, args.stallTimeoutMs ?? PRESIGNED_STALL_TIMEOUT_MS)
		}
		try {
			xhr.open(args.method ?? 'PUT', args.url)
			applyPresignedHeaders(xhr, args.headers)
			xhr.upload.onprogress = (event) => {
				if (settled) return
				armDeadline()
				args.onProgress?.(Math.min(args.body.size, Math.max(0, event.loaded)))
			}
			xhr.onprogress = armDeadline
			xhr.onload = () => {
				if (settled) return
				if (xhr.status >= 200 && xhr.status < 300) {
					const etag = xhr.getResponseHeader('etag') ?? undefined
					settled = true
					clear()
					clearNetworkStatus()
					resolve({ etag })
					return
				}
				if (xhr.status === 0) {
					rejectRequest(new PresignedUploadNetworkError())
					return
				}
				if (RETRYABLE_STATUS.has(xhr.status)) {
					publishNetworkStatus({ kind: 'unstable', message: `Upload temporarily unavailable (HTTP ${xhr.status}).` })
				}
				// Do not display raw provider XML/HTML: it can contain bearer URLs.
				rejectRequest(new PresignedUploadHTTPError(xhr.status, retryDelay(xhr.getResponseHeader('Retry-After'))))
			}
			xhr.onerror = () => {
				publishNetworkStatus({ kind: 'unstable', message: 'Network error. Check your connection.' })
				rejectRequest(new PresignedUploadNetworkError())
			}
			xhr.onabort = () => rejectRequest(new RequestAbortedError())
			xhr.ontimeout = () => rejectRequest(new PresignedUploadNetworkError('Upload request timed out.'))
			armDeadline()
			xhr.send(args.body)
		} catch (error) {
			rejectRequest(error instanceof Error ? error : new Error('Unable to start upload'))
		}
	})
	return { promise, abort: () => {
		if (settled) return
		rejectRequest(new RequestAbortedError())
		xhr.abort()
	} }
}

const uploadPresignedBlobWithRetry = (
	args: Parameters<typeof uploadPresignedBlob>[0],
	maxRetries = 1,
): ReturnType<typeof uploadPresignedBlob> => {
	let active: ReturnType<typeof uploadPresignedBlob> | undefined
	const retryController = new AbortController()
	let aborted = false
	const promise = (async () => {
		for (let attempt = 0; ; attempt += 1) {
			if (aborted) throw new RequestAbortedError()
			active = uploadPresignedBlob(args)
			try {
				return await active.promise
			} catch (error) {
				if (aborted) throw new RequestAbortedError()
				const transient = error instanceof PresignedUploadNetworkError ||
					(error instanceof PresignedUploadHTTPError && RETRYABLE_STATUS.has(error.status))
				if (!transient || attempt >= maxRetries) throw error
				const delayMs = error instanceof PresignedUploadHTTPError ? error.retryAfterMs : Math.min(8000, 500 * 2 ** attempt)
				if (error instanceof PresignedUploadNetworkError) {
					await waitForNetworkRetry(delayMs, retryController.signal)
				} else {
					await new Promise<void>((resolve, reject) => {
						const abort = () => { clearTimeout(timer); reject(new RequestAbortedError()) }
						const timer = setTimeout(() => { retryController.signal.removeEventListener('abort', abort); resolve() }, delayMs)
						retryController.signal.addEventListener('abort', abort, { once: true })
						if (retryController.signal.aborted) abort()
					})
				}
			} finally {
				active = undefined
			}
		}
	})()
	return {
		promise,
		abort: () => { aborted = true; active?.abort(); retryController.abort() },
	}
}

export const uploadPresignedFilesWithProgress = (args: {
	api: APIClientShape
	profileId: string
	uploadId: string
	items: UploadFileItem[]
	onProgress?: (progress: { loadedBytes: number; totalBytes?: number }) => void
	singleConcurrency: number
	multipartFileConcurrency: number
	partConcurrency: number
	chunkThresholdBytes: number
	chunkSizeBytes: number
	chunkSizeBytesByPath?: Record<string, number>
	existingChunksByPath?: Record<string, number[]>
	preserveSessionOnFailure?: boolean
	networkRetries?: number
	/** Test/host override; omitted in application calls. */
	stallTimeoutMs?: number
}): { promise: Promise<UploadFilesResult>; abort: () => void } => {
	const totalBytes = args.items.reduce((acc, item) => acc + (item.file?.size ?? 0), 0)
	if (args.items.length === 0) {
		return { promise: Promise.resolve({ skipped: 0 }), abort: () => {} }
	}

	const validItems: PresignedUploadItem[] = []
	let skipped = 0
	let skippedBytes = 0
	for (const [index, item] of args.items.entries()) {
		const path = normalizeUploadPath(resolveUploadItemPath(item))
		if (!path) {
			skipped += 1
			skippedBytes += item.file?.size ?? 0
			continue
		}
		validItems.push({
			item,
			path,
			size: item.file?.size ?? 0,
			contentType: item.file?.type?.trim() || undefined,
			index,
		})
	}

	if (validItems.length === 0) {
		return { promise: Promise.resolve({ skipped }), abort: () => {} }
	}

	const emitProgress = (loadedBytes: number) => {
		if (!args.onProgress) return
		args.onProgress({ loadedBytes, totalBytes: totalBytes || undefined })
	}

	const loadedByKey = new Map<string, number>()
	let loadedBytes = skippedBytes
	if (skippedBytes > 0) emitProgress(loadedBytes)

	const updateLoaded = (key: string, nextLoaded: number) => {
		const prev = loadedByKey.get(key) ?? 0
		const delta = nextLoaded - prev
		if (delta <= 0) return
		loadedByKey.set(key, nextLoaded)
		loadedBytes += delta
		emitProgress(loadedBytes)
	}

	const singleItems: PresignedUploadItem[] = []
	const multipartItems: Array<{ info: PresignedUploadItem; plan: PresignedMultipartPlan }> = []
	for (const info of validItems) {
		const rawPath = resolveUploadItemPath(info.item)
		const hasExistingState = args.existingChunksByPath?.[rawPath] !== undefined
		const plan = planPresignedMultipart({
			fileSize: info.size,
			partSizeBytes: args.chunkSizeBytesByPath?.[rawPath] ?? args.chunkSizeBytes,
			thresholdBytes: hasExistingState ? 1 : args.chunkThresholdBytes,
		})
		if (plan) multipartItems.push({ info, plan })
		else singleItems.push(info)
	}

	const singleConcurrency = Math.max(1, args.singleConcurrency)
	const multipartConcurrency = Math.max(1, args.multipartFileConcurrency)
	const partConcurrency = Math.max(1, args.partConcurrency)
	const aborters = new Set<() => void>()
	const control = new AbortController()
	let aborted = false
	let firstFailure: { error: unknown } | undefined
	const stop = (error?: unknown) => {
		if (error !== undefined && !firstFailure) firstFailure = { error }
		aborted = true
		control.abort()
		for (const abort of aborters) abort()
	}
	const awaitActive = async (handle: ReturnType<typeof uploadPresignedBlobWithRetry>) => {
		aborters.add(handle.abort)
		if (aborted) handle.abort()
		try { return await handle.promise } finally { aborters.delete(handle.abort) }
	}

	const uploadSingleItem = async (info: PresignedUploadItem) => {
		const presigned = await args.api.uploads.presignUpload(args.profileId, args.uploadId, {
			path: info.path,
			contentType: info.contentType,
			size: info.size,
		}, control.signal)
		if (aborted) throw new RequestAbortedError()
		if (presigned.mode !== 'single' || !presigned.url) {
			throw new Error('unexpected presigned response for single upload')
		}
		const key = `single:${info.index}`
		const handle = uploadPresignedBlobWithRetry({
			url: presigned.url,
			method: presigned.method,
			headers: presigned.headers,
			body: info.item.file,
			onProgress: (loaded) => { if (!aborted) updateLoaded(key, loaded) },
			stallTimeoutMs: args.stallTimeoutMs,
		}, Math.min(4, Math.max(0, args.networkRetries ?? 1)))
		// A failed/lost PUT response is not evidence that this upload succeeded.
		// HEAD size can match an older object; never commit on that assumption.
		await awaitActive(handle)
		updateLoaded(key, info.size)
	}

	const uploadMultipartItem = async (info: PresignedUploadItem, plan: PresignedMultipartPlan) => {
		const presigned = await args.api.uploads.presignUpload(args.profileId, args.uploadId, {
			path: info.path,
			contentType: info.contentType,
			size: info.size,
			multipart: {
				fileSize: info.size,
				partSizeBytes: plan.partSizeBytes,
			},
		}, control.signal)
		if (aborted) throw new RequestAbortedError()
		if (presigned.mode !== 'multipart' || !presigned.multipart) {
			throw new Error('unexpected presigned response for multipart upload')
		}
		try {
			const partSizeBytes = presigned.multipart.partSizeBytes
			const partCount = presigned.multipart.partCount
			if (partSizeBytes !== plan.partSizeBytes || partCount !== plan.partCount) throw new Error('Multipart geometry changed; start a new upload.')
			const existing = new Set(args.existingChunksByPath?.[resolveUploadItemPath(info.item)] ?? [])
			for (const part of existing) {
				if (!Number.isInteger(part) || part < 0 || part >= partCount) throw new Error('Invalid resumable part index')
				const start = part * partSizeBytes
				updateLoaded(`multi:${info.index}:${part + 1}`, Math.min(partSizeBytes, info.size - start))
			}
			const parts = presigned.multipart.parts ?? []
			if (parts.length === 0) {
				throw new Error('multipart presign returned no parts')
			}
			const partsByNumber = new Map(parts.map((part) => [part.number, part]))
			for (let i = 1; i <= partCount; i += 1) {
				if (!partsByNumber.has(i)) {
					throw new Error(`missing presigned part ${i}`)
				}
			}

			let nextPart = 1
			const completed: Array<{ number: number; etag: string }> = []
			const uploadPart = async (partNumber: number) => {
				const part = partsByNumber.get(partNumber)
				if (!part) throw new Error(`missing presigned part ${partNumber}`)
				const start = (partNumber - 1) * partSizeBytes
				const end = Math.min(info.size, start + partSizeBytes)
				const blob = info.item.file.slice(start, end)
				const key = `multi:${info.index}:${partNumber}`
				const handle = uploadPresignedBlobWithRetry({
					url: part.url,
					method: part.method,
					headers: part.headers,
					body: blob,
					onProgress: (loaded) => { if (!aborted) updateLoaded(key, loaded) },
					stallTimeoutMs: args.stallTimeoutMs,
				}, Math.min(4, Math.max(0, args.networkRetries ?? 1)))
				const res = await awaitActive(handle)
				const etag = res.etag?.trim()
				if (!etag) {
					throw new Error(`missing etag for part ${partNumber}`)
				}
				updateLoaded(key, end - start)
				return { number: partNumber, etag }
			}

			const partWorker = async () => {
				while (true) {
					if (aborted) return
					const current = nextPart
					if (current > partCount) return
					nextPart += 1
					if (existing.has(current - 1)) continue
					try {
						const partResult = await uploadPart(current)
						completed.push(partResult)
					} catch (error) {
						// Stop siblings immediately, before allSettled waits for them.
						stop(error)
						throw error
					}
				}
			}

			const workers = Array.from({ length: Math.min(partConcurrency, partCount) }, () => partWorker())
			// Drain siblings before exposing failure; no late writes into a retried session.
			const settled = await Promise.allSettled(workers)
			const rejected = settled.find((entry): entry is PromiseRejectedResult => entry.status === 'rejected')
			if (rejected) throw rejected.reason
			if (aborted) throw new RequestAbortedError()
			await args.api.uploads.completeMultipartUpload(args.profileId, args.uploadId, {
				path: info.path,
				// Empty means server-authoritative ListParts (no stale client ETags).
				parts: existing.size > 0 ? [] : completed,
			}, control.signal)
		} catch (err) {
			if (!args.preserveSessionOnFailure) await args.api.uploads.abortMultipartUpload(args.profileId, args.uploadId, { path: info.path }).catch(() => {})
			throw err
		}
	}

	const runSingles = async () => {
		if (singleItems.length === 0) return
		let nextIndex = 0
		const worker = async () => {
			while (true) {
				if (aborted) return
				const currentIndex = nextIndex
				if (currentIndex >= singleItems.length) return
				nextIndex += 1
				try {
					await uploadSingleItem(singleItems[currentIndex])
				} catch (err) {
					stop(err)
					throw err
				}
			}
		}
		const workers = Array.from({ length: Math.min(singleConcurrency, singleItems.length) }, () => worker())
		const settled = await Promise.allSettled(workers)
		const rejected = settled.find((entry): entry is PromiseRejectedResult => entry.status === 'rejected')
		if (rejected) throw rejected.reason
	}

	const runMultiparts = async () => {
		if (multipartItems.length === 0) return
		let nextIndex = 0
		const worker = async () => {
			while (true) {
				if (aborted) return
				const currentIndex = nextIndex
				if (currentIndex >= multipartItems.length) return
				nextIndex += 1
				const entry = multipartItems[currentIndex]
				try {
					await uploadMultipartItem(entry.info, entry.plan)
				} catch (err) {
					stop(err)
					throw err
				}
			}
		}
		const workers = Array.from({ length: Math.min(multipartConcurrency, multipartItems.length) }, () => worker())
		const settled = await Promise.allSettled(workers)
		const rejected = settled.find((entry): entry is PromiseRejectedResult => entry.status === 'rejected')
		if (rejected) throw rejected.reason
	}

	const promise = (async () => {
		const settled = await Promise.allSettled([runSingles(), runMultiparts()])
		if (firstFailure) throw firstFailure.error
		const rejected = settled.find((entry): entry is PromiseRejectedResult => entry.status === 'rejected')
		if (rejected) throw rejected.reason
		if (aborted) throw new RequestAbortedError()
		return { skipped }
	})()

	return {
		promise,
		abort: () => stop(),
	}
}
