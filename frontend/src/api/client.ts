import type {
	Bucket,
	BucketCreateRequest,
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
} from './types'

export class APIError extends Error {
	status: number
	code: string
	details?: Record<string, unknown>
	retryAfterSeconds?: number

	constructor(args: { status: number; code: string; message: string; details?: Record<string, unknown>; retryAfterSeconds?: number }) {
		super(args.message)
		this.name = 'APIError'
		this.status = args.status
		this.code = args.code
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

type RequestOptions = {
	profileId?: string
}

export type UploadFileItem = {
	file: File
	relPath?: string
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

		const res = await fetch(this.baseUrl + path, {
			...init,
			headers,
		})

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

		const res = await fetch(this.baseUrl + path, {
			...init,
			headers,
		})

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
		return this.request(`/profiles/${encodeURIComponent(profileId)}/test`, { method: 'POST' })
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
		return this.request(
			`/buckets/${encodeURIComponent(args.bucket)}/objects${qs ? `?${qs}` : ''}`,
			{ method: 'GET' },
			{ profileId: args.profileId },
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

	getObjectDownloadURL(args: { profileId: string; bucket: string; key: string; expiresSeconds?: number }): Promise<PresignedURLResponse> {
		const params = new URLSearchParams()
		params.set('key', args.key)
		if (args.expiresSeconds) params.set('expiresSeconds', String(args.expiresSeconds))
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

	uploadFiles(profileId: string, uploadId: string, files: UploadFileItem[]): Promise<void> {
		const form = new FormData()
		for (const item of files) {
			form.append('files', item.file, resolveUploadFilename(item))
		}
		return this.request(`/uploads/${encodeURIComponent(uploadId)}/files`, { method: 'POST', body: form }, { profileId })
	}

	commitUpload(profileId: string, uploadId: string): Promise<JobCreatedResponse> {
		return this.request(`/uploads/${encodeURIComponent(uploadId)}/commit`, { method: 'POST' }, { profileId })
	}

	deleteUpload(profileId: string, uploadId: string): Promise<void> {
		return this.request(`/uploads/${encodeURIComponent(uploadId)}`, { method: 'DELETE' }, { profileId })
	}

	uploadFilesWithProgress(
		profileId: string,
		uploadId: string,
		files: UploadFileItem[],
		args: { onProgress?: (progress: { loadedBytes: number; totalBytes?: number }) => void } = {},
	): { promise: Promise<void>; abort: () => void } {
		const form = new FormData()
		for (const item of files) {
			form.append('files', item.file, resolveUploadFilename(item))
		}

		const xhr = new XMLHttpRequest()
		xhr.open('POST', this.baseUrl + `/uploads/${encodeURIComponent(uploadId)}/files`)

		xhr.setRequestHeader('X-Profile-Id', profileId)
		if (this.apiToken) xhr.setRequestHeader('X-Api-Token', this.apiToken)

		xhr.upload.onprogress = (e) => {
			if (!args.onProgress) return
			args.onProgress({
				loadedBytes: e.loaded,
				totalBytes: e.lengthComputable ? e.total : undefined,
			})
		}

		const promise = new Promise<void>((resolve, reject) => {
			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					resolve()
					return
				}
				reject(parseAPIError(xhr.status, xhr.responseText))
			}
			xhr.onerror = () => reject(new Error('network error'))
			xhr.onabort = () => reject(new RequestAbortedError())
		})

		xhr.send(form)

		return { promise, abort: () => xhr.abort() }
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
					resolve({
						blob: xhr.response,
						contentDisposition: xhr.getResponseHeader('content-disposition'),
						contentType: xhr.getResponseHeader('content-type'),
					})
					return
				}

				const bodyText = await blobToTextSafe(xhr.response)
				reject(parseAPIError(xhr.status, bodyText))
			}
			xhr.onerror = () => reject(new Error('network error'))
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
			{ profileId: args.profileId },
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
					resolve({
						blob: xhr.response,
						contentType: xhr.getResponseHeader('content-type'),
					})
					return
				}

				const bodyText = await blobToTextSafe(xhr.response)
				reject(parseAPIError(xhr.status, bodyText))
			}
			xhr.onerror = () => reject(new Error('network error'))
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
					resolve({
						blob: xhr.response,
						contentDisposition: xhr.getResponseHeader('content-disposition'),
						contentType: xhr.getResponseHeader('content-type'),
					})
					return
				}

				const bodyText = await blobToTextSafe(xhr.response)
				reject(parseAPIError(xhr.status, bodyText))
			}
			xhr.onerror = () => reject(new Error('network error'))
			xhr.onabort = () => reject(new RequestAbortedError())
		})

		xhr.send()
		return { promise, abort: () => xhr.abort() }
	}

	listJobs(profileId: string, args: { status?: string; type?: string; limit?: number; cursor?: string } = {}): Promise<JobsListResponse> {
		const params = new URLSearchParams()
		if (args.status) params.set('status', args.status)
		if (args.type) params.set('type', args.type)
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
