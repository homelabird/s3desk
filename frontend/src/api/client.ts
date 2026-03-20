import { getApiBaseUrl, normalizeApiBaseUrl } from './baseUrl'
import type { BucketsAPI, JobsAPI, ObjectsAPI, ProfilesAPI, ServerAPI, UploadsAPI } from './clientContracts'
import {
	createAPIClientFacades,
} from './clientSubFacades'
import { createAPIClientTransport } from './clientTransport'
import type { RequestOptions } from './retryTransport'

export {
	DEFAULT_RETRY_COUNT,
	DEFAULT_RETRY_DELAY_MS,
	DEFAULT_TIMEOUT_MS,
	MAX_RETRY_DELAY_MS,
	RETRY_COUNT_MAX,
	RETRY_COUNT_MIN,
	RETRY_COUNT_STORAGE_KEY,
	RETRY_DELAY_MAX_MS,
	RETRY_DELAY_MIN_MS,
	RETRY_DELAY_STORAGE_KEY,
} from './config'
export { APIError, RequestAbortedError, RequestTimeoutError } from './errors'
export type { NormalizedError } from './errors'
export type { UploadCommitItem, UploadCommitRequest, UploadFileItem, UploadFilesResult } from './uploads'
export type {
	BucketPreauthenticatedRequestClientView,
	BucketSharingClientView,
	BucketSharingPutClientRequest,
	ServerBackupConfidentialityMode,
	ServerBackupDownloadOptions,
	ServerBackupScope,
} from './types'

export class APIClient {
	private baseUrl: string
	private apiToken: string
	private requestDefaults: RequestOptions = {}
	private readonly transport = createAPIClientTransport({
		getBaseUrl: () => this.baseUrl,
		getApiToken: () => this.apiToken,
		getDefaultOptions: () => this.requestDefaults,
	})
	private readonly requestFn = <T>(path: string, init: RequestInit, options: RequestOptions = {}) => this.request<T>(path, init, options)
	private readonly fetchResponseFn = (path: string, init: RequestInit, options: RequestOptions = {}) => this.transport.fetchResponse(path, init, options)
	private readonly fetchRawResponseFn = (path: string, init: RequestInit, options: RequestOptions = {}) => this.transport.fetchRawResponse(path, init, options)
	private readonly facadeDeps = {
		requestFn: this.requestFn,
		fetchResponseFn: this.fetchResponseFn,
		fetchRawResponseFn: this.fetchRawResponseFn,
		getXhrConfig: () => this.xhrConfig,
	}
	private readonly facades = createAPIClientFacades(this.facadeDeps)

	constructor(args: { baseUrl?: string; apiToken?: string } = {}) {
		this.baseUrl = normalizeApiBaseUrl(args.baseUrl ?? getApiBaseUrl())
		this.apiToken = args.apiToken ?? ''
	}

	withProfile(profileId: string): APIClient {
		const next = new APIClient({ baseUrl: this.baseUrl, apiToken: this.apiToken })
		next.requestDefaults.profileId = profileId
		return next
	}

	private request<T>(path: string, init: RequestInit, options: RequestOptions = {}): Promise<T> {
		return this.transport.request<T>(path, init, options)
	}

	private get xhrConfig(): { baseUrl: string; apiToken: string } {
		return { baseUrl: this.baseUrl, apiToken: this.apiToken }
	}

	get server(): ServerAPI {
		return this.facades.server
	}

	get profiles(): ProfilesAPI {
		return this.facades.profiles
	}

	get buckets(): BucketsAPI {
		return this.facades.buckets
	}

	get objects(): ObjectsAPI {
		return this.facades.objects
	}

	get uploads(): UploadsAPI {
		return this.facades.uploads
	}

	get jobs(): JobsAPI {
		return this.facades.jobs
	}
}
