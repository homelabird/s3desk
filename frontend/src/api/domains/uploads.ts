import { clearNetworkStatus, publishNetworkStatus } from '../../lib/networkStatus'
import { parseAPIError, RequestAbortedError } from '../errors'
import { setSafeXHRHeader } from '../headers'
import { rejectedTransferHandle, type RequestOptions } from '../retryTransport'
import {
	createMultipartUploadFile,
	resolveUploadFilename,
	type UploadCommitRequest,
	type UploadFileItem,
	type UploadFilesResult,
} from '../uploads'
import type {
	JobCreatedResponse,
	UploadChunkState,
	UploadCreateRequest,
	UploadCreateResponse,
	UploadMultipartAbortRequest,
	UploadMultipartCompleteRequest,
	UploadPresignRequest,
	UploadPresignResponse,
} from '../types'

type RequestFn = <T>(path: string, init: RequestInit, options?: RequestOptions) => Promise<T>
type XhrConfig = { baseUrl: string; apiToken: string }

export function createUpload(request: RequestFn, profileId: string, req: UploadCreateRequest): Promise<UploadCreateResponse> {
	return request('/uploads', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(req),
	}, { profileId })
}

export function presignUpload(request: RequestFn, profileId: string, uploadId: string, req: UploadPresignRequest): Promise<UploadPresignResponse> {
	return request(`/uploads/${encodeURIComponent(uploadId)}/presign`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(req),
	}, { profileId })
}

export function completeMultipartUpload(request: RequestFn, profileId: string, uploadId: string, req: UploadMultipartCompleteRequest): Promise<void> {
	return request(`/uploads/${encodeURIComponent(uploadId)}/multipart/complete`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(req),
	}, { profileId })
}

export function abortMultipartUpload(request: RequestFn, profileId: string, uploadId: string, req: UploadMultipartAbortRequest): Promise<void> {
	return request(`/uploads/${encodeURIComponent(uploadId)}/multipart/abort`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(req),
	}, { profileId })
}

export function uploadFiles(request: RequestFn, profileId: string, uploadId: string, files: UploadFileItem[]): Promise<void> {
	const form = new FormData()
	for (const item of files) {
		form.append('files', createMultipartUploadFile(item))
	}
	return request(`/uploads/${encodeURIComponent(uploadId)}/files`, { method: 'POST', body: form }, { profileId })
}

export function commitUpload(request: RequestFn, profileId: string, uploadId: string, req?: UploadCommitRequest): Promise<JobCreatedResponse> {
	if (req) {
		return request(`/uploads/${encodeURIComponent(uploadId)}/commit`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(req),
		}, { profileId })
	}
	return request(`/uploads/${encodeURIComponent(uploadId)}/commit`, { method: 'POST' }, { profileId })
}

export function deleteUpload(request: RequestFn, profileId: string, uploadId: string): Promise<void> {
	return request(`/uploads/${encodeURIComponent(uploadId)}`, { method: 'DELETE' }, { profileId })
}

export function getUploadChunks(
	request: RequestFn,
	profileId: string,
	uploadId: string,
	args: { path: string; total: number; chunkSize: number; fileSize: number },
): Promise<UploadChunkState> {
	const params = new URLSearchParams()
	params.set('path', args.path)
	params.set('total', String(args.total))
	params.set('chunkSize', String(args.chunkSize))
	params.set('fileSize', String(args.fileSize))
	return request(`/uploads/${encodeURIComponent(uploadId)}/chunks?${params.toString()}`, { method: 'GET' }, { profileId })
}

export function uploadFilesWithProgress(
	config: XhrConfig,
	profileId: string,
	uploadId: string,
	files: UploadFileItem[],
	args: {
		onProgress?: (progress: { loadedBytes: number; totalBytes?: number }) => void
		concurrency?: number
		maxBatchBytes?: number
		maxBatchItems?: number
		chunkSizeBytes?: number
		chunkConcurrency?: number
		chunkThresholdBytes?: number
		chunkFileConcurrency?: number
		existingChunkIndices?: number[]
		existingChunksByPath?: Record<string, number[]>
		chunkSizeBytesByPath?: Record<string, number>
	} = {},
): { promise: Promise<UploadFilesResult>; abort: () => void } {
	const concurrency = Math.max(1, args.concurrency ?? 1)
	const maxBatchBytes = Math.max(1, args.maxBatchBytes ?? 64 * 1024 * 1024)
	const maxBatchItems = Math.max(1, args.maxBatchItems ?? 50)
	const chunkSizeBytes = Math.max(1, args.chunkSizeBytes ?? 128 * 1024 * 1024)
	const chunkConcurrency = Math.max(1, args.chunkConcurrency ?? 8)
	const chunkThresholdBytes = Math.max(1, args.chunkThresholdBytes ?? 256 * 1024 * 1024)
	const totalBytes = files.reduce((acc, item) => acc + (item.file?.size ?? 0), 0)

	if (files.length === 0) {
		return { promise: Promise.resolve({ skipped: 0 }), abort: () => {} }
	}

	const isChunkedItem = (item: UploadFileItem) => {
		const key = resolveUploadFilename(item)
		if (args.chunkSizeBytesByPath?.[key]) return true
		return (item.file?.size ?? 0) >= chunkThresholdBytes
	}
	const chunkedItems = files.filter(isChunkedItem)
	const batchItems = files.filter((item) => !isChunkedItem(item))

	if (files.length === 1 && chunkedItems.length === 1) {
		const only = chunkedItems[0]
		const key = resolveUploadFilename(only)
		const existing = args.existingChunksByPath?.[key] ?? args.existingChunkIndices
		return uploadFileChunksWithProgress(config, profileId, uploadId, only, {
			onProgress: args.onProgress,
			chunkSizeBytes: args.chunkSizeBytesByPath?.[key] ?? chunkSizeBytes,
			chunkConcurrency,
			existingChunkIndices: existing,
		})
	}

	const batches: UploadFileItem[][] = []
	const batchBytes: number[] = []
	let current: UploadFileItem[] = []
	let currentBytes = 0
	for (const item of batchItems) {
		const size = item.file?.size ?? 0
		const exceedsSize = currentBytes + size > maxBatchBytes
		const exceedsCount = current.length >= maxBatchItems
		if (current.length > 0 && (exceedsSize || exceedsCount)) {
			batches.push(current)
			batchBytes.push(currentBytes)
			current = []
			currentBytes = 0
		}
		current.push(item)
		currentBytes += size
	}
	if (current.length > 0) {
		batches.push(current)
		batchBytes.push(currentBytes)
	}

	const perBatchLoaded = new Array(batches.length).fill(0)
	const chunkLoadedByPath = new Map<string, number>()
	const aborters: Array<() => void> = []
	let aborted = false

	const emitProgress = () => {
		if (!args.onProgress) return
		let loadedBytes = perBatchLoaded.reduce((acc, v) => acc + v, 0)
		for (const val of chunkLoadedByPath.values()) {
			loadedBytes += val
		}
		args.onProgress({ loadedBytes, totalBytes: totalBytes || undefined })
	}

	const runBatch = (batch: UploadFileItem[], batchIndex: number) => {
		const form = new FormData()
		for (const item of batch) {
			form.append('files', createMultipartUploadFile(item))
		}

		const xhr = new XMLHttpRequest()
		xhr.open('POST', config.baseUrl + `/uploads/${encodeURIComponent(uploadId)}/files`)
		try {
			setSafeXHRHeader(xhr, 'X-Profile-Id', profileId)
			setSafeXHRHeader(xhr, 'X-Api-Token', config.apiToken)
		} catch (err) {
			return rejectedTransferHandle<UploadFilesResult>(err instanceof Error ? err : new Error('invalid request headers'))
		}

		xhr.upload.onprogress = (e) => {
			perBatchLoaded[batchIndex] = e.loaded
			emitProgress()
		}

		const promise = new Promise<UploadFilesResult>((resolve, reject) => {
			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					clearNetworkStatus()
					const skippedRaw = xhr.getResponseHeader('X-Upload-Skipped')
					const skipped = skippedRaw ? Number.parseInt(skippedRaw, 10) : 0
					perBatchLoaded[batchIndex] = batchBytes[batchIndex]
					emitProgress()
					resolve({ skipped: Number.isFinite(skipped) && skipped > 0 ? skipped : 0 })
					return
				}
				if (xhr.status >= 500 || xhr.status === 0) {
					publishNetworkStatus({ kind: 'unstable', message: `Server error (HTTP ${xhr.status || '0'}).` })
				}
				reject(parseAPIError(xhr.status, xhr.responseText))
			}
			xhr.onerror = () => {
				publishNetworkStatus({ kind: 'unstable', message: 'Network error. Check your connection.' })
				reject(new Error('network error'))
			}
			xhr.onabort = () => reject(new RequestAbortedError())
		})

		xhr.send(form)
		return { promise, abort: () => xhr.abort() }
	}

	const runBatches = async () => {
		if (batches.length === 0) return { skipped: 0 }
		let nextIndex = 0
		let skippedTotal = 0

		const worker = async () => {
			while (true) {
				if (aborted) return
				const batchIndex = nextIndex
				if (batchIndex >= batches.length) return
				nextIndex += 1

				const handle = runBatch(batches[batchIndex], batchIndex)
				aborters.push(handle.abort)
				try {
					const res = await handle.promise
					skippedTotal += res.skipped
				} catch (err) {
					if (!aborted) {
						aborted = true
						for (const abort of aborters) abort()
					}
					throw err
				}
			}
		}

		const workers = Array.from({ length: Math.min(concurrency, batches.length) }, () => worker())
		await Promise.all(workers)
		return { skipped: skippedTotal }
	}

	const runChunked = async () => {
		if (chunkedItems.length === 0) return { skipped: 0 }
		let nextIndex = 0
		const fileConcurrency = Math.min(Math.max(1, args.chunkFileConcurrency ?? 2), chunkedItems.length)

		const worker = async () => {
			while (true) {
				if (aborted) return
				const currentIndex = nextIndex
				if (currentIndex >= chunkedItems.length) return
				nextIndex += 1

				const item = chunkedItems[currentIndex]
				const key = resolveUploadFilename(item)
				const handle = uploadFileChunksWithProgress(config, profileId, uploadId, item, {
					onProgress: (p) => {
						chunkLoadedByPath.set(key, p.loadedBytes)
						emitProgress()
					},
					chunkSizeBytes: args.chunkSizeBytesByPath?.[key] ?? chunkSizeBytes,
					chunkConcurrency,
					existingChunkIndices: args.existingChunksByPath?.[key],
				})
				aborters.push(handle.abort)
				try {
					await handle.promise
				} catch (err) {
					if (!aborted) {
						aborted = true
						for (const abort of aborters) abort()
					}
					throw err
				}
			}
		}

		const workers = Array.from({ length: Math.min(fileConcurrency, chunkedItems.length) }, () => worker())
		await Promise.all(workers)
		return { skipped: 0 }
	}

	const promise = (async () => {
		const [batchRes, chunkRes] = await Promise.all([runBatches(), runChunked()])
		return { skipped: batchRes.skipped + chunkRes.skipped }
	})()

	return {
		promise,
		abort: () => {
			aborted = true
			for (const abort of aborters) abort()
		},
	}
}

function uploadFileChunksWithProgress(
	config: XhrConfig,
	profileId: string,
	uploadId: string,
	item: UploadFileItem,
	args: {
		onProgress?: (progress: { loadedBytes: number; totalBytes?: number }) => void
		chunkSizeBytes: number
		chunkConcurrency: number
		existingChunkIndices?: number[]
	},
): { promise: Promise<UploadFilesResult>; abort: () => void } {
	const file = item.file
	if (!file) {
		return { promise: Promise.resolve({ skipped: 0 }), abort: () => {} }
	}

	const chunkSizeBytes = Math.max(1, args.chunkSizeBytes)
	const totalChunks = Math.max(1, Math.ceil(file.size / chunkSizeBytes))
	const perChunkLoaded = new Array(totalChunks).fill(0)
	const existing = new Set<number>((args.existingChunkIndices ?? []).filter((idx) => idx >= 0 && idx < totalChunks))
	const aborters: Array<() => void> = []
	let aborted = false

	const emitProgress = () => {
		if (!args.onProgress) return
		const loadedBytes = perChunkLoaded.reduce((acc, v) => acc + v, 0)
		args.onProgress({ loadedBytes, totalBytes: file.size })
	}

	if (existing.size > 0) {
		for (const index of existing) {
			const start = index * chunkSizeBytes
			const end = Math.min(file.size, start + chunkSizeBytes)
			perChunkLoaded[index] = end - start
		}
		emitProgress()
	}

	const uploadChunk = (chunkIndex: number) =>
		new Promise<void>((resolve, reject) => {
			const start = chunkIndex * chunkSizeBytes
			const end = Math.min(file.size, start + chunkSizeBytes)
			const blob = file.slice(start, end)

			const xhr = new XMLHttpRequest()
			xhr.open('POST', config.baseUrl + `/uploads/${encodeURIComponent(uploadId)}/files`)
			try {
				setSafeXHRHeader(xhr, 'X-Profile-Id', profileId)
				setSafeXHRHeader(xhr, 'X-Api-Token', config.apiToken)
				setSafeXHRHeader(xhr, 'X-Upload-Chunk-Index', String(chunkIndex))
				setSafeXHRHeader(xhr, 'X-Upload-Chunk-Total', String(totalChunks))
				setSafeXHRHeader(xhr, 'X-Upload-Chunk-Size', String(chunkSizeBytes))
				setSafeXHRHeader(xhr, 'X-Upload-File-Size', String(file.size))
				setSafeXHRHeader(xhr, 'X-Upload-Relative-Path', resolveUploadFilename(item))
			} catch (err) {
				reject(err instanceof Error ? err : new Error('invalid request headers'))
				return
			}

			xhr.upload.onprogress = (e) => {
				if (aborted) return
				perChunkLoaded[chunkIndex] = e.loaded
				emitProgress()
			}

			xhr.onerror = () => {
				if (aborted) return
				reject(new Error('network error'))
			}
			xhr.onabort = () => {
				reject(new RequestAbortedError())
			}
			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					perChunkLoaded[chunkIndex] = end - start
					emitProgress()
					resolve()
					return
				}
				reject(parseAPIError(xhr.status, xhr.responseText))
			}

			xhr.send(blob)
			aborters.push(() => xhr.abort())
		})

	const promise = new Promise<UploadFilesResult>((resolve, reject) => {
		let inFlight = 0
		let nextIndex = 0
		const startNext = () => {
			if (aborted) return
			while (nextIndex < totalChunks && existing.has(nextIndex)) {
				nextIndex += 1
			}
			if (nextIndex >= totalChunks && inFlight === 0) {
				resolve({ skipped: 0 })
				return
			}
			while (inFlight < args.chunkConcurrency && nextIndex < totalChunks) {
				const current = nextIndex
				nextIndex += 1
				while (nextIndex < totalChunks && existing.has(nextIndex)) {
					nextIndex += 1
				}
				inFlight += 1
				uploadChunk(current)
					.then(() => {
						inFlight -= 1
						if (nextIndex >= totalChunks && inFlight === 0) {
							resolve({ skipped: 0 })
							return
						}
						startNext()
					})
					.catch((err) => {
						aborted = true
						for (const abort of aborters) abort()
						reject(err)
					})
			}
		}
		startNext()
	})

	return {
		promise,
		abort: () => {
			aborted = true
			for (const abort of aborters) abort()
		},
	}
}
