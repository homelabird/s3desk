import * as bucketsDomain from './domains/buckets'
import * as downloadsDomain from './domains/downloads'
import * as jobsDomain from './domains/jobs'
import * as objectsDomain from './domains/objects'
import * as profilesDomain from './domains/profiles'
import * as serverDomain from './domains/server'
import * as uploadsDomain from './domains/uploads'
import type {
	Bucket,
	BucketAccessPutRequest,
	BucketCreateRequest,
	BucketEncryptionPutRequest,
	BucketGovernanceView,
	BucketLifecyclePutRequest,
	BucketPolicyPutRequest,
	BucketPolicyResponse,
	BucketPolicyValidateResponse,
	BucketProtectionPutRequest,
	BucketPublicExposurePutRequest,
	BucketSharingClientView,
	BucketSharingPutClientRequest,
	BucketVersioningPutRequest,
	CreateFolderResponse,
	DeleteObjectsResponse,
	Job,
	JobCreateRequest,
	JobCreatedResponse,
	JobsListResponse,
	ListLocalEntriesResponse,
	ListObjectsResponse,
	MetaResponse,
	ObjectFavorite,
	ObjectFavoritesResponse,
	ObjectIndexSummaryResponse,
	ObjectMeta,
	PresignedURLResponse,
	Profile,
	ProfileBenchmarkResponse,
	ProfileCreateRequest,
	ProfileTestResponse,
	ProfileTLSConfig,
	ProfileTLSStatus,
	ProfileUpdateRequest,
	SearchObjectsResponse,
	ServerBackupConfidentialityMode,
	ServerBackupDownloadOptions,
	ServerBackupScope,
	ServerPortableImportResponse,
	ServerRestoreResponse,
	ServerStagedRestoreListResponse,
	UploadChunkState,
	UploadCreateRequest,
	UploadCreateResponse,
	UploadMultipartAbortRequest,
	UploadMultipartCompleteRequest,
	UploadPresignRequest,
	UploadPresignResponse,
} from './types'
import type { RequestOptions } from './retryTransport'
import type {
	UploadCommitRequest,
	UploadFileItem,
	UploadFilesResult,
} from './uploads'

type RequestFn = <T>(path: string, init: RequestInit, options?: RequestOptions) => Promise<T>
type FetchResponseFn = (path: string, init: RequestInit, options?: RequestOptions) => Promise<Response>
type XhrConfig = { baseUrl: string; apiToken: string }

type SubFacadeDeps = {
	requestFn: RequestFn
	fetchResponseFn: FetchResponseFn
	fetchRawResponseFn: FetchResponseFn
	getXhrConfig: () => XhrConfig
}

export function createAPIClientFacades(deps: SubFacadeDeps) {
	return {
		server: createServerSubFacade(deps),
		profiles: createProfilesSubFacade(deps),
		buckets: createBucketsSubFacade(deps),
		objects: createObjectsSubFacade(deps),
		uploads: createUploadsSubFacade(deps),
		jobs: createJobsSubFacade(deps),
	}
}

export function createServerSubFacade(deps: SubFacadeDeps) {
	return {
		getMeta(): Promise<MetaResponse> {
			return serverDomain.getMeta(deps.requestFn)
		},
		downloadServerBackup(
			scope: ServerBackupScope = 'full',
			confidentiality: ServerBackupConfidentialityMode = 'clear',
			options?: ServerBackupDownloadOptions,
		): { promise: Promise<{ blob: Blob; contentDisposition: string | null; contentType: string | null }>; abort: () => void } {
			return downloadsDomain.downloadServerBackup(deps.getXhrConfig(), scope, confidentiality, options)
		},
		restoreServerBackup(file: File, password?: string): Promise<ServerRestoreResponse> {
			return serverDomain.restoreServerBackup(deps.requestFn, file, password)
		},
		previewPortableImport(file: File, password?: string): Promise<ServerPortableImportResponse> {
			return serverDomain.previewPortableImport(deps.requestFn, file, password)
		},
		importPortableBackup(file: File, password?: string): Promise<ServerPortableImportResponse> {
			return serverDomain.importPortableBackup(deps.requestFn, file, password)
		},
		listServerRestores(): Promise<ServerStagedRestoreListResponse> {
			return serverDomain.listServerRestores(deps.requestFn)
		},
		deleteServerRestore(restoreId: string): Promise<void> {
			return serverDomain.deleteServerRestore(deps.requestFn, restoreId)
		},
	}
}

export function createProfilesSubFacade(deps: SubFacadeDeps) {
	return {
		listProfiles(): Promise<Profile[]> {
			return profilesDomain.listProfiles(deps.requestFn)
		},
		createProfile(req: ProfileCreateRequest): Promise<Profile> {
			return profilesDomain.createProfile(deps.requestFn, req)
		},
		updateProfile(profileId: string, req: ProfileUpdateRequest): Promise<Profile> {
			return profilesDomain.updateProfile(deps.requestFn, profileId, req)
		},
		deleteProfile(profileId: string): Promise<void> {
			return profilesDomain.deleteProfile(deps.requestFn, profileId)
		},
		testProfile(profileId: string): Promise<ProfileTestResponse> {
			return profilesDomain.testProfile(deps.requestFn, profileId)
		},
		benchmarkProfile(profileId: string): Promise<ProfileBenchmarkResponse> {
			return profilesDomain.benchmarkProfile(deps.requestFn, profileId)
		},
		getProfileTLS(profileId: string): Promise<ProfileTLSStatus> {
			return profilesDomain.getProfileTLS(deps.requestFn, profileId)
		},
		updateProfileTLS(profileId: string, req: ProfileTLSConfig): Promise<ProfileTLSStatus> {
			return profilesDomain.updateProfileTLS(deps.requestFn, profileId, req)
		},
		deleteProfileTLS(profileId: string): Promise<void> {
			return profilesDomain.deleteProfileTLS(deps.requestFn, profileId)
		},
		exportProfileYaml(profileId: string, args: { download?: boolean } = {}): Promise<string> {
			return profilesDomain.exportProfileYaml(deps.requestFn, profileId, args)
		},
	}
}

export function createBucketsSubFacade(deps: SubFacadeDeps) {
	return {
		listBuckets(profileId: string): Promise<Bucket[]> {
			return bucketsDomain.listBuckets(deps.requestFn, profileId)
		},
		createBucket(profileId: string, req: BucketCreateRequest): Promise<Bucket> {
			return bucketsDomain.createBucket(deps.requestFn, profileId, req)
		},
		deleteBucket(profileId: string, bucket: string): Promise<void> {
			return bucketsDomain.deleteBucket(deps.requestFn, profileId, bucket)
		},
		getBucketGovernance(profileId: string, bucket: string): Promise<BucketGovernanceView> {
			return bucketsDomain.getBucketGovernance(deps.requestFn, profileId, bucket)
		},
		putBucketAccess(profileId: string, bucket: string, req: BucketAccessPutRequest): Promise<void> {
			return bucketsDomain.putBucketAccess(deps.requestFn, profileId, bucket, req)
		},
		putBucketPublicExposure(profileId: string, bucket: string, req: BucketPublicExposurePutRequest): Promise<void> {
			return bucketsDomain.putBucketPublicExposure(deps.requestFn, profileId, bucket, req)
		},
		putBucketProtection(profileId: string, bucket: string, req: BucketProtectionPutRequest): Promise<void> {
			return bucketsDomain.putBucketProtection(deps.requestFn, profileId, bucket, req)
		},
		putBucketVersioning(profileId: string, bucket: string, req: BucketVersioningPutRequest): Promise<void> {
			return bucketsDomain.putBucketVersioning(deps.requestFn, profileId, bucket, req)
		},
		putBucketEncryption(profileId: string, bucket: string, req: BucketEncryptionPutRequest): Promise<void> {
			return bucketsDomain.putBucketEncryption(deps.requestFn, profileId, bucket, req)
		},
		putBucketLifecycle(profileId: string, bucket: string, req: BucketLifecyclePutRequest): Promise<void> {
			return bucketsDomain.putBucketLifecycle(deps.requestFn, profileId, bucket, req)
		},
		putBucketSharing(profileId: string, bucket: string, req: BucketSharingPutClientRequest): Promise<BucketSharingClientView> {
			return bucketsDomain.putBucketSharing(deps.requestFn, profileId, bucket, req)
		},
		getBucketPolicy(profileId: string, bucket: string): Promise<BucketPolicyResponse> {
			return bucketsDomain.getBucketPolicy(deps.requestFn, profileId, bucket)
		},
		putBucketPolicy(profileId: string, bucket: string, req: BucketPolicyPutRequest): Promise<void> {
			return bucketsDomain.putBucketPolicy(deps.requestFn, profileId, bucket, req)
		},
		deleteBucketPolicy(profileId: string, bucket: string): Promise<void> {
			return bucketsDomain.deleteBucketPolicy(deps.requestFn, profileId, bucket)
		},
		validateBucketPolicy(profileId: string, bucket: string, req: BucketPolicyPutRequest): Promise<BucketPolicyValidateResponse> {
			return bucketsDomain.validateBucketPolicy(deps.requestFn, profileId, bucket, req)
		},
	}
}

export function createObjectsSubFacade(deps: SubFacadeDeps) {
	return {
		listObjects(args: {
			profileId: string
			bucket: string
			prefix?: string
			delimiter?: string
			maxKeys?: number
			continuationToken?: string
		}): Promise<ListObjectsResponse> {
			return objectsDomain.listObjects(deps.requestFn, args)
		},
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
			return objectsDomain.searchObjectsIndex(deps.requestFn, args)
		},
		getObjectIndexSummary(args: {
			profileId: string
			bucket: string
			prefix?: string
			sampleLimit?: number
		}): Promise<ObjectIndexSummaryResponse> {
			return objectsDomain.getObjectIndexSummary(deps.requestFn, args)
		},
		listLocalEntries(args: { profileId: string; path?: string; limit?: number }): Promise<ListLocalEntriesResponse> {
			return objectsDomain.listLocalEntries(deps.requestFn, args)
		},
		getObjectMeta(args: { profileId: string; bucket: string; key: string }): Promise<ObjectMeta> {
			return objectsDomain.getObjectMeta(deps.requestFn, args)
		},
		getObjectDownloadURL(args: {
			profileId: string
			bucket: string
			key: string
			expiresSeconds?: number
			proxy?: boolean
			size?: number
			contentType?: string
			lastModified?: string
		}): Promise<PresignedURLResponse> {
			return objectsDomain.getObjectDownloadURL(deps.requestFn, args)
		},
		createFolder(args: { profileId: string; bucket: string; key: string }): Promise<CreateFolderResponse> {
			return objectsDomain.createFolder(deps.requestFn, args)
		},
		deleteObjects(args: { profileId: string; bucket: string; keys: string[] }): Promise<DeleteObjectsResponse> {
			return objectsDomain.deleteObjects(deps.requestFn, args)
		},
		listObjectFavorites(args: { profileId: string; bucket: string; prefix?: string; hydrate?: boolean }): Promise<ObjectFavoritesResponse> {
			return objectsDomain.listObjectFavorites(deps.requestFn, args)
		},
		createObjectFavorite(args: { profileId: string; bucket: string; key: string }): Promise<ObjectFavorite> {
			return objectsDomain.createObjectFavorite(deps.requestFn, args)
		},
		deleteObjectFavorite(args: { profileId: string; bucket: string; key: string }): Promise<void> {
			return objectsDomain.deleteObjectFavorite(deps.requestFn, args)
		},
		downloadObject(
			args: { profileId: string; bucket: string; key: string },
			opts: { onProgress?: (progress: { loadedBytes: number; totalBytes?: number }) => void } = {},
		): { promise: Promise<{ blob: Blob; contentDisposition: string | null; contentType: string | null }>; abort: () => void } {
			return downloadsDomain.downloadObject(deps.getXhrConfig(), args, opts)
		},
		downloadObjectStream(args: { profileId: string; bucket: string; key: string; signal?: AbortSignal }): Promise<Response> {
			return downloadsDomain.downloadObjectStream(deps.fetchRawResponseFn, args)
		},
		downloadObjectThumbnail(args: {
			profileId: string
			bucket: string
			key: string
			size?: number
			objectSize?: number
			etag?: string
			lastModified?: string
			contentType?: string
		}): { promise: Promise<{ blob: Blob; contentType: string | null }>; abort: () => void } {
			return downloadsDomain.downloadObjectThumbnail(deps.getXhrConfig(), args)
		},
	}
}

export function createUploadsSubFacade(deps: SubFacadeDeps) {
	return {
		createUpload(profileId: string, req: UploadCreateRequest): Promise<UploadCreateResponse> {
			return uploadsDomain.createUpload(deps.requestFn, profileId, req)
		},
		presignUpload(profileId: string, uploadId: string, req: UploadPresignRequest): Promise<UploadPresignResponse> {
			return uploadsDomain.presignUpload(deps.requestFn, profileId, uploadId, req)
		},
		completeMultipartUpload(profileId: string, uploadId: string, req: UploadMultipartCompleteRequest): Promise<void> {
			return uploadsDomain.completeMultipartUpload(deps.requestFn, profileId, uploadId, req)
		},
		abortMultipartUpload(profileId: string, uploadId: string, req: UploadMultipartAbortRequest): Promise<void> {
			return uploadsDomain.abortMultipartUpload(deps.requestFn, profileId, uploadId, req)
		},
		uploadFiles(profileId: string, uploadId: string, files: UploadFileItem[]): Promise<void> {
			return uploadsDomain.uploadFiles(deps.requestFn, profileId, uploadId, files)
		},
		commitUpload(profileId: string, uploadId: string, req?: UploadCommitRequest): Promise<JobCreatedResponse> {
			return uploadsDomain.commitUpload(deps.requestFn, profileId, uploadId, req)
		},
		deleteUpload(profileId: string, uploadId: string): Promise<void> {
			return uploadsDomain.deleteUpload(deps.requestFn, profileId, uploadId)
		},
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
			return uploadsDomain.uploadFilesWithProgress(deps.getXhrConfig(), profileId, uploadId, files, args)
		},
		getUploadChunks(
			profileId: string,
			uploadId: string,
			args: { path: string; total: number; chunkSize: number; fileSize: number },
		): Promise<UploadChunkState> {
			return uploadsDomain.getUploadChunks(deps.requestFn, profileId, uploadId, args)
		},
	}
}

export function createJobsSubFacade(deps: SubFacadeDeps) {
	return {
		listJobs(
			profileId: string,
			args: { status?: string; type?: string; errorCode?: string; limit?: number; cursor?: string } = {},
		): Promise<JobsListResponse> {
			return jobsDomain.listJobs(deps.requestFn, profileId, args)
		},
		createJob(profileId: string, req: JobCreateRequest): Promise<Job> {
			return jobsDomain.createJob(deps.requestFn, profileId, req)
		},
		getJob(profileId: string, jobId: string): Promise<Job> {
			return jobsDomain.getJob(deps.requestFn, profileId, jobId)
		},
		deleteJob(profileId: string, jobId: string): Promise<void> {
			return jobsDomain.deleteJob(deps.requestFn, profileId, jobId)
		},
		getJobLogs(profileId: string, jobId: string, tailBytes = 64 * 1024): Promise<string> {
			return jobsDomain.getJobLogs(deps.requestFn, profileId, jobId, tailBytes)
		},
		getJobLogsTail(profileId: string, jobId: string, tailBytes = 64 * 1024): Promise<{ text: string; nextOffset: number }> {
			return jobsDomain.getJobLogsTail(deps.fetchResponseFn, profileId, jobId, tailBytes)
		},
		getJobLogsAfterOffset(
			profileId: string,
			jobId: string,
			afterOffset: number,
			maxBytes = 64 * 1024,
		): Promise<{ text: string; nextOffset: number }> {
			return jobsDomain.getJobLogsAfterOffset(deps.fetchResponseFn, profileId, jobId, afterOffset, maxBytes)
		},
		cancelJob(profileId: string, jobId: string): Promise<Job> {
			return jobsDomain.cancelJob(deps.requestFn, profileId, jobId)
		},
		retryJob(profileId: string, jobId: string): Promise<Job> {
			return jobsDomain.retryJob(deps.requestFn, profileId, jobId)
		},
		downloadJobArtifact(
			args: { profileId: string; jobId: string },
			opts: { onProgress?: (progress: { loadedBytes: number; totalBytes?: number }) => void } = {},
		): { promise: Promise<{ blob: Blob; contentDisposition: string | null; contentType: string | null }>; abort: () => void } {
			return downloadsDomain.downloadJobArtifact(deps.getXhrConfig(), args, opts)
		},
	}
}
