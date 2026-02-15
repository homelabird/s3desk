import { clearNetworkStatus, publishNetworkStatus } from '../../lib/networkStatus'
import {
	RequestAbortedError,
	type APIClient,
	type UploadFileItem,
	type UploadFilesResult,
} from '../../api/client'

import { normalizeUploadPath, resolveUploadItemPath } from './uploadPaths'

const PRESIGNED_MIN_PART_BYTES = 5 * 1024 * 1024
const PRESIGNED_MAX_PARTS = 10_000
const PRESIGNED_UNSAFE_HEADERS = new Set(['accept-encoding', 'connection', 'content-length', 'host', 'user-agent'])

type PresignedUploadItem = {
	item: UploadFileItem
	path: string
	size: number
	contentType?: string
	index: number
}

export type PresignedMultipartPlan = {
	partSizeBytes: number
	partCount: number
}

export const planPresignedMultipart = (args: {
	fileSize: number
	partSizeBytes: number
	thresholdBytes: number
}): PresignedMultipartPlan | null => {
	if (!Number.isFinite(args.fileSize) || args.fileSize <= 0) return null
	if (args.fileSize < args.thresholdBytes) return null

	let partSizeBytes = Math.max(PRESIGNED_MIN_PART_BYTES, Math.ceil(args.partSizeBytes))
	let partCount = Math.ceil(args.fileSize / partSizeBytes)
	if (partCount > PRESIGNED_MAX_PARTS) {
		partSizeBytes = Math.ceil(args.fileSize / PRESIGNED_MAX_PARTS)
		if (partSizeBytes < PRESIGNED_MIN_PART_BYTES) {
			partSizeBytes = PRESIGNED_MIN_PART_BYTES
		}
		partCount = Math.ceil(args.fileSize / partSizeBytes)
	}

	if (partCount < 2) return null
	return { partSizeBytes, partCount }
}

const applyPresignedHeaders = (xhr: XMLHttpRequest, headers?: Record<string, string>) => {
	if (!headers) return
	for (const [key, value] of Object.entries(headers)) {
		if (!value) continue
		if (PRESIGNED_UNSAFE_HEADERS.has(key.toLowerCase())) continue
		xhr.setRequestHeader(key, value)
	}
}

const uploadPresignedBlob = (args: {
	url: string
	method?: string
	headers?: Record<string, string>
	body: Blob
	onProgress?: (loadedBytes: number) => void
}): { promise: Promise<{ etag?: string }>; abort: () => void } => {
	const xhr = new XMLHttpRequest()
	xhr.open(args.method ?? 'PUT', args.url)
	applyPresignedHeaders(xhr, args.headers)

	if (args.onProgress) {
		xhr.upload.onprogress = (e) => {
			args.onProgress?.(e.loaded)
		}
	}

	const promise = new Promise<{ etag?: string }>((resolve, reject) => {
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				clearNetworkStatus()
				resolve({ etag: xhr.getResponseHeader('etag') ?? xhr.getResponseHeader('ETag') ?? undefined })
				return
			}
			if (xhr.status >= 500 || xhr.status === 0) {
				publishNetworkStatus({ kind: 'unstable', message: `Server error (HTTP ${xhr.status || '0'}).` })
			}
			reject(new Error(xhr.responseText ? `upload failed: ${xhr.responseText}` : `upload failed (HTTP ${xhr.status || '0'})`))
		}
		xhr.onerror = () => {
			publishNetworkStatus({ kind: 'unstable', message: 'Network error. Check your connection.' })
			reject(new Error('network error'))
		}
		xhr.onabort = () => reject(new RequestAbortedError())
	})

	xhr.send(args.body)
	return { promise, abort: () => xhr.abort() }
}

export const uploadPresignedFilesWithProgress = (args: {
	api: APIClient
	profileId: string
	uploadId: string
	items: UploadFileItem[]
	onProgress?: (progress: { loadedBytes: number; totalBytes?: number }) => void
	singleConcurrency: number
	multipartFileConcurrency: number
	partConcurrency: number
	chunkThresholdBytes: number
	chunkSizeBytes: number
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
		const plan = planPresignedMultipart({
			fileSize: info.size,
			partSizeBytes: args.chunkSizeBytes,
			thresholdBytes: args.chunkThresholdBytes,
		})
		if (plan) multipartItems.push({ info, plan })
		else singleItems.push(info)
	}

	const singleConcurrency = Math.max(1, args.singleConcurrency)
	const multipartConcurrency = Math.max(1, args.multipartFileConcurrency)
	const partConcurrency = Math.max(1, args.partConcurrency)
	const aborters: Array<() => void> = []
	let aborted = false

	const uploadSingleItem = async (info: PresignedUploadItem) => {
		const presigned = await args.api.presignUpload(args.profileId, args.uploadId, {
			path: info.path,
			contentType: info.contentType,
			size: info.size,
		})
		if (presigned.mode !== 'single' || !presigned.url) {
			throw new Error('unexpected presigned response for single upload')
		}
		const key = `single:${info.index}`
		const handle = uploadPresignedBlob({
			url: presigned.url,
			method: presigned.method,
			headers: presigned.headers,
			body: info.item.file,
			onProgress: (loaded) => updateLoaded(key, loaded),
		})
		aborters.push(handle.abort)
		await handle.promise
		updateLoaded(key, info.size)
	}

	const uploadMultipartItem = async (info: PresignedUploadItem, plan: PresignedMultipartPlan) => {
		const presigned = await args.api.presignUpload(args.profileId, args.uploadId, {
			path: info.path,
			contentType: info.contentType,
			size: info.size,
			multipart: {
				fileSize: info.size,
				partSizeBytes: plan.partSizeBytes,
			},
		})
		if (presigned.mode !== 'multipart' || !presigned.multipart) {
			throw new Error('unexpected presigned response for multipart upload')
		}
		try {
			const partSizeBytes = presigned.multipart.partSizeBytes
			const partCount = presigned.multipart.partCount
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
				const handle = uploadPresignedBlob({
					url: part.url,
					method: part.method,
					headers: part.headers,
					body: blob,
					onProgress: (loaded) => updateLoaded(key, loaded),
				})
				aborters.push(handle.abort)
				const res = await handle.promise
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
					const partResult = await uploadPart(current)
					completed.push(partResult)
				}
			}

			const workers = Array.from({ length: Math.min(partConcurrency, partCount) }, () => partWorker())
			await Promise.all(workers)
			await args.api.completeMultipartUpload(args.profileId, args.uploadId, {
				path: info.path,
				parts: completed,
			})
		} catch (err) {
			await args.api.abortMultipartUpload(args.profileId, args.uploadId, { path: info.path }).catch(() => {})
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
					if (!aborted) {
						aborted = true
						for (const abort of aborters) abort()
					}
					throw err
				}
			}
		}
		const workers = Array.from({ length: Math.min(singleConcurrency, singleItems.length) }, () => worker())
		await Promise.all(workers)
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
					if (!aborted) {
						aborted = true
						for (const abort of aborters) abort()
					}
					throw err
				}
			}
		}
		const workers = Array.from({ length: Math.min(multipartConcurrency, multipartItems.length) }, () => worker())
		await Promise.all(workers)
	}

	const promise = (async () => {
		await Promise.all([runSingles(), runMultiparts()])
		return { skipped }
	})()

	return {
		promise,
		abort: () => {
			aborted = true
			for (const abort of aborters) abort()
		},
	}
}

