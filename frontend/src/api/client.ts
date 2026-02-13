import type {
	Bucket,
	BucketCreateRequest,
	BucketPolicyPutRequest,
	BucketPolicyResponse,
	BucketPolicyValidateResponse,
	DeleteObjectsResponse,
	ErrorResponse,
	Job,
	JobCreateRequest,
	JobCreatedResponse,
	JobsListResponse,
	ListObjectsResponse,
	ListLocalEntriesResponse,
	ObjectIndexSummaryResponse,
	SearchObjectsResponse,
	MetaResponse,
	ObjectMeta,
	PresignedURLResponse,
	CreateFolderRequest,
	CreateFolderResponse,
	Profile,
	ProfileCreateRequest,
	ProfileTestResponse,
	ProfileTLSConfig,
	ProfileTLSStatus,
	ProfileUpdateRequest,
	ObjectFavorite,
	ObjectFavoriteCreateRequest,
	ObjectFavoritesResponse,
	UploadCreateRequest,
	UploadCreateResponse,
	UploadMultipartAbortRequest,
	UploadMultipartCompleteRequest,
	UploadPresignRequest,
	UploadPresignResponse,
} from './types'
import { clearNetworkStatus, logNetworkEvent, publishNetworkStatus } from '../lib/networkStatus'

export const RETRY_COUNT_STORAGE_KEY = 'apiRetryCount'
export const RETRY_DELAY_STORAGE_KEY = 'apiRetryDelayMs'
export const DEFAULT_TIMEOUT_MS = 30_000
export const DEFAULT_RETRY_COUNT = 2
export const DEFAULT_RETRY_DELAY_MS = 600
export const MAX_RETRY_DELAY_MS = 5000

export type NormalizedError = {
	code: string
	retryable: boolean
}
export const RETRY_COUNT_MIN = 0
export const RETRY_COUNT_MAX = 5
export const RETRY_DELAY_MIN_MS = 200
export const RETRY_DELAY_MAX_MS = 5000

export class APIError extends Error {
	status: number
	code: string
	normalizedError?: NormalizedError
	details?: Record<string, unknown>
	retryAfterSeconds?: number

	constructor(args: { status: number; code: string; message: string; normalizedError?: NormalizedError; details?: Record<string, unknown>; retryAfterSeconds?: number }) {
		super(args.message)
		this.name = 'APIError'
		this.status = args.status
		this.code = args.code
		this.normalizedError = args.normalizedError
		this.details = args.details
		this.retryAfterSeconds = args.retryAfterSeconds
	}
}

export class RequestAbortedError extends Error {
	constructor(message = 'request aborted') {
		super(message)
		this.name = 'RequestAbortedError'
	}
}

export class RequestTimeoutError extends Error {
	timeoutMs: number
	constructor(timeoutMs: number, message = `request timed out after ${timeoutMs}ms`) {
		super(message)
		this.name = 'RequestTimeoutError'
		this.timeoutMs = timeoutMs
	}
}

type RequestOptions = {
	profileId?: string
	timeoutMs?: number
	retries?: number
	retryDelayMs?: number
}

export type UploadFileItem = {
	file: File
	relPath?: string
}

export type UploadCommitItem = {
	path: string
	size?: number
}

export type UploadCommitRequest = {
	label?: string
	rootName?: string
	rootKind?: 'file' | 'folder' | 'collection'
	totalFiles?: number
	totalBytes?: number
	items?: UploadCommitItem[]
	itemsTruncated?: boolean
}

export type UploadFilesResult = {
	skipped: number
}

export type UploadChunkState = {
	present: number[]
}

function normalizeListObjectsResponse(
	resp: ListObjectsResponse,
	fallback: { bucket: string; prefix?: string; delimiter?: string },
): ListObjectsResponse {
	if (!resp || typeof resp !== 'object') {
		return {
			bucket: fallback.bucket,
			prefix: fallback.prefix ?? '',
			delimiter: fallback.delimiter ?? '/',
			commonPrefixes: [],
			items: [],
			isTruncated: false,
		}
	}
	const safe = resp as ListObjectsResponse
	const commonPrefixes = Array.isArray(safe.commonPrefixes) ? safe.commonPrefixes : []
	const items = Array.isArray(safe.items) ? safe.items : []
	return { ...safe, commonPrefixes, items }
}

function resolveUploadFilename(item: UploadFileItem): string {
	const fileWithPath = item.file as File & { webkitRelativePath?: string; relativePath?: string }
	const relPath = (item.relPath ?? fileWithPath.webkitRelativePath ?? fileWithPath.relativePath ?? '').trim()
	return relPath || item.file.name
}

export class APIClient {
	private baseUrl: string
	private apiToken: string

	constructor(args: { baseUrl?: string; apiToken?: string } = {}) {
		this.baseUrl = args.baseUrl ?? '/api/v1'
		this.apiToken = args.apiToken ?? ''
	}

	withProfile(profileId: string): APIClient {
		const next = new APIClient({ baseUrl: this.baseUrl, apiToken: this.apiToken })
		next.requestDefaults.profileId = profileId
		return next
	}

	private requestDefaults: RequestOptions = {}

	private async fetchOrThrow(path: string, init: RequestInit, options: RequestOptions = {}): Promise<Response> {
		const headers = new Headers(init.headers ?? {})
		const profileId = options.profileId ?? this.requestDefaults.profileId
		if (profileId) {
			headers.set('X-Profile-Id', profileId)
		}
		if (this.apiToken) {
			headers.set('X-Api-Token', this.apiToken)
		}

		const res = await fetchWithRetry(this.baseUrl + path, {
			...init,
			headers,
		}, options)

		const contentType = res.headers.get('content-type') ?? ''
		const isJSON = contentType.includes('application/json')
		const retryAfterSeconds = parseRetryAfterSeconds(res.headers.get('Retry-After'))

		if (!res.ok) {
			let body: unknown = null
			if (isJSON) {
				body = await res.json().catch(() => null)
			} else {
				body = await res.text().catch(() => null)
			}

			if (typeof body === 'object' && body !== null && 'error' in body) {
				const er = body as ErrorResponse
				throw new APIError({
					status: res.status,
					code: er.error?.code ?? 'error',
					message: er.error?.message ?? res.statusText,
						normalizedError: er.error?.normalizedError ?? undefined,
					details: er.error?.details,
					retryAfterSeconds,
				})
			}
			throw new APIError({
				status: res.status,
				code: 'http_error',
				message: typeof body === 'string' && body ? body : res.statusText,
				retryAfterSeconds,
			})
		}

		return res
	}

	private async fetchOrThrowRaw(path: string, init: RequestInit, options: RequestOptions = {}): Promise<Response> {
		const headers = new Headers(init.headers ?? {})
		const profileId = options.profileId ?? this.requestDefaults.profileId
		if (profileId) {
			headers.set('X-Profile-Id', profileId)
		}
		if (this.apiToken) {
			headers.set('X-Api-Token', this.apiToken)
		}

		const res = await fetchWithRetry(this.baseUrl + path, {
			...init,
			headers,
		}, options)

		if (res.ok) return res
		const bodyText = await res.text().catch(() => null)
		throw parseAPIError(res.status, bodyText)
	}

	private async request<T>(path: string, init: RequestInit, options: RequestOptions = {}): Promise<T> {
		const res = await this.fetchOrThrow(path, init, options)
		if (res.status === 204) {
			return undefined as T
		}

		const contentType = res.headers.get('content-type') ?? ''
		const isJSON = contentType.includes('application/json')

		if (isJSON) {
			return (await res.json()) as T
		}

		return (await res.text()) as unknown as T
	}

	getMeta(): Promise<MetaResponse> {
		return this.request('/meta', { method: 'GET' })
	}

	listProfiles(): Promise<Profile[]> {
		return this.request('/profiles', { method: 'GET' })
	}

	createProfile(req: ProfileCreateRequest): Promise<Profile> {
		return this.request('/profiles', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(req),
		})
	}

	updateProfile(profileId: string, req: ProfileUpdateRequest): Promise<Profile> {
		return this.request(`/profiles/${encodeURIComponent(profileId)}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(req),
		})
	}

	deleteProfile(profileId: string): Promise<void> {
		return this.request(`/profiles/${encodeURIComponent(profileId)}`, { method: 'DELETE' })
	}

	testProfile(profileId: string): Promise<ProfileTestResponse> {
		return this.request(`/profiles/${encodeURIComponent(profileId)}/test`, { method: 'POST' }, { timeoutMs: defaultTimeoutMs })
	}

	getProfileTLS(profileId: string): Promise<ProfileTLSStatus> {
		return this.request(`/profiles/${encodeURIComponent(profileId)}/tls`, { method: 'GET' })
	}

	updateProfileTLS(profileId: string, req: ProfileTLSConfig): Promise<ProfileTLSStatus> {
		return this.request(`/profiles/${encodeURIComponent(profileId)}/tls`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(req),
		})
	}

	deleteProfileTLS(profileId: string): Promise<void> {
		return this.request(`/profiles/${encodeURIComponent(profileId)}/tls`, { method: 'DELETE' })
	}

	exportProfileYaml(profileId: string, args: { download?: boolean } = {}): Promise<string> {
		const params = new URLSearchParams()
		if (args.download) params.set('download', 'true')
		const suffix = params.toString()
		return this.request(`/profiles/${encodeURIComponent(profileId)}/export${suffix ? `?${suffix}` : ''}`, { method: 'GET' })
	}

	listBuckets(profileId: string): Promise<Bucket[]> {
		return this.request('/buckets', { method: 'GET' }, { profileId })
	}

	createBucket(profileId: string, req: BucketCreateRequest): Promise<Bucket> {
		return this.request(
			'/buckets',
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(req),
			},
			{ profileId },
		)
	}

	deleteBucket(profileId: string, bucket: string): Promise<void> {
		return this.request(`/buckets/${encodeURIComponent(bucket)}`, { method: 'DELETE' }, { profileId })
	}


	getBucketPolicy(profileId: string, bucket: string): Promise<BucketPolicyResponse> {
		return this.request(`/buckets/${encodeURIComponent(bucket)}/policy`, { method: 'GET' }, { profileId })
	}

	putBucketPolicy(profileId: string, bucket: string, req: BucketPolicyPutRequest): Promise<void> {
		return this.request(
			`/buckets/${encodeURIComponent(bucket)}/policy`,
			{
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(req),
			},
			{ profileId },
		)
	}

	deleteBucketPolicy(profileId: string, bucket: string): Promise<void> {
		return this.request(`/buckets/${encodeURIComponent(bucket)}/policy`, { method: 'DELETE' }, { profileId })
	}

	validateBucketPolicy(profileId: string, bucket: string, req: BucketPolicyPutRequest): Promise<BucketPolicyValidateResponse> {
		return this.request(
			`/buckets/${encodeURIComponent(bucket)}/policy/validate`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(req),
			},
			{ profileId },
		)
	}


	listObjects(args: {
		profileId: string
		bucket: string
		prefix?: string
		delimiter?: string
		maxKeys?: number
		continuationToken?: string
	}): Promise<ListObjectsResponse> {
		const params = new URLSearchParams()
		if (args.prefix) params.set('prefix', args.prefix)
		if (args.delimiter) params.set('delimiter', args.delimiter)
		if (args.maxKeys) params.set('maxKeys', String(args.maxKeys))
		if (args.continuationToken) params.set('continuationToken', args.continuationToken)
		const qs = params.toString()
		return this.request<ListObjectsResponse>(
			`/buckets/${encodeURIComponent(args.bucket)}/objects${qs ? `?${qs}` : ''}`,
			{ method: 'GET' },
			{ profileId: args.profileId },
		).then((resp) =>
			normalizeListObjectsResponse(resp, {
				bucket: args.bucket,
				prefix: args.prefix,
				delimiter: args.delimiter,
			}),
		)
	}

	searchObjectsIndex(args: {
		profileId: string
		bucket: string
		q: string
		prefix?: string
		limit?: number
		cursor?: string
		ext?: string
		minSize?: number
		maxSize?: number
		modifiedAfter?: string
		modifiedBefore?: string
	}): Promise<SearchObjectsResponse> {
		const params = new URLSearchParams()
		params.set('q', args.q)
		if (args.prefix) params.set('prefix', args.prefix)
		if (args.limit) params.set('limit', String(args.limit))
		if (args.cursor) params.set('cursor', args.cursor)
		if (args.ext) params.set('ext', args.ext)
		if (args.minSize != null) params.set('minSize', String(args.minSize))
		if (args.maxSize != null) params.set('maxSize', String(args.maxSize))
		if (args.modifiedAfter) params.set('modifiedAfter', args.modifiedAfter)
		if (args.modifiedBefore) params.set('modifiedBefore', args.modifiedBefore)
		return this.request(
			`/buckets/${encodeURIComponent(args.bucket)}/objects/search?${params.toString()}`,
			{ method: 'GET' },
			{ profileId: args.profileId },
		)
	}

	getObjectIndexSummary(args: {
		profileId: string
		bucket: string
		prefix?: string
		sampleLimit?: number
	}): Promise<ObjectIndexSummaryResponse> {
		const params = new URLSearchParams()
		if (args.prefix) params.set('prefix', args.prefix)
		if (args.sampleLimit != null) params.set('sampleLimit', String(args.sampleLimit))
		const qs = params.toString()
		return this.request(
			`/buckets/${encodeURIComponent(args.bucket)}/objects/index-summary${qs ? `?${qs}` : ''}`,
			{ method: 'GET' },
			{ profileId: args.profileId },
		)
	}

	listLocalEntries(args: { profileId: string; path?: string; limit?: number }): Promise<ListLocalEntriesResponse> {
		const params = new URLSearchParams()
		if (args.path) params.set('path', args.path)
		if (args.limit != null) params.set('limit', String(args.limit))
		const qs = params.toString()
		return this.request(`/local/entries${qs ? `?${qs}` : ''}`, { method: 'GET' }, { profileId: args.profileId })
	}

	getObjectMeta(args: { profileId: string; bucket: string; key: string }): Promise<ObjectMeta> {
		const params = new URLSearchParams()
		params.set('key', args.key)
		return this.request(
			`/buckets/${encodeURIComponent(args.bucket)}/objects/meta?${params.toString()}`,
			{ method: 'GET' },
			{ profileId: args.profileId },
		)
	}

	getObjectDownloadURL(args: {
		profileId: string
		bucket: string
		key: string
		expiresSeconds?: number
		proxy?: boolean
	}): Promise<PresignedURLResponse> {
		const params = new URLSearchParams()
		params.set('key', args.key)
		if (args.expiresSeconds) params.set('expiresSeconds', String(args.expiresSeconds))
		if (args.proxy) params.set('proxy', 'true')
		return this.request(
			`/buckets/${encodeURIComponent(args.bucket)}/objects/download-url?${params.toString()}`,
			{ method: 'GET' },
			{ profileId: args.profileId },
		)
	}

	createFolder(args: { profileId: string; bucket: string; key: string }): Promise<CreateFolderResponse> {
		const req: CreateFolderRequest = { key: args.key }
		return this.request(
			`/buckets/${encodeURIComponent(args.bucket)}/objects/folder`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(req),
			},
			{ profileId: args.profileId },
		)
	}

	deleteObjects(args: { profileId: string; bucket: string; keys: string[] }): Promise<DeleteObjectsResponse> {
		return this.request(
			`/buckets/${encodeURIComponent(args.bucket)}/objects`,
			{
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ keys: args.keys }),
			},
			{ profileId: args.profileId },
		)
	}

	listObjectFavorites(args: { profileId: string; bucket: string; prefix?: string }): Promise<ObjectFavoritesResponse> {
		const params = new URLSearchParams()
		if (args.prefix) params.set('prefix', args.prefix)
		const qs = params.toString()
		return this.request(
			`/buckets/${encodeURIComponent(args.bucket)}/objects/favorites${qs ? `?${qs}` : ''}`,
			{ method: 'GET' },
			{ profileId: args.profileId },
		)
	}

	createObjectFavorite(args: { profileId: string; bucket: string; key: string }): Promise<ObjectFavorite> {
		const payload: ObjectFavoriteCreateRequest = { key: args.key }
		return this.request(
			`/buckets/${encodeURIComponent(args.bucket)}/objects/favorites`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload),
			},
			{ profileId: args.profileId },
		)
	}

	deleteObjectFavorite(args: { profileId: string; bucket: string; key: string }): Promise<void> {
		const params = new URLSearchParams()
		params.set('key', args.key)
		return this.request(
			`/buckets/${encodeURIComponent(args.bucket)}/objects/favorites?${params.toString()}`,
			{ method: 'DELETE' },
			{ profileId: args.profileId },
		)
	}

	createUpload(profileId: string, req: UploadCreateRequest): Promise<UploadCreateResponse> {
		return this.request(
			'/uploads',
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(req),
			},
			{ profileId },
		)
	}

	presignUpload(profileId: string, uploadId: string, req: UploadPresignRequest): Promise<UploadPresignResponse> {
		return this.request(
			`/uploads/${encodeURIComponent(uploadId)}/presign`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(req),
			},
			{ profileId },
		)
	}

	completeMultipartUpload(profileId: string, uploadId: string, req: UploadMultipartCompleteRequest): Promise<void> {
		return this.request(
			`/uploads/${encodeURIComponent(uploadId)}/multipart/complete`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(req),
			},
			{ profileId },
		)
	}

	abortMultipartUpload(profileId: string, uploadId: string, req: UploadMultipartAbortRequest): Promise<void> {
		return this.request(
			`/uploads/${encodeURIComponent(uploadId)}/multipart/abort`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(req),
			},
			{ profileId },
		)
	}

	uploadFiles(profileId: string, uploadId: string, files: UploadFileItem[]): Promise<void> {
		const form = new FormData()
		for (const item of files) {
			form.append('files', item.file, resolveUploadFilename(item))
		}
		return this.request(`/uploads/${encodeURIComponent(uploadId)}/files`, { method: 'POST', body: form }, { profileId })
	}

	commitUpload(profileId: string, uploadId: string, req?: UploadCommitRequest): Promise<JobCreatedResponse> {
		if (req) {
			return this.request(
				`/uploads/${encodeURIComponent(uploadId)}/commit`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(req),
				},
				{ profileId },
			)
		}
		return this.request(`/uploads/${encodeURIComponent(uploadId)}/commit`, { method: 'POST' }, { profileId })
	}

	deleteUpload(profileId: string, uploadId: string): Promise<void> {
		return this.request(`/uploads/${encodeURIComponent(uploadId)}`, { method: 'DELETE' }, { profileId })
	}

	uploadFilesWithProgress(
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
			return this.uploadFileChunksWithProgress(profileId, uploadId, only, {
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
				form.append('files', item.file, resolveUploadFilename(item))
			}

			const xhr = new XMLHttpRequest()
			xhr.open('POST', this.baseUrl + `/uploads/${encodeURIComponent(uploadId)}/files`)
			xhr.setRequestHeader('X-Profile-Id', profileId)
			if (this.apiToken) xhr.setRequestHeader('X-Api-Token', this.apiToken)

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
					const handle = this.uploadFileChunksWithProgress(profileId, uploadId, item, {
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

	private uploadFileChunksWithProgress(
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
				xhr.open('POST', this.baseUrl + `/uploads/${encodeURIComponent(uploadId)}/files`)
				xhr.setRequestHeader('X-Profile-Id', profileId)
				if (this.apiToken) xhr.setRequestHeader('X-Api-Token', this.apiToken)
				xhr.setRequestHeader('X-Upload-Chunk-Index', String(chunkIndex))
				xhr.setRequestHeader('X-Upload-Chunk-Total', String(totalChunks))
				xhr.setRequestHeader('X-Upload-Chunk-Size', String(chunkSizeBytes))
				xhr.setRequestHeader('X-Upload-File-Size', String(file.size))
				xhr.setRequestHeader('X-Upload-Relative-Path', resolveUploadFilename(item))

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

	getUploadChunks(
		profileId: string,
		uploadId: string,
		args: { path: string; total: number; chunkSize: number; fileSize: number },
	): Promise<UploadChunkState> {
		const params = new URLSearchParams()
		params.set('path', args.path)
		params.set('total', String(args.total))
		params.set('chunkSize', String(args.chunkSize))
		params.set('fileSize', String(args.fileSize))
		return this.request(`/uploads/${encodeURIComponent(uploadId)}/chunks?${params.toString()}`, { method: 'GET' }, { profileId })
	}

	downloadObject(
		args: { profileId: string; bucket: string; key: string },
		opts: { onProgress?: (progress: { loadedBytes: number; totalBytes?: number }) => void } = {},
	): { promise: Promise<{ blob: Blob; contentDisposition: string | null; contentType: string | null }>; abort: () => void } {
		const params = new URLSearchParams()
		params.set('key', args.key)

		const xhr = new XMLHttpRequest()
		xhr.open('GET', this.baseUrl + `/buckets/${encodeURIComponent(args.bucket)}/objects/download?${params.toString()}`)
		xhr.responseType = 'blob'

		xhr.setRequestHeader('X-Profile-Id', args.profileId)
		if (this.apiToken) xhr.setRequestHeader('X-Api-Token', this.apiToken)

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

	downloadObjectStream(args: { profileId: string; bucket: string; key: string; signal?: AbortSignal }): Promise<Response> {
		const params = new URLSearchParams()
		params.set('key', args.key)
		return this.fetchOrThrowRaw(
			`/buckets/${encodeURIComponent(args.bucket)}/objects/download?${params.toString()}`,
			{ method: 'GET', signal: args.signal },
			{ profileId: args.profileId, timeoutMs: 0, retries: 0 },
		)
	}

	downloadObjectThumbnail(
		args: { profileId: string; bucket: string; key: string; size?: number },
	): { promise: Promise<{ blob: Blob; contentType: string | null }>; abort: () => void } {
		const params = new URLSearchParams()
		params.set('key', args.key)
		if (args.size) params.set('size', String(args.size))

		const xhr = new XMLHttpRequest()
		xhr.open('GET', this.baseUrl + `/buckets/${encodeURIComponent(args.bucket)}/objects/thumbnail?${params.toString()}`)
		xhr.responseType = 'blob'

		xhr.setRequestHeader('X-Profile-Id', args.profileId)
		if (this.apiToken) xhr.setRequestHeader('X-Api-Token', this.apiToken)

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

	downloadJobArtifact(
		args: { profileId: string; jobId: string },
		opts: { onProgress?: (progress: { loadedBytes: number; totalBytes?: number }) => void } = {},
	): { promise: Promise<{ blob: Blob; contentDisposition: string | null; contentType: string | null }>; abort: () => void } {
		const xhr = new XMLHttpRequest()
		xhr.open('GET', this.baseUrl + `/jobs/${encodeURIComponent(args.jobId)}/artifact`)
		xhr.responseType = 'blob'

		xhr.setRequestHeader('X-Profile-Id', args.profileId)
		if (this.apiToken) xhr.setRequestHeader('X-Api-Token', this.apiToken)

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

	listJobs(
		profileId: string,
		args: { status?: string; type?: string; errorCode?: string; limit?: number; cursor?: string } = {},
	): Promise<JobsListResponse> {
		const params = new URLSearchParams()
		if (args.status) params.set('status', args.status)
		if (args.type) params.set('type', args.type)
		if (args.errorCode) params.set('errorCode', args.errorCode)
		if (args.limit) params.set('limit', String(args.limit))
		if (args.cursor) params.set('cursor', args.cursor)
		const qs = params.toString()
		return this.request(`/jobs${qs ? `?${qs}` : ''}`, { method: 'GET' }, { profileId })
	}

	createJob(profileId: string, req: JobCreateRequest): Promise<Job> {
		return this.request(
			'/jobs',
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(req),
			},
			{ profileId },
		)
	}

	getJob(profileId: string, jobId: string): Promise<Job> {
		return this.request(`/jobs/${encodeURIComponent(jobId)}`, { method: 'GET' }, { profileId })
	}

	deleteJob(profileId: string, jobId: string): Promise<void> {
		return this.request(`/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' }, { profileId })
	}

	getJobLogs(profileId: string, jobId: string, tailBytes = 64 * 1024): Promise<string> {
		const params = new URLSearchParams()
		params.set('tailBytes', String(tailBytes))
		return this.request(`/jobs/${encodeURIComponent(jobId)}/logs?${params.toString()}`, { method: 'GET' }, { profileId })
	}

	async getJobLogsTail(profileId: string, jobId: string, tailBytes = 64 * 1024): Promise<{ text: string; nextOffset: number }> {
		const params = new URLSearchParams()
		params.set('tailBytes', String(tailBytes))
		const res = await this.fetchOrThrow(`/jobs/${encodeURIComponent(jobId)}/logs?${params.toString()}`, { method: 'GET' }, { profileId })
		const text = res.status === 204 ? '' : await res.text()
		const rawOffset = res.headers.get('X-Log-Next-Offset') ?? res.headers.get('x-log-next-offset') ?? '0'
		const nextOffset = Number.parseInt(rawOffset, 10)
		return { text, nextOffset: Number.isFinite(nextOffset) ? nextOffset : 0 }
	}

	async getJobLogsAfterOffset(
		profileId: string,
		jobId: string,
		afterOffset: number,
		maxBytes = 64 * 1024,
	): Promise<{ text: string; nextOffset: number }> {
		const params = new URLSearchParams()
		params.set('afterOffset', String(afterOffset))
		params.set('maxBytes', String(maxBytes))
		const res = await this.fetchOrThrow(`/jobs/${encodeURIComponent(jobId)}/logs?${params.toString()}`, { method: 'GET' }, { profileId })
		const text = res.status === 204 ? '' : await res.text()
		const rawOffset = res.headers.get('X-Log-Next-Offset') ?? res.headers.get('x-log-next-offset') ?? '0'
		const nextOffset = Number.parseInt(rawOffset, 10)
		return { text, nextOffset: Number.isFinite(nextOffset) ? nextOffset : afterOffset }
	}

	cancelJob(profileId: string, jobId: string): Promise<Job> {
		return this.request(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }, { profileId })
	}

	retryJob(profileId: string, jobId: string): Promise<Job> {
		return this.request(`/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' }, { profileId })
	}
}

const defaultTimeoutMs = DEFAULT_TIMEOUT_MS
const defaultRetries = DEFAULT_RETRY_COUNT
const defaultRetryDelayMs = DEFAULT_RETRY_DELAY_MS
const maxRetryDelayMs = MAX_RETRY_DELAY_MS

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function isIdempotentMethod(method?: string): boolean {
	return !method || method.toUpperCase() === 'GET'
}

function shouldRetryStatus(status: number): boolean {
	return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseNormalizedErrorFromBody(body: unknown): NormalizedError | undefined {
	if (!isRecord(body)) return undefined
	const rawErr = body.error
	if (!isRecord(rawErr)) return undefined
	const rawNorm = rawErr.normalizedError
	if (!isRecord(rawNorm)) return undefined
	const code = rawNorm.code
	const retryable = rawNorm.retryable
	if (typeof code !== 'string' || typeof retryable !== 'boolean') return undefined
	return { code, retryable }
}

async function readNormalizedErrorFromResponse(res: Response): Promise<NormalizedError | undefined> {
	const contentType = res.headers.get('content-type') ?? ''
	if (!contentType.includes('application/json')) return undefined
	try {
		const body = (await res.clone().json()) as unknown
		return parseNormalizedErrorFromBody(body)
	} catch {
		return undefined
	}
}

function isRetryableFetchError(err: unknown): boolean {
	if (err instanceof RequestTimeoutError) return true
	if (err instanceof RequestAbortedError) return false
	if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError') return false
	return err instanceof TypeError
}

function retryDelayMs(baseDelayMs: number, attempt: number): number {
	const jitter = Math.floor(Math.random() * 200)
	const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxRetryDelayMs)
	return delay + jitter
}

function retryDelayLabel(delayMs: number): string {
	return `${Math.max(1, Math.ceil(delayMs / 1000))}s`
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
	if (!timeoutMs || timeoutMs <= 0) {
		return fetch(url, init)
	}

	let timedOut = false
	const controller = new AbortController()
	const signal = controller.signal

	let cleanup = () => {}
	if (init.signal) {
		if (init.signal.aborted) {
			controller.abort()
		} else {
			const onAbort = () => controller.abort()
			init.signal.addEventListener('abort', onAbort, { once: true })
			cleanup = () => init.signal?.removeEventListener('abort', onAbort)
		}
	}

	const timer = setTimeout(() => {
		timedOut = true
		controller.abort()
	}, timeoutMs)

	try {
		return await fetch(url, { ...init, signal })
	} catch (err) {
		if (timedOut) throw new RequestTimeoutError(timeoutMs)
		throw err
	} finally {
		clearTimeout(timer)
		cleanup()
	}
}

async function fetchWithRetry(url: string, init: RequestInit, options: RequestOptions): Promise<Response> {
	const idempotent = isIdempotentMethod(init.method)
	const retryDefaults = readRetryDefaults()
	const retries = options.retries ?? (idempotent ? retryDefaults.retries : 0)
	const timeoutMs = options.timeoutMs ?? (idempotent ? defaultTimeoutMs : 0)
	const baseDelayMs = options.retryDelayMs ?? retryDefaults.retryDelayMs

	let attempt = 0
	for (;;) {
		try {
			const res = await fetchWithTimeout(url, init, timeoutMs)
			if (!res.ok && idempotent && attempt < retries) {
				const retryAfterSeconds = parseRetryAfterSeconds(res.headers.get('Retry-After'))
				const normalizedError = await readNormalizedErrorFromResponse(res)
				const retryDueToStatus = shouldRetryStatus(res.status)
				const retryDueToNormalized = normalizedError?.retryable === true
				if (retryDueToStatus || retryDueToNormalized) {
					const delayMs =
						retryAfterSeconds != null ? Math.min(retryAfterSeconds * 1000, maxRetryDelayMs) : retryDelayMs(baseDelayMs, attempt)
					const delayLabel = retryDelayLabel(delayMs)
					const reasonParts: string[] = [retryDueToStatus ? `HTTP ${res.status}` : `normalized=${normalizedError?.code ?? 'retryable'}`]
					if (retryAfterSeconds != null) reasonParts.push(`Retry-After ${retryAfterSeconds}s`)
					if (retryDueToStatus && normalizedError?.code) reasonParts.push(`normalized=${normalizedError.code}`)
					const reason = reasonParts.join(', ')
					logNetworkEvent({ kind: 'retry', message: `Retry ${attempt + 1}/${retries} in ${delayLabel} (${reason})` })
					const msg = `Temporary request failure (${reason}). Auto-retry in ${delayLabel}.`
					publishNetworkStatus({ kind: 'unstable', message: msg })
					await sleep(delayMs)
					attempt += 1
					continue
				}
			}
			if (attempt > 0 && res.ok) clearNetworkStatus()
			return res
		} catch (err) {
			if (idempotent && attempt < retries && isRetryableFetchError(err)) {
				const delayMs = retryDelayMs(baseDelayMs, attempt)
				const delayLabel = retryDelayLabel(delayMs)
				logNetworkEvent({ kind: 'retry', message: `Retry ${attempt + 1}/${retries} in ${delayLabel} (network error)` })
				publishNetworkStatus({ kind: 'unstable', message: `Network unstable. Auto-retry in ${delayLabel}.` })
				await sleep(delayMs)
				attempt += 1
				continue
			}
			throw err
		}
	}
}

function clampNumber(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min
	return Math.min(max, Math.max(min, value))
}

function readRetryDefaults(): { retries: number; retryDelayMs: number } {
	if (typeof window === 'undefined') {
		return { retries: defaultRetries, retryDelayMs: defaultRetryDelayMs }
	}
	try {
		const rawRetries = window.localStorage.getItem(RETRY_COUNT_STORAGE_KEY)
		const rawDelay = window.localStorage.getItem(RETRY_DELAY_STORAGE_KEY)
		const retries = rawRetries ? Number.parseInt(rawRetries, 10) : defaultRetries
		const retryDelayMs = rawDelay ? Number.parseInt(rawDelay, 10) : defaultRetryDelayMs
		return {
			retries: clampNumber(retries, RETRY_COUNT_MIN, RETRY_COUNT_MAX),
			retryDelayMs: clampNumber(retryDelayMs, RETRY_DELAY_MIN_MS, RETRY_DELAY_MAX_MS),
		}
	} catch {
		return { retries: defaultRetries, retryDelayMs: defaultRetryDelayMs }
	}
}

function parseRetryAfterSeconds(value: string | null): number | undefined {
	if (!value) return undefined
	const seconds = Number.parseInt(value, 10)
	if (Number.isFinite(seconds)) {
		return Math.max(0, seconds)
	}
	const parsedDate = Date.parse(value)
	if (!Number.isNaN(parsedDate)) {
		const diffMs = parsedDate - Date.now()
		if (diffMs <= 0) return 0
		return Math.ceil(diffMs / 1000)
	}
	return undefined
}

function parseAPIError(status: number, bodyText: string | null): APIError {
	const raw = typeof bodyText === 'string' ? bodyText : ''
	try {
		const parsed: unknown = JSON.parse(raw)
		if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
			const er = parsed as ErrorResponse
			return new APIError({
				status,
				code: er.error?.code ?? 'error',
				message: er.error?.message ?? 'request failed',
				normalizedError: er.error?.normalizedError ?? undefined,
				details: er.error?.details,
			})
		}
	} catch {
		// fall through
	}

	return new APIError({
		status,
		code: 'http_error',
		message: raw || 'request failed',
	})
}

async function blobToTextSafe(blob: Blob | null): Promise<string | null> {
	if (!blob) return null
	try {
		return await blob.text()
	} catch {
		return null
	}
}
